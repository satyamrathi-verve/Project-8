"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
import { inputClass } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";

/*
  Invoice List: every invoice, newest first, with status/customer filters and
  date sorting. Invoice No. links to the read-only view (screen 5), which links
  on to edit (screen 6); the printer icon jumps straight to print preview (screen 7).

  Taxable Amount / Tax / Gross Amount are derived from the three numeric
  columns the `invoices` table actually has (subtotal, tax_amount, total) —
  no new columns needed:
    Tax            = tax_amount (stored)
    Taxable Amount = total - tax_amount   (post-discount base the tax was computed on)
    Gross Amount   = total                (Taxable Amount + Tax, by construction)

  Draft and Void are only usable once the invoices.status CHECK constraint has
  been widened in Supabase (see the migration SQL shared alongside this
  change) — updating a row to either value before that runs will fail with a
  clear Postgres error, which the actions menu below surfaces inline.
*/

interface InvoiceRow extends Invoice {
  customer_name: string;
  customer_code: string;
  customer_email: string;
  remaining: number;
  taxable: number;
  gross: number;
}

type SortKey =
  | "invoice_no"
  | "invoice_date"
  | "due_date"
  | "customer_name"
  | "taxable"
  | "tax_amount"
  | "gross"
  | "remaining"
  | "status";

const STATUS_CHIPS: (InvoiceStatus | "all")[] = ["all", "draft", "open", "partial", "paid", "overdue", "void"];
const STATUS_OPTIONS: (InvoiceStatus | "all")[] = ["all", "draft", "open", "partial", "paid", "overdue", "void"];

