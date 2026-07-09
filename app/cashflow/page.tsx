"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase, isConfigured } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { StatTile } from "@/components/StatTile";
import { DataTable, type Column } from "@/components/DataTable";
import { inputClass } from "@/components/FormField";
import { formatCurrency, formatDate, isUnpaid, outstandingAmount, statusStyle, todayStr } from "@/lib/ar";
import type { Invoice, ReceiptAllocation } from "@/lib/types";

function formatCompact(amount: number): string {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs >= 10 ? lakhs.toFixed(1) : lakhs.toFixed(2)}L`.replace(/\.?0+L$/, "L");
  }
  return formatCurrency(amount);
}

function InflowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-950">{point.label}</p>
      <p className="flex items-center gap-2 text-slate-600">
        <span className="h-2 w-2 rounded-full" style={{ background: point.isPast ? "#e11d48" : "#2f6bff" }} />
        Expected inflow: <span className="font-semibold text-slate-950">{formatCompact(point.value)}</span>
      </p>
      <p className="mt-1 text-slate-400">{point.invoiceCount} invoice{point.invoiceCount === 1 ? "" : "s"} due{point.isPast ? " · overdue" : ""}</p>
    </div>
  );
}

type InvoiceRow = Invoice & { customers: { name: string } | null; outstanding: number };

interface WeekBucket {
  key: string;
  start: Date;
  end: Date;
  invoices: InvoiceRow[];
  computed: number;
}

function mondayOf(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function weekLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function CashflowPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setLoading(false);
      return;
    }

    async function load() {
      const { data: invoiceData, error: invoiceError } = await supabase!
        .from("invoices")
        .select("*, customers(name)")
        .in("status", ["open", "partial", "overdue"])
        .order("due_date", { ascending: true });

      if (invoiceError || !invoiceData) {
        setLoading(false);
        return;
      }

      const ids = invoiceData.map((i) => i.id);
      const { data: allocationData } = await supabase!
        .from("receipt_allocations")
        .select("id, receipt_id, invoice_id, amount")
        .in("invoice_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

      const allocations = (allocationData ?? []) as ReceiptAllocation[];

      const rows: InvoiceRow[] = (invoiceData as (Invoice & { customers: { name: string } | null })[])
        .map((inv) => ({ ...inv, outstanding: outstandingAmount(inv, allocations) }))
        .filter((inv) => inv.outstanding > 0 && isUnpaid(inv));

      setInvoices(rows);
      setLoading(false);
    }

    load();
  }, []);

  const weeks = useMemo<WeekBucket[]>(() => {
    const map = new Map<string, WeekBucket>();
    for (const inv of invoices) {
      const start = mondayOf(inv.due_date);
      const key = start.toISOString().slice(0, 10);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      if (!map.has(key)) {
        map.set(key, { key, start, end, invoices: [], computed: 0 });
      }
      const bucket = map.get(key)!;
      bucket.invoices.push(inv);
      bucket.computed += inv.outstanding;
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [invoices]);

  const totalComputed = weeks.reduce((sum, w) => sum + w.computed, 0);
  const totalAdjusted = weeks.reduce((sum, w) => sum + (adjustments[w.key] ?? w.computed), 0);
  const maxAmount = Math.max(1, ...weeks.map((w) => adjustments[w.key] ?? w.computed));
  const today = todayStr();

  const chartData = weeks.map((w) => {
    const isPast = w.end.toISOString().slice(0, 10) < today;
    return {
      key: w.key,
      label: weekLabel(w.start, w.end),
      value: adjustments[w.key] ?? w.computed,
      invoiceCount: w.invoices.length,
      isPast,
    };
  });

  const detailColumns: Column<InvoiceRow>[] = [
    { key: "invoice_no", header: "Invoice #" },
    { key: "customer", header: "Customer", render: (r) => r.customers?.name ?? "—" },
    { key: "due_date", header: "Due Date", render: (r) => formatDate(r.due_date) },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const s = statusStyle(r.status);
        return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
      },
    },
    { key: "outstanding", header: "Outstanding", className: "text-right", render: (r) => formatCurrency(r.outstanding) },
  ];

  return (
    <>
      <PageHeader
        title="Cashflow Projection"
        subtitle="Expected collections from open invoices, grouped by the week they're due. Adjust any week's expected amount below."
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      {isConfigured && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile label="Total Outstanding (Open)" value={formatCurrency(totalComputed)} tone="brand" />
            <StatTile label="Adjusted Expected" value={formatCurrency(totalAdjusted)} tone="default" />
            <StatTile label="Weeks Covered" value={String(weeks.length)} subtitle="With at least one due invoice" />
          </div>

          {!loading && chartData.length > 0 && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Weekly Inflow Forecast</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Adjusted expected collections, grouped by due week</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Overdue
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-brand" /> Upcoming
                  </span>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#eef2f7" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} width={56} />
                    <Tooltip content={<InflowTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
                    <Bar dataKey="value" radius={[6, 6, 2, 2]} maxBarSize={40} isAnimationActive>
                      {chartData.map((point) => (
                        <Cell key={point.key} fill={point.isPast ? "#e11d48" : "#2f6bff"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-400">Loading projection…</p>
          ) : weeks.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
              No open invoices to project.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-3 font-semibold text-slate-600">Week</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Invoices</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Computed</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Adjusted</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Split</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => {
                    const isPast = w.end.toISOString().slice(0, 10) < today;
                    const adjustedValue = adjustments[w.key] ?? w.computed;
                    const barPct = Math.round((adjustedValue / maxAmount) * 100);
                    return (
                      <Fragment key={w.key}>
                        <tr
                          className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                          onClick={() => setExpanded(expanded === w.key ? null : w.key)}
                        >
                          <td className="px-4 py-3 text-slate-700">
                            {weekLabel(w.start, w.end)}
                            {isPast && (
                              <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">
                                Overdue
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{w.invoices.length}</td>
                          <td className="px-4 py-3 text-slate-700">{formatCurrency(w.computed)}</td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              className={`${inputClass} w-32`}
                              value={adjustedValue}
                              onChange={(e) =>
                                setAdjustments((prev) => ({ ...prev, [w.key]: Number(e.target.value) }))
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                            </div>
                          </td>
                        </tr>
                        {expanded === w.key && (
                          <tr key={`${w.key}-detail`}>
                            <td colSpan={5} className="bg-slate-50 px-4 py-4">
                              <DataTable columns={detailColumns} rows={w.invoices} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
