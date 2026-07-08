"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { inputClass } from "@/components/FormField";

/*
  AR Ageing report: for every customer with unpaid/partial invoices, bucket
  each invoice's outstanding amount by how many days past due it is (as of the
  chosen date), then show one row per customer plus a grand-total row.
  Read-only, printable — no writes to the backend.
*/

type Bucket = "notDue" | "d0_30" | "d31_60" | "d61_90" | "d90plus";

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "notDue", label: "Not Due" },
  { key: "d0_30", label: "0–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90plus", label: "90+ days" },
];

interface CustomerRow {
  customerId: string;
  code: string;
  name: string;
  buckets: Record<Bucket, number>;
  total: number;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function money(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysBetween(asOf: string, dueDate: string) {
  const a = new Date(asOf + "T00:00:00");
  const d = new Date(dueDate + "T00:00:00");
  return Math.round((a.getTime() - d.getTime()) / 86400000);
}

function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "notDue";
  if (daysPastDue <= 30) return "d0_30";
  if (daysPastDue <= 60) return "d31_60";
  if (daysPastDue <= 90) return "d61_90";
  return "d90plus";
}

function emptyBuckets(): Record<Bucket, number> {
  return { notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
}

export default function AgeingReportPage() {
  const [asOf, setAsOf] = useState(todayISO());
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: invoices, error: invErr } = await supabase!
        .from("invoices")
        .select("id, total, due_date, customer_id, status, customers(id, code, name)")
        .in("status", ["open", "partial", "overdue"]);

      if (invErr) {
        if (!cancelled) {
          setError(invErr.message);
          setLoading(false);
        }
        return;
      }

      const invoiceIds = (invoices ?? []).map((i) => i.id);
      let allocatedByInvoice = new Map<string, number>();

      if (invoiceIds.length > 0) {
        const { data: allocations, error: allocErr } = await supabase!
          .from("receipt_allocations")
          .select("invoice_id, amount")
          .in("invoice_id", invoiceIds);

        if (allocErr) {
          if (!cancelled) {
            setError(allocErr.message);
            setLoading(false);
          }
          return;
        }

        allocatedByInvoice = new Map();
        for (const a of allocations ?? []) {
          allocatedByInvoice.set(a.invoice_id, (allocatedByInvoice.get(a.invoice_id) ?? 0) + Number(a.amount));
        }
      }

      const byCustomer = new Map<string, CustomerRow>();

      for (const inv of invoices ?? []) {
        const outstanding = Number(inv.total) - (allocatedByInvoice.get(inv.id) ?? 0);
        if (outstanding <= 0.005) continue;

        const customer = (inv as unknown as { customers: { id: string; code: string; name: string } | null }).customers;
        if (!customer) continue;

        const bucket = bucketFor(daysBetween(asOf, inv.due_date));

        let row = byCustomer.get(customer.id);
        if (!row) {
          row = { customerId: customer.id, code: customer.code, name: customer.name, buckets: emptyBuckets(), total: 0 };
          byCustomer.set(customer.id, row);
        }
        row.buckets[bucket] += outstanding;
        row.total += outstanding;
      }

      const sorted = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
      if (!cancelled) {
        setRows(sorted);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  const grandTotal = useMemo(() => {
    const g = emptyBuckets();
    let total = 0;
    for (const r of rows) {
      for (const b of BUCKETS) g[b.key] += r.buckets[b.key];
      total += r.total;
    }
    return { buckets: g, total };
  }, [rows]);

  if (!isConfigured) {
    return (
      <>
        <PageHeader title="AR Ageing" subtitle="Outstanding invoices, bucketed by days overdue." />
        <NotConfigured />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AR Ageing"
        subtitle="Outstanding invoices as of the selected date, bucketed by days overdue."
        action={
          <div className="flex items-end gap-3 print:hidden">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">As of</span>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Print
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load the ageing report: {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
          Loading ageing report…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
          Nothing outstanding — every invoice is paid up as of {asOf}.
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {BUCKETS.map((b) => (
              <div key={b.key} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{b.label}</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{money(grandTotal.buckets[b.key])}</p>
              </div>
            ))}
            <div className="rounded-xl border border-brand bg-brand/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Total Outstanding</p>
              <p className="mt-2 text-lg font-bold text-brand-dark">{money(grandTotal.total)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Customer</th>
                  {BUCKETS.map((b) => (
                    <th key={b.key} className="px-4 py-3 text-right font-semibold text-slate-600">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customerId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">
                      <span className="font-medium text-slate-900">{r.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{r.code}</span>
                    </td>
                    {BUCKETS.map((b) => (
                      <td
                        key={b.key}
                        className={`px-4 py-3 text-right tabular-nums ${
                          b.key === "d90plus" && r.buckets[b.key] > 0 ? "font-medium text-red-600" : "text-slate-700"
                        }`}
                      >
                        {r.buckets[b.key] > 0 ? money(r.buckets[b.key]) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {money(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">Grand Total</td>
                  {BUCKETS.map((b) => (
                    <td key={b.key} className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                      {money(grandTotal.buckets[b.key])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-brand-dark">
                    {money(grandTotal.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </>
  );
}