function statusLabel(s: InvoiceStatus | "all") {
  return s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1);
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function InvoiceListPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // ---- existing filters (preserved) -----------------------------------
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [customerFilter, setCustomerFilter] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sortKey, setSortKey] = useState<SortKey>("invoice_date");

  // ---- new lightweight column filters -----------------------------------
  const [invoiceNoFilter, setInvoiceNoFilter] = useState("");
  const [customerColumnFilter, setCustomerColumnFilter] = useState("");
  const [invoiceDateMode, setInvoiceDateMode] = useState<"any" | "exact" | "before" | "after">("any");
  const [invoiceDateValue, setInvoiceDateValue] = useState("");
  const [dueDateMode, setDueDateMode] = useState<"any" | "exact" | "before" | "after">("any");
  const [dueDateValue, setDueDateValue] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const [menuAnchor, setMenuAnchor] = useState<{ id: string; top: number; left: number } | null>(null);

  async function loadInvoices() {
    if (!supabase) return;
    setLoading(true);
    setError(null);

    const [{ data: invoices, error: invErr }, { data: allocations, error: allocErr }] = await Promise.all([
      supabase
        .from("invoices")
        .select("*, customers(name, code, email)")
        .order("invoice_date", { ascending: false }),
      supabase.from("receipt_allocations").select("invoice_id, amount"),
    ]);

    if (invErr) setError(invErr.message);
    if (allocErr) setError(allocErr.message);

    if (invoices) {
      const allocatedByInvoice = new Map<string, number>();
      (allocations ?? []).forEach((a) => {
        allocatedByInvoice.set(a.invoice_id, (allocatedByInvoice.get(a.invoice_id) ?? 0) + a.amount);
      });

      const mapped: InvoiceRow[] = (
        invoices as unknown as (Invoice & {
          customers: { name: string; code: string; email: string | null } | null;
        })[]
      ).map((inv) => ({
        ...inv,
        customer_name: inv.customers?.name ?? "—",
        customer_code: inv.customers?.code ?? "",
        customer_email: inv.customers?.email ?? "",
        remaining: inv.total - (allocatedByInvoice.get(inv.id) ?? 0),
        taxable: inv.total - inv.tax_amount,
        gross: inv.total,
      }));
      setRows(mapped);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (isConfigured) loadInvoices();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every filter except status — used both for the main table and for the
  // status chip counts, so a chip's count reflects the other active filters.
  const preStatusFiltered = useMemo(() => {
    let list = rows;

    if (customerFilter.trim()) {
      const q = customerFilter.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.invoice_no.toLowerCase().includes(q) ||
          r.customer_code.toLowerCase().includes(q) ||
          r.customer_email.toLowerCase().includes(q)
      );
    }
    if (invoiceNoFilter.trim()) {
      const q = invoiceNoFilter.trim().toLowerCase();
      list = list.filter((r) => r.invoice_no.toLowerCase().includes(q));
    }
    if (customerColumnFilter.trim()) {
      const q = customerColumnFilter.trim().toLowerCase();
      list = list.filter((r) => r.customer_name.toLowerCase().includes(q));
    }
    if (invoiceDateMode !== "any" && invoiceDateValue) {
      list = list.filter((r) => {
        if (invoiceDateMode === "exact") return r.invoice_date === invoiceDateValue;
        if (invoiceDateMode === "before") return r.invoice_date < invoiceDateValue;
        return r.invoice_date > invoiceDateValue;
      });
    }
    if (dueDateMode !== "any" && dueDateValue) {
      list = list.filter((r) => {
        if (dueDateMode === "exact") return r.due_date === dueDateValue;
        if (dueDateMode === "before") return r.due_date < dueDateValue;
        return r.due_date > dueDateValue;
      });
    }
    if (amountMin.trim()) {
      const min = Number(amountMin);
      list = list.filter((r) => r.gross >= min);
    }
    if (amountMax.trim()) {
      const max = Number(amountMax);
      list = list.filter((r) => r.gross <= max);
    }
    return list;
  }, [
    rows,
    customerFilter,
    invoiceNoFilter,
    customerColumnFilter,
    invoiceDateMode,
    invoiceDateValue,
    dueDateMode,
    dueDateValue,
    amountMin,
    amountMax,
  ]);

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = { all: preStatusFiltered.length };
    for (const s of STATUS_CHIPS) {
      if (s === "all") continue;
      counts[s] = preStatusFiltered.filter((r) => r.status === s).length;
    }
    return counts;
  }, [preStatusFiltered]);

  const filtered = useMemo(() => {
    let list = preStatusFiltered;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "invoice_no":
          return dir * a.invoice_no.localeCompare(b.invoice_no);
        case "customer_name":
          return dir * a.customer_name.localeCompare(b.customer_name);
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "due_date":
          return dir * (new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        case "taxable":
          return dir * (a.taxable - b.taxable);
        case "tax_amount":
          return dir * (a.tax_amount - b.tax_amount);
        case "gross":
          return dir * (a.gross - b.gross);
        case "remaining":
          return dir * (a.remaining - b.remaining);
        case "invoice_date":
        default:
          return dir * (new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime());
      }
    });
  }, [preStatusFiltered, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function exportCsv() {
    const header = [
      "Invoice Number",
      "Invoice Date",
      "Due Date",
      "Customer",
      "Taxable Amount",
      "Tax",
      "Gross Amount",
      "Amount Remaining",
      "Status",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.invoice_no,
          r.invoice_date,
          r.due_date,
          r.customer_name,
          r.taxable.toFixed(2),
          r.tax_amount.toFixed(2),
          r.gross.toFixed(2),
          Math.max(r.remaining, 0).toFixed(2),
          r.status,
        ]
          .map(csvCell)
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function updateStatus(id: string, next: InvoiceStatus) {
    if (!supabase) return;
    setActionBusyId(id);
    setActionError(null);
    setMenuAnchor(null);
    const { error } = await supabase.from("invoices").update({ status: next }).eq("id", id);
    if (error) {
      setActionError(
        next === "void" || next === "draft"
          ? `Couldn't set status to "${next}" — run the status migration SQL in Supabase first, then try again. (${error.message})`
          : error.message
      );
    } else {
      await loadInvoices();
    }
    setActionBusyId(null);
  }

  async function duplicateInvoice(row: InvoiceRow) {
    if (!supabase) return;
    setActionBusyId(row.id);
    setActionError(null);
    setMenuAnchor(null);

    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", row.id);

    const { data: created, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        invoice_no: `${row.invoice_no}-COPY-${Date.now().toString().slice(-4)}`,
        invoice_date: new Date().toISOString().slice(0, 10),
        customer_id: row.customer_id,
        due_date: row.due_date,
        subtotal: row.subtotal,
        tax_amount: row.tax_amount,
        total: row.total,
        status: "open",
        notes: row.notes,
      })
      .select("id")
      .single();

    if (insertErr || !created) {
      setActionError(insertErr?.message ?? "Could not duplicate invoice.");
      setActionBusyId(null);
      return;
    }

    if (items && items.length > 0) {
      await supabase.from("invoice_items").insert(
        items.map((it) => ({
          invoice_id: created.id,
          description: it.description,
          qty: it.qty,
          rate: it.rate,
          amount: it.amount,
        }))
      );
    }

    setActionBusyId(null);
    await loadInvoices();
  }

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoice_no",
      header: "Invoice No.",
      onHeaderClick: () => toggleSort("invoice_no"),
      sortDirection: sortKey === "invoice_no" ? sortDir : undefined,
      render: (r) => (
        <Link href={`/invoices/${r.id}`} className="font-medium text-brand hover:underline">
          {r.invoice_no}
        </Link>
      ),
    },
    {
      key: "invoice_date",
      header: "Invoice Date",
      onHeaderClick: () => toggleSort("invoice_date"),
      sortDirection: sortKey === "invoice_date" ? sortDir : undefined,
      render: (r) => formatDate(r.invoice_date),
    },
    {
      key: "due_date",
      header: "Due Date",
      onHeaderClick: () => toggleSort("due_date"),
      sortDirection: sortKey === "due_date" ? sortDir : undefined,
      render: (r) => formatDate(r.due_date),
    },
    {
      key: "customer_name",
      header: "Customer",
      onHeaderClick: () => toggleSort("customer_name"),
      sortDirection: sortKey === "customer_name" ? sortDir : undefined,
    },
    {
      key: "taxable",
      header: "Taxable Amount",
      onHeaderClick: () => toggleSort("taxable"),
      sortDirection: sortKey === "taxable" ? sortDir : undefined,
      render: (r) => formatCurrency(r.taxable),
    },
    {
      key: "tax_amount",
      header: "Tax",
      onHeaderClick: () => toggleSort("tax_amount"),
      sortDirection: sortKey === "tax_amount" ? sortDir : undefined,
      render: (r) => formatCurrency(r.tax_amount),
    },
    {
      key: "gross",
      header: "Gross Amount",
      className: "font-medium",
      onHeaderClick: () => toggleSort("gross"),
      sortDirection: sortKey === "gross" ? sortDir : undefined,
      render: (r) => formatCurrency(r.gross),
    },
    {
      key: "remaining",
      header: "Amount Remaining",
      onHeaderClick: () => toggleSort("remaining"),
      sortDirection: sortKey === "remaining" ? sortDir : undefined,
      render: (r) => (r.status === "paid" ? "—" : formatCurrency(Math.max(r.remaining, 0))),
    },
    {
      key: "status",
      header: "Status",
      onHeaderClick: () => toggleSort("status"),
      sortDirection: sortKey === "status" ? sortDir : undefined,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/invoices/${r.id}/print`}
            title="Print preview"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:border-brand hover:text-brand"
          >
            🖨️
          </Link>
          <button
            type="button"
            disabled={actionBusyId === r.id}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuAnchor(menuAnchor?.id === r.id ? null : { id: r.id, top: rect.bottom + 4, left: rect.right - 176 });
            }}
            title="More actions"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:border-brand hover:text-brand disabled:opacity-40"
          >
            ⋮
          </button>
        </div>
      ),
    },
  ];

  const activeRow = rows.find((r) => r.id === menuAnchor?.id) ?? null;

  const totalInvoices = rows.length;
  const overdueCount = rows.filter((r) => r.status === "overdue").length;
  const totalOutstanding = rows.reduce((sum, r) => sum + Math.max(r.remaining, 0), 0);

  return (
    <>
      <PageHeader
        title="Sales Invoices"
        subtitle="Every invoice raised. Search, filter, and jump into any invoice."
        action={
          isConfigured && (
            <div className="flex gap-3">
              <button
                onClick={exportCsv}
                disabled={filtered.length === 0}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Export CSV
              </button>
              <Link
                href="/invoices/new"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                ➕ New Invoice
              </Link>
            </div>
          )
        }
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {actionError && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {actionError}
        </div>
      )}

      {isConfigured && !loading && (
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Invoices</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalInvoices}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Overdue</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{overdueCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(totalOutstanding)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Showing</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {filtered.length} <span className="text-sm font-medium text-slate-400">of {rows.length}</span>
            </p>
          </div>
        </div>
      )}

      {isConfigured && (
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_CHIPS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                }`}
              >
                {statusLabel(s)} ({chipCounts[s] ?? 0})
              </button>
            );
          })}
        </div>
      )}

      {isConfigured && (
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
            <select
              className={inputClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "all")}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Search</span>
            <input
              className={inputClass}
              placeholder="Invoice #, customer, code, or email…"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice No.</span>
            <input
              className={inputClass}
              placeholder="Filter invoice #…"
              value={invoiceNoFilter}
              onChange={(e) => setInvoiceNoFilter(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</span>
            <input
              className={inputClass}
              placeholder="Filter customer…"
              value={customerColumnFilter}
              onChange={(e) => setCustomerColumnFilter(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice Date</span>
            <select
              className={inputClass}
              value={invoiceDateMode}
              onChange={(e) => setInvoiceDateMode(e.target.value as typeof invoiceDateMode)}
            >
              <option value="any">Any</option>
              <option value="exact">On</option>
              <option value="before">Before</option>
              <option value="after">After</option>
            </select>
          </label>
          {invoiceDateMode !== "any" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Date</span>
              <input
                type="date"
                className={inputClass}
                value={invoiceDateValue}
                onChange={(e) => setInvoiceDateValue(e.target.value)}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Due Date</span>
            <select
              className={inputClass}
              value={dueDateMode}
              onChange={(e) => setDueDateMode(e.target.value as typeof dueDateMode)}
            >
              <option value="any">Any</option>
              <option value="exact">On</option>
              <option value="before">Before</option>
              <option value="after">After</option>
            </select>
          </label>
          {dueDateMode !== "any" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Date</span>
              <input
                type="date"
                className={inputClass}
                value={dueDateValue}
                onChange={(e) => setDueDateValue(e.target.value)}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount Min</span>
            <input
              type="number"
              className={`${inputClass} w-28`}
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount Max</span>
            <input
              type="number"
              className={`${inputClass} w-28`}
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
            />
          </label>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 shadow-sm">
          Loading invoices…
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">
            {filtered.length === rows.length
              ? `Showing ${rows.length} invoice${rows.length === 1 ? "" : "s"}`
              : `Showing ${filtered.length} of ${rows.length} invoices`}
          </p>
          <DataTable columns={columns} rows={filtered} empty="No invoices match — try a different filter." />
        </>
      )}

      {menuAnchor && activeRow && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuAnchor(null)} />
          <div
            className="fixed z-50 w-44 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
            style={{ top: menuAnchor.top, left: Math.max(menuAnchor.left, 8) }}
          >
            <Link
              href={`/invoices/${activeRow.id}`}
              className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              onClick={() => setMenuAnchor(null)}
            >
              View
            </Link>
            <Link
              href={`/invoices/${activeRow.id}/edit`}
              className="block px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              onClick={() => setMenuAnchor(null)}
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => duplicateInvoice(activeRow)}
              className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
            >
              Duplicate
            </button>
            <button
              type="button"
              disabled
              title="Coming soon — use Print instead"
              className="block w-full cursor-not-allowed px-3 py-1.5 text-left text-slate-300"
            >
              Download PDF
            </button>
            <button
              type="button"
              disabled={activeRow.status === "paid"}
              onClick={() => updateStatus(activeRow.id, "paid")}
              className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Mark as Paid
            </button>
            <button
              type="button"
              disabled={activeRow.status === "void"}
              onClick={() => updateStatus(activeRow.id, "void")}
              className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Void Invoice
            </button>
          </div>
        </>
      )}
    </>
  );
}
