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
import type { Invoice, InvoiceStatus, ReceiptAllocation } from "@/lib/types";

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
      <p className="mt-1 text-slate-400">
        {point.invoiceCount} invoice{point.invoiceCount === 1 ? "" : "s"} due
        {point.isPast ? ` · ${point.overdueCount} overdue` : ""}
      </p>
    </div>
  );
}

type InvoiceRow = Invoice & { customers: { name: string } | null; outstanding: number };
type PeriodType = "week" | "month";

interface PeriodBucket {
  key: string;
  type: PeriodType;
  start: Date;
  end: Date;
  label: string;
  invoices: InvoiceRow[];
  computed: number;
}

interface SplitEntry {
  amount: number;
  date: string;
}

interface Filters {
  customerId: string;
  status: string;
  search: string;
  dueFrom: string;
  dueTo: string;
}

const DEFAULT_FILTERS: Filters = { customerId: "", status: "", search: "", dueFrom: "", dueTo: "" };

/*
  Notes/splits/adjustments are keyed "type:periodKey" so switching the
  Weekly/Monthly toggle never mixes up a week's data with a month's.
*/
function compositeKey(type: PeriodType, key: string): string {
  return `${type}:${key}`;
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

function monthBoundsOf(dateStr: string): { start: Date; end: Date; key: string; label: string } {
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return { start, end, key, label };
}

function bucketInvoices(invoices: InvoiceRow[], groupBy: PeriodType): PeriodBucket[] {
  const map = new Map<string, PeriodBucket>();
  for (const inv of invoices) {
    let start: Date, end: Date, key: string, label: string;
    if (groupBy === "week") {
      start = mondayOf(inv.due_date);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      key = start.toISOString().slice(0, 10);
      label = weekLabel(start, end);
    } else {
      const bounds = monthBoundsOf(inv.due_date);
      start = bounds.start;
      end = bounds.end;
      key = bounds.key;
      label = bounds.label;
    }
    if (!map.has(key)) {
      map.set(key, { key, type: groupBy, start, end, label, invoices: [], computed: 0 });
    }
    const bucket = map.get(key)!;
    bucket.invoices.push(inv);
    bucket.computed += inv.outstanding;
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function toCSV(rows: string[][]): string {
  return rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildExportRows(periods: PeriodBucket[], adjustments: Record<string, number>): string[][] {
  const header = ["Period", "Invoice Count", "Computed Amount", "Adjusted Amount", "Outstanding Amount", "Collection %", "Variance"];
  const rows = periods.map((p) => {
    const adjusted = adjustments[compositeKey(p.type, p.key)] ?? p.computed;
    const variance = adjusted - p.computed;
    const collectionPct = p.computed > 0 ? (adjusted / p.computed) * 100 : 0;
    return [
      p.label,
      String(p.invoices.length),
      p.computed.toFixed(2),
      adjusted.toFixed(2),
      p.computed.toFixed(2),
      `${collectionPct.toFixed(1)}%`,
      variance.toFixed(2),
    ];
  });
  return [header, ...rows];
}

/*
  These three tables (cashflow_period_adjustments/splits/notes) are additive —
  see the CREATE TABLE statements shared alongside this change. Until that SQL
  is run, every read/write below fails silently and the page falls back to
  local-state-only behavior, so nothing breaks for teammates who haven't
  migrated yet.
*/
async function persistAdjustment(type: PeriodType, key: string, amount: number) {
  if (!supabase) return;
  try {
    await supabase
      .from("cashflow_period_adjustments")
      .upsert({ period_type: type, period_key: key, adjusted_amount: amount, updated_at: new Date().toISOString() });
  } catch {
    // table not migrated yet — adjustment still applies locally for this session
  }
}

async function clearAdjustment(type: PeriodType, key: string) {
  if (!supabase) return;
  try {
    await supabase.from("cashflow_period_adjustments").delete().eq("period_type", type).eq("period_key", key);
  } catch {
    // ignore — see persistAdjustment
  }
}

async function persistSplits(type: PeriodType, key: string, entries: SplitEntry[]) {
  if (!supabase) return;
  try {
    await supabase.from("cashflow_period_splits").delete().eq("period_type", type).eq("period_key", key);
    if (entries.length) {
      await supabase
        .from("cashflow_period_splits")
        .insert(entries.map((e) => ({ period_type: type, period_key: key, amount: e.amount, expected_date: e.date })));
    }
  } catch {
    // ignore — see persistAdjustment
  }
}

async function persistNote(type: PeriodType, key: string, note: string) {
  if (!supabase) return;
  try {
    await supabase.from("cashflow_period_notes").delete().eq("period_type", type).eq("period_key", key);
    if (note.trim()) {
      await supabase.from("cashflow_period_notes").insert({ period_type: type, period_key: key, note: note.trim() });
    }
  } catch {
    // ignore — see persistAdjustment
  }
}

export default function CashflowPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<PeriodType>("week");
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [splits, setSplits] = useState<Record<string, SplitEntry[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [splitPanelKey, setSplitPanelKey] = useState<string | null>(null);
  const [splitDraft, setSplitDraft] = useState<SplitEntry[]>([]);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSavedKey, setNoteSavedKey] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

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

      try {
        const [adjRes, splitRes, noteRes] = await Promise.all([
          supabase!.from("cashflow_period_adjustments").select("period_type, period_key, adjusted_amount"),
          supabase!.from("cashflow_period_splits").select("period_type, period_key, amount, expected_date"),
          supabase!.from("cashflow_period_notes").select("period_type, period_key, note"),
        ]);

        if (adjRes.data) {
          const map: Record<string, number> = {};
          adjRes.data.forEach((r: any) => (map[compositeKey(r.period_type, r.period_key)] = r.adjusted_amount));
          setAdjustments(map);
        }
        if (splitRes.data) {
          const map: Record<string, SplitEntry[]> = {};
          splitRes.data.forEach((r: any) => {
            const k = compositeKey(r.period_type, r.period_key);
            (map[k] ??= []).push({ amount: r.amount, date: r.expected_date });
          });
          setSplits(map);
        }
        if (noteRes.data) {
          const map: Record<string, string> = {};
          noteRes.data.forEach((r: any) => (map[compositeKey(r.period_type, r.period_key)] = r.note));
          setNotes(map);
        }
      } catch {
        // tables not migrated yet — adjustments/splits/notes just live in local state this session
      }
    }

    load();
  }, []);

  const today = todayStr();

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    invoices.forEach((inv) => {
      if (!map.has(inv.customer_id)) map.set(inv.customer_id, inv.customers?.name ?? "Unknown customer");
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (filters.customerId && inv.customer_id !== filters.customerId) return false;
      if (filters.status && inv.status !== filters.status) return false;
      if (filters.search && !inv.invoice_no.toLowerCase().includes(filters.search.trim().toLowerCase())) return false;
      if (filters.dueFrom && inv.due_date < filters.dueFrom) return false;
      if (filters.dueTo && inv.due_date > filters.dueTo) return false;
      return true;
    });
  }, [invoices, filters]);

  const periods = useMemo(() => bucketInvoices(filteredInvoices, groupBy), [filteredInvoices, groupBy]);

  const totalComputed = periods.reduce((sum, p) => sum + p.computed, 0);
  const totalAdjusted = periods.reduce((sum, p) => sum + (adjustments[compositeKey(p.type, p.key)] ?? p.computed), 0);
  const maxAmount = Math.max(1, ...periods.map((p) => adjustments[compositeKey(p.type, p.key)] ?? p.computed));

  const expectedThisMonth = useMemo(() => {
    const monthlyBuckets = bucketInvoices(filteredInvoices, "month");
    const currentMonthKey = monthBoundsOf(today).key;
    const bucket = monthlyBuckets.find((b) => b.key === currentMonthKey);
    if (!bucket) return 0;
    return adjustments[compositeKey("month", bucket.key)] ?? bucket.computed;
  }, [filteredInvoices, adjustments, today]);

  const chartData = periods.map((p) => {
    const isPast = p.end.toISOString().slice(0, 10) < today;
    return {
      key: compositeKey(p.type, p.key),
      label: p.label,
      value: adjustments[compositeKey(p.type, p.key)] ?? p.computed,
      invoiceCount: p.invoices.length,
      overdueCount: isPast ? p.invoices.length : 0,
      isPast,
    };
  });

  function setAdjustedValue(period: PeriodBucket, raw: string) {
    const amount = Math.max(0, Number(raw) || 0);
    const key = compositeKey(period.type, period.key);
    setAdjustments((prev) => ({ ...prev, [key]: amount }));
    void persistAdjustment(period.type, period.key, amount);
  }

  function resetAdjustment(period: PeriodBucket) {
    if (!window.confirm(`Reset the adjusted amount for ${period.label} back to ${formatCurrency(period.computed)}?`)) {
      return;
    }
    const key = compositeKey(period.type, period.key);
    setAdjustments((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    void clearAdjustment(period.type, period.key);
  }

  function openSplitPanel(period: PeriodBucket) {
    const key = compositeKey(period.type, period.key);
    setSplitError(null);
    setSplitDraft(splits[key]?.length ? splits[key] : [{ amount: adjustments[key] ?? period.computed, date: period.start.toISOString().slice(0, 10) }]);
    setSplitPanelKey(key);
  }

  function closeSplitPanel() {
    setSplitPanelKey(null);
    setSplitDraft([]);
    setSplitError(null);
  }

  function saveSplit(period: PeriodBucket) {
    const key = compositeKey(period.type, period.key);
    const adjustedValue = adjustments[key] ?? period.computed;

    for (const entry of splitDraft) {
      if (!entry.date) {
        setSplitError("Every split needs an expected collection date.");
        return;
      }
      if (!(entry.amount > 0)) {
        setSplitError("Split amounts must be greater than zero.");
        return;
      }
    }
    const dates = splitDraft.map((e) => e.date);
    if (new Set(dates).size !== dates.length) {
      setSplitError("Split dates must be unique — combine amounts on the same date instead.");
      return;
    }
    const splitTotal = splitDraft.reduce((sum, e) => sum + e.amount, 0);
    if (splitTotal > adjustedValue + 0.01) {
      setSplitError(`Split total (${formatCurrency(splitTotal)}) exceeds the adjusted amount (${formatCurrency(adjustedValue)}).`);
      return;
    }

    setSplits((prev) => ({ ...prev, [key]: splitDraft }));
    void persistSplits(period.type, period.key, splitDraft);
    closeSplitPanel();
  }

  function saveNote(period: PeriodBucket) {
    const key = compositeKey(period.type, period.key);
    const text = noteDrafts[key] ?? notes[key] ?? "";
    setNotes((prev) => ({ ...prev, [key]: text }));
    void persistNote(period.type, period.key, text);
    setNoteSavedKey(key);
    setTimeout(() => setNoteSavedKey((current) => (current === key ? null : current)), 1800);
  }

  const detailColumns: Column<InvoiceRow>[] = [
    { key: "invoice_no", header: "Invoice #" },
    { key: "customer", header: "Customer", render: (r) => r.customers?.name ?? "—" },
    { key: "invoice_date", header: "Invoice Date", render: (r) => formatDate(r.invoice_date) },
    { key: "due_date", header: "Due Date", render: (r) => formatDate(r.due_date) },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const s = statusStyle(r.status);
        return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
      },
    },
    { key: "outstanding", header: "Outstanding Amount", className: "text-right", render: (r) => formatCurrency(r.outstanding) },
    { key: "expected", header: "Expected Amount", className: "text-right", render: (r) => formatCurrency(r.outstanding) },
    { key: "expected_date", header: "Expected Collection Date", render: (r) => formatDate(r.due_date) },
  ];

  const exportRows = buildExportRows(periods, adjustments);

  return (
    <>
      <PageHeader
        title="Cashflow Projection"
        subtitle="Expected collections from open invoices, grouped by the period they're due. Adjust any period's expected amount below."
        action={
          isConfigured ? (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              {(["week", "month"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroupBy(g)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    groupBy === g ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {g === "week" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      {isConfigured && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total Outstanding (Open)" value={formatCurrency(totalComputed)} tone="brand" />
            <StatTile label="Adjusted Expected" value={formatCurrency(totalAdjusted)} tone="default" />
            <StatTile label="Expected This Month" value={formatCurrency(expectedThisMonth)} tone="default" />
            <StatTile label={`${groupBy === "week" ? "Weeks" : "Months"} Covered`} value={String(periods.length)} subtitle="With at least one due invoice" />
          </div>

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Filters</h3>
              {(filters.customerId || filters.status || filters.search || filters.dueFrom || filters.dueTo) && (
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <select
                className={inputClass}
                value={filters.customerId}
                onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value }))}
              >
                <option value="">All customers</option>
                {customerOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className={inputClass}
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as InvoiceStatus | "" }))}
              >
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
              </select>
              <input
                className={inputClass}
                placeholder="Search invoice #"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
              <input
                type="date"
                className={inputClass}
                value={filters.dueFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dueFrom: e.target.value }))}
                title="Due date from"
              />
              <input
                type="date"
                className={inputClass}
                value={filters.dueTo}
                onChange={(e) => setFilters((f) => ({ ...f, dueTo: e.target.value }))}
                title="Due date to"
              />
            </div>
          </div>

          {!loading && chartData.length > 0 && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {groupBy === "week" ? "Weekly" : "Monthly"} Inflow Forecast
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Adjusted expected collections, grouped by due {groupBy === "week" ? "week" : "month"}
                  </p>
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
          ) : periods.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
              No open invoices match the current filters.
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => downloadBlob(toCSV(exportRows), `cashflow-projection-${today}.csv`, "text/csv;charset=utf-8;")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const html = `<table>${exportRows
                      .map((r, i) => `<tr>${r.map((c) => `<${i === 0 ? "th" : "td"}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`)
                      .join("")}</table>`;
                    downloadBlob(html, `cashflow-projection-${today}.xls`, "application/vnd.ms-excel");
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Export Excel
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th className="px-4 py-3 font-semibold text-slate-600">{groupBy === "week" ? "Week" : "Month"}</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Invoices</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Outstanding</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Computed</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Adjusted</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Collection %</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Variance</th>
                      <th className="px-4 py-3 font-semibold text-slate-600">Split</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p) => {
                      const key = compositeKey(p.type, p.key);
                      const isPast = p.end.toISOString().slice(0, 10) < today;
                      const adjustedValue = adjustments[key] ?? p.computed;
                      const barPct = Math.round((adjustedValue / maxAmount) * 100);
                      const collectionPct = p.computed > 0 ? (adjustedValue / p.computed) * 100 : 0;
                      const variance = adjustedValue - p.computed;
                      const periodSplits = splits[key] ?? [];
                      const splitTotal = periodSplits.reduce((sum, e) => sum + e.amount, 0);

                      return (
                        <Fragment key={key}>
                          <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td
                              className="cursor-pointer px-4 py-3 text-slate-700"
                              onClick={() => setExpandedKey(expandedKey === key ? null : key)}
                            >
                              {p.label}
                              {isPast && (
                                <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">
                                  Overdue
                                </span>
                              )}
                              {notes[key] && (
                                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                                  Note
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{p.invoices.length}</td>
                            <td className="px-4 py-3 text-slate-700">{formatCurrency(p.computed)}</td>
                            <td className="px-4 py-3 text-slate-700">{formatCurrency(p.computed)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  className={`${inputClass} w-28`}
                                  value={adjustedValue}
                                  onChange={(e) => setAdjustedValue(p, e.target.value)}
                                />
                                {adjustments[key] !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() => resetAdjustment(p)}
                                    title="Reset to computed amount"
                                    className="text-xs font-medium text-slate-500 hover:text-brand"
                                  >
                                    Reset
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{collectionPct.toFixed(0)}%</td>
                            <td className={`px-4 py-3 font-medium ${variance > 0 ? "text-emerald-700" : variance < 0 ? "text-red-700" : "text-slate-500"}`}>
                              {variance === 0 ? "—" : `${variance > 0 ? "+" : ""}${formatCurrency(variance)}`}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-brand" style={{ width: `${barPct}%` }} />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => (splitPanelKey === key ? closeSplitPanel() : openSplitPanel(p))}
                                  className="text-xs font-medium text-brand hover:underline"
                                >
                                  {periodSplits.length ? `${periodSplits.length} dates` : "Split"}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {splitPanelKey === key && (
                            <tr>
                              <td colSpan={8} className="bg-blue-50/50 px-4 py-4">
                                <div className="mb-2 flex items-center justify-between">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Split expected collection — {p.label}
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    Adjusted amount: <span className="font-semibold text-slate-700">{formatCurrency(adjustedValue)}</span>
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  {splitDraft.map((entry, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min={0}
                                        className={`${inputClass} w-32`}
                                        value={entry.amount}
                                        onChange={(e) => {
                                          const amount = Math.max(0, Number(e.target.value) || 0);
                                          setSplitDraft((prev) => prev.map((row, i) => (i === index ? { ...row, amount } : row)));
                                        }}
                                      />
                                      <span className="text-xs text-slate-400">on</span>
                                      <input
                                        type="date"
                                        className={`${inputClass} w-40`}
                                        value={entry.date}
                                        onChange={(e) => {
                                          const date = e.target.value;
                                          setSplitDraft((prev) => prev.map((row, i) => (i === index ? { ...row, date } : row)));
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setSplitDraft((prev) => prev.filter((_, i) => i !== index))}
                                        className="text-xs font-medium text-red-600 hover:underline"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setSplitDraft((prev) => [...prev, { amount: 0, date: "" }])}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                  >
                                    + Add date
                                  </button>
                                  <p className="text-xs text-slate-500">
                                    Allocated: {formatCurrency(splitDraft.reduce((sum, e) => sum + e.amount, 0))} of {formatCurrency(adjustedValue)}
                                  </p>
                                </div>
                                {splitError && <p className="mt-2 text-xs font-medium text-red-700">{splitError}</p>}
                                <div className="mt-3 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveSplit(p)}
                                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                                  >
                                    Save split
                                  </button>
                                  <button
                                    type="button"
                                    onClick={closeSplitPanel}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}

                          {expandedKey === key && (
                            <tr>
                              <td colSpan={8} className="bg-slate-50 px-4 py-4">
                                <div className="mb-4">
                                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Note</h4>
                                  <div className="flex items-start gap-2">
                                    <textarea
                                      className={`${inputClass} min-h-[60px] flex-1`}
                                      placeholder="e.g. Customer requested payment next week."
                                      value={noteDrafts[key] ?? notes[key] ?? ""}
                                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => saveNote(p)}
                                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                                    >
                                      Save note
                                    </button>
                                  </div>
                                  {noteSavedKey === key && <p className="mt-1 text-xs font-medium text-emerald-700">Note saved.</p>}
                                </div>

                                {periodSplits.length > 0 && (
                                  <p className="mb-3 text-xs text-slate-500">
                                    Split across {periodSplits.length} dates ({formatCurrency(splitTotal)} allocated):{" "}
                                    {periodSplits.map((e) => `${formatCurrency(e.amount)} on ${formatDate(e.date)}`).join(", ")}
                                  </p>
                                )}

                                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Invoices in this period</h4>
                                <DataTable columns={detailColumns} rows={p.invoices} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
