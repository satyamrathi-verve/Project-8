"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { isConfigured, supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import type { Customer, Invoice, InvoiceStatus, ReceiptMode } from "@/lib/types";

/*
  Collections — Receipt Entry. Punch a receipt against one customer, allocate it
  across one or more of that customer's open invoices, and knock down each
  invoice's outstanding. An invoice flips to "paid" once fully settled.
*/

type OpenInvoice = Invoice & { outstanding: number };

type RecentReceipt = {
  id: string;
  receipt_no: string;
  receipt_date: string;
  amount: number;
  mode: ReceiptMode;
  reference: string | null;
  customers: { name: string } | null;
  receipt_allocations: { amount: number; invoices: { invoice_no: string } | null }[];
};

const MODES: { value: ReceiptMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "neft", label: "NEFT" },
];

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusBadge(status: InvoiceStatus | "overdue-live") {
  const styles: Record<string, string> = {
    open: "bg-slate-100 text-slate-600",
    partial: "bg-amber-100 text-amber-700",
    overdue: "bg-red-100 text-red-700",
    paid: "bg-emerald-100 text-emerald-700",
    "overdue-live": "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    open: "Open",
    partial: "Partial",
    overdue: "Overdue",
    paid: "Paid",
    "overdue-live": "Overdue",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[status]}`}>{label[status]}</span>
  );
}

function nextReceiptNo(last: string | null): string {
  if (!last) return "RCP-0001";
  const match = last.match(/(\d+)$/);
  if (!match) return "RCP-0001";
  const next = (parseInt(match[1], 10) + 1).toString().padStart(match[1].length, "0");
  return last.slice(0, last.length - match[1].length) + next;
}

export default function ReceiptEntryPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<RecentReceipt[]>([]);

  const [receiptNo, setReceiptNo] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<ReceiptMode>("neft");
  const [reference, setReference] = useState("");

  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadCustomers() {
    if (!supabase) return;
    const { data } = await supabase.from("customers").select("*").order("name");
    setCustomers(data ?? []);
  }

  async function loadNextReceiptNo() {
    if (!supabase) return;
    const { data } = await supabase
      .from("receipts")
      .select("receipt_no")
      .order("receipt_no", { ascending: false })
      .limit(1);
    setReceiptNo(nextReceiptNo(data?.[0]?.receipt_no ?? null));
  }

  async function loadRecentReceipts() {
    if (!supabase) return;
    const { data } = await supabase
      .from("receipts")
      .select("*, customers(name), receipt_allocations(amount, invoices(invoice_no))")
      .order("receipt_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);
    setRecentReceipts((data as unknown as RecentReceipt[]) ?? []);
  }

  useEffect(() => {
    loadCustomers();
    loadNextReceiptNo();
    loadRecentReceipts();
  }, []);

  useEffect(() => {
    setAllocations({});
    if (!customerId || !supabase) {
      setOpenInvoices([]);
      return;
    }
    let cancelled = false;
    setLoadingInvoices(true);
    (async () => {
      const { data: invoices } = await supabase!
        .from("invoices")
        .select("*")
        .eq("customer_id", customerId)
        .in("status", ["open", "partial", "overdue"])
        .order("due_date", { ascending: true });

      const invoiceIds = (invoices ?? []).map((inv) => inv.id);
      let allocatedByInvoice: Record<string, number> = {};
      if (invoiceIds.length > 0) {
        const { data: allocs } = await supabase!
          .from("receipt_allocations")
          .select("invoice_id, amount")
          .in("invoice_id", invoiceIds);
        allocatedByInvoice = (allocs ?? []).reduce((acc, a) => {
          acc[a.invoice_id] = (acc[a.invoice_id] ?? 0) + Number(a.amount);
          return acc;
        }, {} as Record<string, number>);
      }

      if (cancelled) return;
      const withOutstanding: OpenInvoice[] = (invoices ?? [])
        .map((inv) => ({ ...inv, outstanding: Number(inv.total) - (allocatedByInvoice[inv.id] ?? 0) }))
        .filter((inv) => inv.outstanding > 0.005);
      setOpenInvoices(withOutstanding);
      setLoadingInvoices(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const amountNum = parseFloat(amount) || 0;
  const totalAllocated = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (parseFloat(v) || 0), 0),
    [allocations]
  );
  const unallocated = amountNum - totalAllocated;

  function handleAllocationChange(invoiceId: string, value: string, outstanding: number) {
    const parsed = parseFloat(value);
    if (value !== "" && !Number.isNaN(parsed) && parsed > outstanding) {
      value = outstanding.toFixed(2);
    }
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  }

  function autoAllocate() {
    let remaining = amountNum;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (remaining <= 0) break;
      const take = Math.min(inv.outstanding, remaining);
      if (take > 0) {
        next[inv.id] = take.toFixed(2);
        remaining -= take;
      }
    }
    setAllocations(next);
  }

  function clearAllocations() {
    setAllocations({});
  }

  function resetForm() {
    setCustomerId("");
    setAmount("");
    setMode("neft");
    setReference("");
    setReceiptDate(todayISO());
    setAllocations({});
    setOpenInvoices([]);
    loadNextReceiptNo();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!supabase) return;
    if (!receiptNo.trim() || !receiptDate || !customerId || !mode) {
      setError("Fill in receipt number, date, customer and mode.");
      return;
    }
    if (amountNum <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (totalAllocated <= 0) {
      setError("Allocate the receipt to at least one invoice.");
      return;
    }
    if (totalAllocated > amountNum + 0.01) {
      setError("Allocated amount can't exceed the receipt amount.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: receipt, error: receiptErr } = await supabase
        .from("receipts")
        .insert({
          receipt_no: receiptNo.trim(),
          receipt_date: receiptDate,
          customer_id: customerId,
          amount: amountNum,
          mode,
          reference: reference.trim() || null,
        })
        .select()
        .single();

      if (receiptErr || !receipt) {
        throw new Error(receiptErr?.message ?? "Could not save the receipt.");
      }

      const allocationRows = openInvoices
        .map((inv) => ({ invoice: inv, amt: parseFloat(allocations[inv.id] || "0") }))
        .filter((a) => a.amt > 0)
        .map((a) => ({ receipt_id: receipt.id, invoice_id: a.invoice.id, amount: a.amt }));

      const { error: allocErr } = await supabase.from("receipt_allocations").insert(allocationRows);
      if (allocErr) throw new Error(allocErr.message);

      const today = todayISO();
      for (const inv of openInvoices) {
        const alloc = parseFloat(allocations[inv.id] || "0");
        if (alloc <= 0) continue;
        const newOutstanding = inv.outstanding - alloc;
        const newStatus: InvoiceStatus =
          newOutstanding <= 0.005 ? "paid" : inv.due_date < today ? "overdue" : "partial";
        const { error: statusErr } = await supabase
          .from("invoices")
          .update({ status: newStatus })
          .eq("id", inv.id);
        if (statusErr) throw new Error(statusErr.message);
      }

      setSuccess(`Receipt ${receiptNo.trim()} recorded — ${formatCurrency(totalAllocated)} allocated.`);
      resetForm();
      loadRecentReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const invoiceColumns: Column<OpenInvoice>[] = [
    { key: "invoice_no", header: "Invoice No" },
    { key: "invoice_date", header: "Date", render: (r) => formatDate(r.invoice_date) },
    {
      key: "due_date",
      header: "Due Date",
      render: (r) => (
        <span className={r.due_date < todayISO() ? "font-medium text-red-600" : ""}>{formatDate(r.due_date)}</span>
      ),
    },
    { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
    { key: "total", header: "Total", className: "text-right", render: (r) => formatCurrency(Number(r.total)) },
    {
      key: "outstanding",
      header: "Outstanding",
      className: "text-right",
      render: (r) => formatCurrency(r.outstanding),
    },
    {
      key: "allocate",
      header: "Allocate",
      className: "w-36",
      render: (r) => (
        <input
          type="number"
          min={0}
          max={r.outstanding}
          step="0.01"
          className={`${inputClass} w-32 py-1.5`}
          placeholder="0.00"
          value={allocations[r.id] ?? ""}
          onChange={(e) => handleAllocationChange(r.id, e.target.value, r.outstanding)}
        />
      ),
    },
  ];

  const recentColumns: Column<RecentReceipt>[] = [
    { key: "receipt_no", header: "Receipt No" },
    { key: "receipt_date", header: "Date", render: (r) => formatDate(r.receipt_date) },
    { key: "customer", header: "Customer", render: (r) => r.customers?.name ?? "—" },
    { key: "amount", header: "Amount", className: "text-right", render: (r) => formatCurrency(Number(r.amount)) },
    {
      key: "mode",
      header: "Mode",
      render: (r) => <span className="uppercase text-slate-600">{r.mode}</span>,
    },
    { key: "reference", header: "Reference", render: (r) => r.reference || "—" },
    {
      key: "allocated_to",
      header: "Allocated To",
      render: (r) =>
        r.receipt_allocations.length > 0
          ? r.receipt_allocations.map((a) => a.invoices?.invoice_no).filter(Boolean).join(", ")
          : "—",
    },
  ];

  if (!isConfigured) {
    return (
      <div className="p-6">
        <PageHeader title="Receipt Entry" subtitle="Record money received and knock it off open invoices." />
        <NotConfigured />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title="Receipt Entry" subtitle="Record money received and knock it off open invoices." />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Receipt Number">
              <input
                className={inputClass}
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
              />
            </FormField>
            <FormField label="Date">
              <input
                type="date"
                className={inputClass}
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </FormField>
            <FormField label="Customer">
              <select
                className={inputClass}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Amount">
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Mode">
              <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as ReceiptMode)}>
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Reference / Txn ID">
              <input
                className={inputClass}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque no., UPI ref…"
              />
            </FormField>
          </div>
        </div>

        {customerId && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Allocate against open invoices
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={autoAllocate}
                  disabled={amountNum <= 0 || openInvoices.length === 0}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
                >
                  Auto-allocate (oldest first)
                </button>
                <button
                  type="button"
                  onClick={clearAllocations}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            </div>

            {loadingInvoices ? (
              <p className="py-6 text-center text-sm text-slate-400">Loading invoices…</p>
            ) : (
              <DataTable
                columns={invoiceColumns}
                rows={openInvoices}
                empty="No open invoices for this customer — nothing to allocate."
              />
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-6 text-sm text-slate-600">
              <span>
                Receipt amount: <span className="font-semibold text-slate-900">{formatCurrency(amountNum)}</span>
              </span>
              <span>
                Allocated: <span className="font-semibold text-slate-900">{formatCurrency(totalAllocated)}</span>
              </span>
              <span className={unallocated < -0.005 ? "font-semibold text-red-600" : ""}>
                Unallocated: {formatCurrency(Math.max(unallocated, 0))}
              </span>
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? "Recording…" : "Record Receipt"}
          </button>
        </div>
      </form>

      <div className="mt-10">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Receipts</h3>
        <DataTable columns={recentColumns} rows={recentReceipts} empty="No receipts recorded yet." />
      </div>
    </div>
  );
}
