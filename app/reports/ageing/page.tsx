"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { inputClass } from "@/components/FormField";

/*
  AR Ageing report — enterprise dashboard.

  The core math is unchanged from the original screen:
  outstanding = invoice.total - sum(receipt_allocations.amount for that invoice)
  overdue bucket = today/asOf - due_date, bucketed into notDue/0-30/31-60/61-90/90+.

  Everything above the table (KPIs, charts, drawer) is derived, read-only,
  client-side aggregation of data already present in `invoices`, `receipts`,
  `receipt_allocations` and `customers` — no schema changes, no new tables,
  no writes.
*/

type Bucket = "notDue" | "d0_30" | "d31_60" | "d61_90" | "d90plus";
type FinanceStatus = "current" | "slightly" | "attention" | "critical" | "severe";
type SortField = "name" | "total" | Bucket | "status";
type SortDir = "asc" | "desc";

const BUCKETS: { key: Bucket; label: string; shortLabel: string }[] = [
  { key: "notDue", label: "Current", shortLabel: "Current" },
  { key: "d0_30", label: "0–30 days", shortLabel: "0–30d" },
  { key: "d31_60", label: "31–60 days", shortLabel: "31–60d" },
  { key: "d61_90", label: "61–90 days", shortLabel: "61–90d" },
  { key: "d90plus", label: "90+ days", shortLabel: "90+d" },
];

const BUCKET_COLOR: Record<Bucket, string> = {
  notDue: "#86b6ef",
  d0_30: "#5598e7",
  d31_60: "#2a78d6",
  d61_90: "#1c5cab",
  d90plus: "#104281",
};

const BUCKET_TEXT_CLASS: Record<Bucket, string> = {
  notDue: "text-slate-500",
  d0_30: "text-slate-700",
  d31_60: "text-amber-700",
  d61_90: "text-orange-700 font-medium",
  d90plus: "text-red-700 font-semibold",
};

const FINANCE_STATUS: Record<
  FinanceStatus,
  { label: string; pill: string; bar: string }
> = {
  current: { label: "Current", pill: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "#059669" },
  slightly: { label: "Slightly Overdue", pill: "border-amber-200 bg-amber-50 text-amber-700", bar: "#d97706" },
  attention: { label: "Attention Required", pill: "border-orange-200 bg-orange-50 text-orange-700", bar: "#ea580c" },
  critical: { label: "Critical", pill: "border-red-200 bg-red-50 text-red-700", bar: "#dc2626" },
  severe: { label: "Severely Critical", pill: "border-rose-900/30 bg-rose-900 text-rose-50", bar: "#7f1d1d" },
};

const INVOICE_STATUS_STYLE: Record<string, string> = {
  overdue: "border-red-200 bg-red-50 text-red-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  open: "border-slate-200 bg-slate-50 text-slate-600",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface CustomerRow {
  customerId: string;
  code: string;
  name: string;
  creditLimit: number;
  creditDays: number;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  buckets: Record<Bucket, number>;
  total: number;
  statuses: Set<string>;
  invoices: InvoiceLine[];
}

interface InvoiceLine {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  outstanding: number;
  status: string;
  lastReminderAt: string | null;
}

interface OutstandingInvoice {
  dueDate: string;
  outstanding: number;
  customerId: string;
}

interface ReceiptEntry {
  date: string;
  amount: number;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function money(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonthsISO(iso: string, months: number) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d;
}
function daysBetween(asOf: string, other: string) {
  const a = new Date(asOf + "T00:00:00");
  const d = new Date(other + "T00:00:00");
  return Math.round((a.getTime() - d.getTime()) / 86400000);
}

/* ------------------------- "As of" quick-range resolution ------------------------- */
/*
  AR Ageing is inherently a point-in-time snapshot (the existing calculation only
  ever consumes a single `asOf` date — see bucketFor/daysBetween above, unchanged).
  Period presets below (This Month, Last Quarter, etc.) resolve to a date RANGE for
  display purposes, but the value actually fed into `asOf` — and therefore into every
  existing calculation — is always the END of that range, clamped to today if the
  period hasn't finished yet. This preserves 100% compatibility with the existing
  bucketing/outstanding math while giving accountants a familiar quick-picker.
*/

type DatePresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "lastQuarter"
  | "thisFY"
  | "lastFY"
  | "thisCalYear"
  | "lastCalYear"
  | "last30"
  | "last60"
  | "last90"
  | "custom";

const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisQuarter", label: "This Quarter" },
  { key: "lastQuarter", label: "Last Quarter" },
  { key: "thisFY", label: "This Financial Year" },
  { key: "lastFY", label: "Last Financial Year" },
  { key: "thisCalYear", label: "This Calendar Year" },
  { key: "lastCalYear", label: "Last Calendar Year" },
  { key: "last30", label: "Last 30 Days" },
  { key: "last60", label: "Last 60 Days" },
  { key: "last90", label: "Last 90 Days" },
  { key: "custom", label: "Custom Range" },
];

function parseISODate(iso: string) {
  return new Date(iso + "T00:00:00");
}
function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeekISO(iso: string) {
  const d = parseISODate(iso);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDaysISO(iso, diffToMonday);
}
function endOfWeekISO(iso: string) {
  return addDaysISO(startOfWeekISO(iso), 6);
}
function startOfMonthISO(iso: string) {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}
function endOfMonthISO(iso: string) {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function startOfQuarterISO(iso: string) {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
}
function endOfQuarterISO(iso: string) {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0));
}
function startOfFYISO(iso: string) {
  const d = parseISODate(iso);
  const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return toISODate(new Date(fyStartYear, 3, 1));
}
function endOfFYISO(iso: string) {
  const start = parseISODate(startOfFYISO(iso));
  return toISODate(new Date(start.getFullYear() + 1, 2, 31));
}
function startOfCalYearISO(iso: string) {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), 0, 1));
}
function endOfCalYearISO(iso: string) {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), 11, 31));
}

function resolveDateRange(key: DatePresetKey, todayIso: string): { start: string; end: string } {
  switch (key) {
    case "today":
      return { start: todayIso, end: todayIso };
    case "yesterday": {
      const y = addDaysISO(todayIso, -1);
      return { start: y, end: y };
    }
    case "thisWeek":
      return { start: startOfWeekISO(todayIso), end: endOfWeekISO(todayIso) };
    case "lastWeek": {
      const start = addDaysISO(startOfWeekISO(todayIso), -7);
      return { start, end: addDaysISO(start, 6) };
    }
    case "thisMonth":
      return { start: startOfMonthISO(todayIso), end: endOfMonthISO(todayIso) };
    case "lastMonth": {
      const anchor = addDaysISO(startOfMonthISO(todayIso), -1);
      return { start: startOfMonthISO(anchor), end: endOfMonthISO(anchor) };
    }
    case "thisQuarter":
      return { start: startOfQuarterISO(todayIso), end: endOfQuarterISO(todayIso) };
    case "lastQuarter": {
      const anchor = addDaysISO(startOfQuarterISO(todayIso), -1);
      return { start: startOfQuarterISO(anchor), end: endOfQuarterISO(anchor) };
    }
    case "thisFY":
      return { start: startOfFYISO(todayIso), end: endOfFYISO(todayIso) };
    case "lastFY": {
      const anchor = addDaysISO(startOfFYISO(todayIso), -1);
      return { start: startOfFYISO(anchor), end: endOfFYISO(anchor) };
    }
    case "thisCalYear":
      return { start: startOfCalYearISO(todayIso), end: endOfCalYearISO(todayIso) };
    case "lastCalYear": {
      const anchor = addDaysISO(startOfCalYearISO(todayIso), -1);
      return { start: startOfCalYearISO(anchor), end: endOfCalYearISO(anchor) };
    }
    case "last30":
      return { start: addDaysISO(todayIso, -29), end: todayIso };
    case "last60":
      return { start: addDaysISO(todayIso, -59), end: todayIso };
    case "last90":
      return { start: addDaysISO(todayIso, -89), end: todayIso };
    default:
      return { start: todayIso, end: todayIso };
  }
}
function formatDisplayDate(iso: string) {
  return parseISODate(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
/*
  Human-readable due-date window for each bucket, derived purely from `asOf` and the
  same day thresholds bucketFor() uses (0 / 30 / 60 / 90) — never hardcoded, always
  recomputed on render whenever `asOf` changes.
*/
function bucketDateRange(key: Bucket, asOf: string): string {
  switch (key) {
    case "notDue":
      return `Due after ${formatDisplayDate(asOf)}`;
    case "d0_30":
      return `${formatDisplayDate(addDaysISO(asOf, -30))} – ${formatDisplayDate(addDaysISO(asOf, -1))}`;
    case "d31_60":
      return `${formatDisplayDate(addDaysISO(asOf, -60))} – ${formatDisplayDate(addDaysISO(asOf, -31))}`;
    case "d61_90":
      return `${formatDisplayDate(addDaysISO(asOf, -90))} – ${formatDisplayDate(addDaysISO(asOf, -61))}`;
    case "d90plus":
      return `Before ${formatDisplayDate(addDaysISO(asOf, -90))}`;
  }
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
function bucketTotalsForDate(asOf: string, invoices: OutstandingInvoice[]) {
  const buckets = emptyBuckets();
  let total = 0;
  for (const inv of invoices) {
    const b = bucketFor(daysBetween(asOf, inv.dueDate));
    buckets[b] += inv.outstanding;
    total += inv.outstanding;
  }
  return { buckets, total };
}
function financeStatusFor(buckets: Record<Bucket, number>): FinanceStatus {
  if (buckets.d90plus > 0) return "severe";
  if (buckets.d61_90 > 0) return "critical";
  if (buckets.d31_60 > 0) return "attention";
  if (buckets.d0_30 > 0) return "slightly";
  return "current";
}
const statusRank: Record<FinanceStatus, number> = { severe: 5, critical: 4, attention: 3, slightly: 2, current: 1 };
function worstInvoiceStatus(statuses: Set<string>): string {
  if (statuses.has("overdue")) return "overdue";
  if (statuses.has("partial")) return "partial";
  return "open";
}
function daysOverdueLabel(asOf: string, dueDate: string) {
  const d = daysBetween(asOf, dueDate);
  if (d > 0) return { text: `${d} day${d === 1 ? "" : "s"} overdue`, days: d };
  if (d === 0) return { text: "Due today", days: 0 };
  return { text: `Due in ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`, days: d };
}

/* ---------------------------- icon primitives ---------------------------- */

function Icon({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}
const IconCheckCircle = (p: { className?: string }) => <Icon className={p.className}><circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" /></Icon>;
const IconClock = (p: { className?: string }) => <Icon className={p.className}><circle cx="12" cy="12" r="9" /><line x1="12" y1="12" x2="12" y2="7" /><line x1="12" y1="12" x2="16" y2="13" /></Icon>;
const IconAlertTriangle = (p: { className?: string }) => <Icon className={p.className}><polygon points="12 3 22 20 2 20" /><line x1="12" y1="9" x2="12" y2="14" /><line x1="12" y1="17" x2="12" y2="17.01" /></Icon>;
const IconAlertOctagon = (p: { className?: string }) => <Icon className={p.className}><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16.01" /></Icon>;
const IconFlame = (p: { className?: string }) => <Icon className={p.className}><path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c0-1 0-2-1-3 2 1 4 4 4 7a7 7 0 1 1-14 0c0-4 3-6 4-9 0 2 1 3 3 5-1-3 0-5 0-7z" /></Icon>;
const IconWallet = (p: { className?: string }) => <Icon className={p.className}><path d="M20 7H5a2 2 0 0 1 0-4h13a1 1 0 0 1 1 1z" /><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-3z" /><circle cx="17" cy="14" r="1.2" fill="currentColor" stroke="none" /></Icon>;
const IconSearch = (p: { className?: string }) => <Icon className={p.className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>;
const IconDownload = (p: { className?: string }) => <Icon className={p.className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icon>;
const IconFileText = (p: { className?: string }) => <Icon className={p.className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></Icon>;
const IconPrinter = (p: { className?: string }) => <Icon className={p.className}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></Icon>;
const IconRotate = (p: { className?: string }) => <Icon className={p.className}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></Icon>;
const IconRefresh = (p: { className?: string }) => <Icon className={p.className}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></Icon>;
const IconArrowUp = (p: { className?: string }) => <Icon className={p.className}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></Icon>;
const IconArrowDown = (p: { className?: string }) => <Icon className={p.className}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></Icon>;
const IconMinus = (p: { className?: string }) => <Icon className={p.className}><line x1="5" y1="12" x2="19" y2="12" /></Icon>;
const IconChevronUp = (p: { className?: string }) => <Icon className={p.className}><polyline points="18 15 12 9 6 15" /></Icon>;
const IconChevronDown = (p: { className?: string }) => <Icon className={p.className}><polyline points="6 9 12 15 18 9" /></Icon>;
const IconChevronLeft = (p: { className?: string }) => <Icon className={p.className}><polyline points="15 18 9 12 15 6" /></Icon>;
const IconCheck = (p: { className?: string }) => <Icon className={p.className}><polyline points="20 6 9 17 4 12" /></Icon>;
const IconCalendar = (p: { className?: string }) => <Icon className={p.className}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Icon>;
const IconX = (p: { className?: string }) => <Icon className={p.className}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>;
const IconUsers = (p: { className?: string }) => <Icon className={p.className}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
const IconTarget = (p: { className?: string }) => <Icon className={p.className}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></Icon>;
const IconCalendarClock = (p: { className?: string }) => <Icon className={p.className}><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /><circle cx="15" cy="15" r="3.2" /><line x1="15" y1="13.5" x2="15" y2="15" /><line x1="15" y1="15" x2="16.2" y2="15.8" /></Icon>;
const IconAlertCircle = (p: { className?: string }) => <Icon className={p.className}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16.01" /></Icon>;
const IconInfo = (p: { className?: string }) => <Icon className={p.className}><circle cx="12" cy="12" r="9" /><line x1="12" y1="16" x2="12" y2="11" /><line x1="12" y1="8" x2="12" y2="8.01" /></Icon>;
const IconMail = (p: { className?: string }) => <Icon className={p.className}><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2 7 12 13 22 7" /></Icon>;
const IconPhone = (p: { className?: string }) => <Icon className={p.className}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></Icon>;

const BUCKET_ICON: Record<Bucket, (p: { className?: string }) => JSX.Element> = {
  notDue: IconCheckCircle,
  d0_30: IconClock,
  d31_60: IconAlertTriangle,
  d61_90: IconAlertOctagon,
  d90plus: IconFlame,
};

/* ------------------------------ animated value ------------------------------ */

function AnimatedNumber({ value, formatter }: { value: number; formatter: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const duration = 600;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{formatter(display)}</>;
}

/* --------------------------------- sparkline --------------------------------- */

function Sparkline({ values, color, w = 72, h = 26 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return <svg width={w} height={h} />;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path} fill="none" stroke="#c3c2b7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

function SparklineLight({ values }: { values: number[] }) {
  const w = 100;
  const h = 40;
  if (values.length < 2) return <svg width={w} height={h} />;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 6) - 3] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const areaPath = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h}>
      <path d={areaPath} fill="rgba(255,255,255,0.15)" stroke="none" />
      <path d={path} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill="#fff" />
    </svg>
  );
}

/* ----------------------------------- donut ----------------------------------- */

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function DonutChart({
  segments,
  total,
  hovered,
  onHover,
}: {
  segments: { key: Bucket; label: string; range: string; value: number; color: string }[];
  total: number;
  hovered: Bucket | null;
  onHover: (b: Bucket | null) => void;
}) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const r = 92;
  const strokeWidth = 32;
  const gapDeg = total > 0 ? 2.2 : 0;

  let cursor = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = total > 0 ? s.value / total : 0;
      const startAngle = cursor * 360 + gapDeg / 2;
      const sweep = fraction * 360 - gapDeg;
      cursor += fraction;
      const endAngle = startAngle + Math.max(sweep, 0);
      return { ...s, startAngle, endAngle };
    });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef0f4" strokeWidth={strokeWidth} />
          {arcs.map((a) => {
            const start = polarToCartesian(cx, cy, r, a.startAngle);
            const end = polarToCartesian(cx, cy, r, a.endAngle);
            const largeArc = a.endAngle - a.startAngle > 180 ? 1 : 0;
            const isHovered = hovered === a.key;
            const d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
            return (
              <path
                key={a.key}
                d={d}
                fill="none"
                stroke={a.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeLinecap="butt"
                className="cursor-pointer transition-all duration-300 ease-out"
                onMouseEnter={() => onHover(a.key)}
                onMouseLeave={() => onHover(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {hovered ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{segments.find((s) => s.key === hovered)?.label}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                {total > 0 ? Math.round(((segments.find((s) => s.key === hovered)?.value ?? 0) / total) * 100) : 0}%
              </p>
              <p className="font-mono text-xs tabular-nums text-slate-400">{money(segments.find((s) => s.key === hovered)?.value ?? 0)}</p>
              <p className="mt-0.5 max-w-[140px] text-center text-[10px] leading-tight text-slate-400">{segments.find((s) => s.key === hovered)?.range}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">{money(total)}</p>
            </>
          )}
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2.5">
        {segments.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const isHovered = hovered === s.key;
          return (
            <li
              key={s.key}
              title={s.range}
              onMouseEnter={() => onHover(s.key)}
              onMouseLeave={() => onHover(null)}
              className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 ${isHovered ? "bg-slate-50" : ""}`}
            >
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="flex flex-col leading-tight">
                  <span>{s.label}</span>
                  <span className="text-[11px] font-normal text-slate-400">{s.range}</span>
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm">
                <span className="font-mono font-medium tabular-nums text-slate-900">{money(s.value)}</span>
                <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-slate-400">{pct.toFixed(0)}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ----------------------------------- dot ----------------------------------- */

function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: color }} />;
}

/* -------------------------------- info tooltip -------------------------------- */
/*
  Fixed-positioned (not absolute) so the tooltip escapes the table's own
  `overflow-auto` scroll container instead of being clipped by it. Position is
  read from the trigger's live bounding rect on hover, so it tracks the sticky
  header correctly at any scroll offset.
*/
function InfoTooltip({ text }: { text: string }) {
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function show() {
    const el = btnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 8, left: r.left + r.width / 2 });
    }
    setVisible(true);
  }
  function hide() {
    setVisible(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-brand-dark focus:text-brand-dark focus:outline-none"
        aria-label={`Date range: ${text}`}
      >
        <IconInfo className="h-3.5 w-3.5" />
      </button>
      {rect && (
        <div
          role="tooltip"
          className={`fixed z-[100] -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium normal-case tracking-normal text-slate-700 shadow-lg transition-all duration-150 ease-out ${
            visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
          }`}
          style={{ top: rect.top, left: rect.left }}
        >
          {text}
        </div>
      )}
    </>
  );
}

/* -------------------------------- delta badge -------------------------------- */

function DeltaBadge({ current, previous, tone = "default" }: { current: number; previous: number; tone?: "default" | "onDark" }) {
  const delta = current - previous;
  const pct = previous > 0 ? (delta / previous) * 100 : current > 0 ? 100 : 0;
  const flat = Math.abs(delta) < 0.005;
  const improving = delta < 0;
  const ArrowIcon = flat ? IconMinus : improving ? IconArrowDown : IconArrowUp;
  const colorClass =
    tone === "onDark"
      ? flat
        ? "text-slate-500"
        : improving
          ? "text-emerald-400"
          : "text-red-400"
      : flat
        ? "text-slate-400"
        : improving
          ? "text-emerald-600"
          : "text-red-600";
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums ${colorClass}`}>
      <ArrowIcon className="h-3 w-3" />
      {flat ? "flat" : `${Math.abs(pct).toFixed(0)}%`}
    </span>
  );
}

/* ---------------------------------- KPI card ---------------------------------- */

function KpiCard({
  label,
  subtitle,
  icon: IconCmp,
  value,
  formatter,
  color,
  trend,
  previous,
  suffix,
}: {
  label: string;
  subtitle?: string;
  icon: (p: { className?: string }) => JSX.Element;
  value: number;
  formatter?: (n: number) => string;
  color: string;
  trend: number[];
  previous: number;
  suffix?: string;
}) {
  const fmt = formatter ?? money;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition-colors duration-200 hover:border-slate-300">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5 text-slate-400">
          <IconCmp className="h-3.5 w-3.5" />
          <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
        </div>
        <Sparkline values={trend} color={color} />
      </div>
      {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-400" title={subtitle}>{subtitle}</p>}
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-900">
        <AnimatedNumber value={value} formatter={fmt} />
        {suffix}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <DeltaBadge current={value} previous={previous} />
        <span className="text-[11px] text-slate-400">vs prior day</span>
      </div>
    </div>
  );
}

/* ------------------------------ executive metric ------------------------------ */

function ExecutiveMetric({
  label,
  icon: IconCmp,
  value,
  formatter,
  trend,
  previous,
  valueClass,
}: {
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  value: number;
  formatter: (n: number) => string;
  trend: number[];
  previous: number;
  valueClass: string;
}) {
  return (
    <div className="min-w-[168px] flex-1 px-6 py-5">
      <div className="flex items-center gap-1.5 text-slate-500">
        <IconCmp className="h-3.5 w-3.5" />
        <p className="text-[11px] font-semibold uppercase tracking-widest">{label}</p>
      </div>
      <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${valueClass}`}>
        <AnimatedNumber value={value} formatter={formatter} />
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <DeltaBadge current={value} previous={previous} tone="onDark" />
        <div className="opacity-70">
          <Sparkline values={trend} color="#94a3b8" w={56} h={20} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- progress bar -------------------------------- */

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full overflow-hidden rounded-full bg-slate-100" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

/* -------------------------------- skeletons -------------------------------- */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

/* ---------------------------- monthly trend chart ---------------------------- */

function MonthlyTrendChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-64 w-full items-end gap-5">
      {data.map((d) => {
        const h = (d.value / max) * 100;
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            <span className="font-mono text-xs font-medium tabular-nums text-slate-500">{d.value > 0 ? money(d.value).replace("₹", "") : "—"}</span>
            <div className="flex h-48 w-full items-end">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-brand to-brand-dark transition-[height] duration-700 ease-out"
                style={{ height: `${Math.max(h, 2)}%` }}
              />
            </div>
            <span className="text-xs text-slate-400">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- customer drawer --------------------------------- */

function CustomerDrawer({
  row,
  asOf,
  receipts,
  avgPaymentDays,
  onClose,
}: {
  row: CustomerRow;
  asOf: string;
  receipts: ReceiptEntry[];
  avgPaymentDays: number | null;
  onClose: () => void;
}) {
  const status = financeStatusFor(row.buckets);
  const style = FINANCE_STATUS[status];
  const lastPayment = receipts.length > 0 ? receipts[receipts.length - 1] : null;
  const trendValues = receipts.slice(-8).map((r) => r.amount);

  const outstandingInvoices = row.invoices.filter((i) => i.outstanding > 0.005);
  const topOverdue = outstandingInvoices
    .map((i) => ({ ...i, daysOverdue: daysBetween(asOf, i.dueDate) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue)[0];

  // 7-day outstanding history for this customer, same technique as the KPI sparklines.
  const history = Array.from({ length: 7 }, (_, i) => {
    const d = addDaysISO(asOf, i - 6);
    const total = outstandingInvoices.reduce((sum, inv) => {
      const b = bucketFor(daysBetween(d, inv.dueDate));
      return b ? sum + inv.outstanding : sum;
    }, 0);
    return total;
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 print:hidden" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 print:hidden">
        <div className="flex items-start justify-between border-b border-slate-100 p-6">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-wide text-slate-400">{row.code}</p>
            <h3 className="mt-0.5 text-xl font-semibold text-slate-900">{row.name}</h3>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${style.pill}`}>
              <Dot color={style.bar} /> {style.label}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-6 p-6">
          <div className="rounded-xl bg-slate-950 p-5 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Outstanding</p>
            <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{money(row.total)}</p>
            <div className="mt-3">
              <SparklineLight values={history} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Last Payment</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {lastPayment ? new Date(lastPayment.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No payments yet"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Avg. Payment Time</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-800">{avgPaymentDays != null ? `${avgPaymentDays.toFixed(0)} days` : "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Credit Limit Used</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-800">
                {row.creditLimit > 0 ? `${Math.min(100, (row.total / row.creditLimit) * 100).toFixed(0)}%` : "No limit set"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Open Invoices</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-800">{outstandingInvoices.length}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p>
            <div className="flex flex-col gap-2 text-sm text-slate-700">
              {row.contactPerson && <p>{row.contactPerson}</p>}
              {row.email && (
                <p className="flex items-center gap-2 text-slate-500">
                  <IconMail className="h-4 w-4" /> {row.email}
                </p>
              )}
              {row.phone && (
                <p className="flex items-center gap-2 text-slate-500">
                  <IconPhone className="h-4 w-4" /> {row.phone}
                </p>
              )}
              {!row.contactPerson && !row.email && !row.phone && <p className="text-slate-400">No contact details on file.</p>}
            </div>
          </div>

          {topOverdue && topOverdue.daysOverdue > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Top Overdue Invoice</p>
              <div className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-800">{topOverdue.invoiceNo}</p>
                  <p className="text-xs text-slate-500">Due {topOverdue.dueDate}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold tabular-nums text-red-700">{money(topOverdue.outstanding)}</p>
                  <p className="font-mono text-xs tabular-nums text-red-500">{topOverdue.daysOverdue} days overdue</p>
                </div>
              </div>
            </div>
          )}

          {trendValues.length > 1 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment Trend</p>
              <div className="rounded-lg border border-slate-200 p-3">
                <Sparkline values={trendValues} color="#2f6bff" w={280} h={40} />
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Invoices ({row.invoices.length})</p>
            <div className="flex flex-col gap-1.5">
              {row.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono font-medium text-slate-800">{inv.invoiceNo}</p>
                    <p className="text-xs text-slate-400">Due {inv.dueDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono tabular-nums text-slate-700">{money(inv.outstanding)}</p>
                    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${INVOICE_STATUS_STYLE[inv.status] ?? INVOICE_STATUS_STYLE.open}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

/* --------------------------------- resizable column head --------------------------------- */

function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const startX = useRef(0);
  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    function onMove(ev: MouseEvent) {
      onDrag(ev.clientX - startX.current);
      startX.current = ev.clientX;
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  return (
    <span
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 z-20 flex h-full w-2 cursor-col-resize items-center justify-center opacity-0 transition-opacity group-hover/th:opacity-100"
    >
      <span className="h-4 w-px bg-slate-300" />
    </span>
  );
}

/* ==================================================================================== */
/* page                                                                                  */
/* ==================================================================================== */

export default function AgeingReportPage() {
  const [asOf, setAsOf] = useState(todayISO());
  const [datePreset, setDatePreset] = useState<DatePresetKey>("today");
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const dateMenuRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [totalInvoicedAll, setTotalInvoicedAll] = useState(0);
  const [totalCollectedAll, setTotalCollectedAll] = useState(0);
  const [receiptsByCustomer, setReceiptsByCustomer] = useState<Map<string, ReceiptEntry[]>>(new Map());
  const [avgPaymentDaysByCustomer, setAvgPaymentDaysByCustomer] = useState<Map<string, number>>(new Map());
  const [avgOutstandingAge, setAvgOutstandingAge] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [bucketFilter, setBucketFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: "total", dir: "desc" });
  const [hoveredBucket, setHoveredBucket] = useState<Bucket | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    customer: 240,
    notDue: 110,
    d0_30: 110,
    d31_60: 110,
    d61_90: 110,
    d90plus: 110,
    total: 130,
    status: 110,
    risk: 170,
  });

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [invRes, allInvRes, allocRes, receiptsRes, reminderRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_no, invoice_date, due_date, total, status, customer_id, customers(id, code, name, credit_limit, credit_days, contact_person, email, phone)")
        .in("status", ["open", "partial", "overdue"]),
      supabase.from("invoices").select("total"),
      supabase.from("receipt_allocations").select("amount, invoice_id, invoices(customer_id, invoice_date), receipts(receipt_date)"),
      supabase.from("receipts").select("customer_id, receipt_date, amount").order("receipt_date"),
      supabase.from("reminder_log").select("invoice_id, sent_at").order("sent_at"),
    ]);

    if (invRes.error) {
      setError(invRes.error.message);
      setLoading(false);
      return;
    }
    if (allInvRes.error || allocRes.error || receiptsRes.error || reminderRes.error) {
      setError(allInvRes.error?.message || allocRes.error?.message || receiptsRes.error?.message || reminderRes.error?.message || "Failed to load report");
      setLoading(false);
      return;
    }

    const lastReminderByInvoice = new Map<string, string>();
    for (const r of reminderRes.data ?? []) {
      if (!r.invoice_id) continue;
      const existing = lastReminderByInvoice.get(r.invoice_id);
      if (!existing || r.sent_at > existing) lastReminderByInvoice.set(r.invoice_id, r.sent_at);
    }

    const allocations = allocRes.data ?? [];
    const allocatedByInvoice = new Map<string, number>();
    let collectedAll = 0;
    const paymentGapsByCustomer = new Map<string, number[]>();

    for (const a of allocations) {
      allocatedByInvoice.set(a.invoice_id, (allocatedByInvoice.get(a.invoice_id) ?? 0) + Number(a.amount));
      collectedAll += Number(a.amount);

      const inv = (a as unknown as { invoices: { customer_id: string; invoice_date: string } | null }).invoices;
      const rcpt = (a as unknown as { receipts: { receipt_date: string } | null }).receipts;
      if (inv && rcpt) {
        const gap = daysBetween(rcpt.receipt_date, inv.invoice_date);
        if (gap >= 0) {
          const arr = paymentGapsByCustomer.get(inv.customer_id) ?? [];
          arr.push(gap);
          paymentGapsByCustomer.set(inv.customer_id, arr);
        }
      }
    }

    const avgPaymentMap = new Map<string, number>();
    for (const [custId, gaps] of paymentGapsByCustomer) {
      avgPaymentMap.set(custId, gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }

    const receiptMap = new Map<string, ReceiptEntry[]>();
    for (const r of receiptsRes.data ?? []) {
      const arr = receiptMap.get(r.customer_id) ?? [];
      arr.push({ date: r.receipt_date, amount: Number(r.amount) });
      receiptMap.set(r.customer_id, arr);
    }

    const invoicedAll = (allInvRes.data ?? []).reduce((sum, i) => sum + Number(i.total), 0);

    const byCustomer = new Map<string, CustomerRow>();
    const outstandingList: OutstandingInvoice[] = [];
    let ageSum = 0;
    let ageCount = 0;

    for (const inv of invRes.data ?? []) {
      const outstanding = Number(inv.total) - (allocatedByInvoice.get(inv.id) ?? 0);
      const customer = (inv as unknown as { customers: { id: string; code: string; name: string; credit_limit: number; credit_days: number; contact_person: string | null; email: string | null; phone: string | null } | null }).customers;
      if (!customer) continue;

      let row = byCustomer.get(customer.id);
      if (!row) {
        row = {
          customerId: customer.id,
          code: customer.code,
          name: customer.name,
          creditLimit: Number(customer.credit_limit) || 0,
          creditDays: Number(customer.credit_days) || 0,
          contactPerson: customer.contact_person,
          email: customer.email,
          phone: customer.phone,
          buckets: emptyBuckets(),
          total: 0,
          statuses: new Set(),
          invoices: [],
        };
        byCustomer.set(customer.id, row);
      }
      row.statuses.add(inv.status);
      row.invoices.push({
        id: inv.id,
        invoiceNo: inv.invoice_no,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date,
        total: Number(inv.total),
        outstanding,
        status: inv.status,
        lastReminderAt: lastReminderByInvoice.get(inv.id) ?? null,
      });

      if (outstanding > 0.005) {
        const bucket = bucketFor(daysBetween(asOf, inv.due_date));
        row.buckets[bucket] += outstanding;
        row.total += outstanding;
        outstandingList.push({ dueDate: inv.due_date, outstanding, customerId: customer.id });
        ageSum += daysBetween(asOf, inv.invoice_date);
        ageCount += 1;
      }
    }

    const finalRows = Array.from(byCustomer.values()).filter((r) => r.total > 0.005);

    setRows(finalRows);
    setOutstandingInvoices(outstandingList);
    setTotalInvoicedAll(invoicedAll);
    setTotalCollectedAll(collectedAll);
    setReceiptsByCustomer(receiptMap);
    setAvgPaymentDaysByCustomer(avgPaymentMap);
    setAvgOutstandingAge(ageCount > 0 ? ageSum / ageCount : 0);
    setLoading(false);
  }, [asOf]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, customerFilter, bucketFilter, sort, pageSize]);

  useEffect(() => {
    if (!dateMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (dateMenuRef.current && !dateMenuRef.current.contains(e.target as Node)) {
        setDateMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [dateMenuOpen]);

  const grandTotal = useMemo(() => {
    const g = emptyBuckets();
    let total = 0;
    for (const r of rows) {
      for (const b of BUCKETS) g[b.key] += r.buckets[b.key];
      total += r.total;
    }
    return { buckets: g, total };
  }, [rows]);

  const trend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(asOf, i - 6));
    return days.map((d) => ({ date: d, ...bucketTotalsForDate(d, outstandingInvoices) }));
  }, [asOf, outstandingInvoices]);
  const previousDay = trend.length >= 2 ? trend[trend.length - 2] : { buckets: emptyBuckets(), total: 0 };

  const monthlyTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonthsISO(asOf, i - 3));
    return months.map((m) => {
      const label = m.toLocaleDateString("en-IN", { month: "short" });
      const value = outstandingInvoices
        .filter((o) => {
          const d = new Date(o.dueDate + "T00:00:00");
          return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
        })
        .reduce((s, o) => s + o.outstanding, 0);
      return { label, value };
    });
  }, [asOf, outstandingInvoices]);

  const collectionRate = totalInvoicedAll > 0 ? (totalCollectedAll / totalInvoicedAll) * 100 : 0;
  const customersWithOverdue = rows.filter((r) => financeStatusFor(r.buckets) !== "current").length;
  const highRiskCustomers = rows.filter((r) => {
    const s = financeStatusFor(r.buckets);
    return s === "critical" || s === "severe";
  }).length;

  const filteredSortedRows = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    if (customerFilter !== "all") list = list.filter((r) => r.customerId === customerFilter);

    if (bucketFilter !== "all") {
      if (bucketFilter.startsWith("status_")) {
        const s = bucketFilter.slice(7) as FinanceStatus;
        list = list.filter((r) => financeStatusFor(r.buckets) === s);
      } else {
        const key = bucketFilter as Bucket;
        list = list.filter((r) => r.buckets[key] > 0);
      }
    }

    const dir = sort.dir === "asc" ? 1 : -1;
    const withSort = [...list].sort((a, b) => {
      switch (sort.field) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "status":
          return dir * (statusRank[financeStatusFor(a.buckets)] - statusRank[financeStatusFor(b.buckets)]);
        case "total":
          return dir * (a.total - b.total);
        default:
          return dir * (a.buckets[sort.field as Bucket] - b.buckets[sort.field as Bucket]);
      }
    });
    return withSort;
  }, [rows, search, customerFilter, bucketFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredSortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredSortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function toggleSort(field: SortField) {
    setSort((prev) => (prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }));
  }

  function resizeCol(key: string, delta: number) {
    setColWidths((prev) => ({ ...prev, [key]: Math.max(70, prev[key] + delta) }));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = pagedRows.every((r) => next.has(r.customerId));
      for (const r of pagedRows) {
        if (allSelected) next.delete(r.customerId);
        else next.add(r.customerId);
      }
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetFilters() {
    setSearch("");
    setCustomerFilter("all");
    setBucketFilter("all");
    setSort({ field: "total", dir: "desc" });
    setSelectedIds(new Set());
  }

  function openDateMenu() {
    setShowCustomPicker(datePreset === "custom");
    if (datePreset === "custom") {
      setCustomStart(customStart);
      setCustomEnd(customEnd);
    }
    setDateMenuOpen(true);
  }

  function selectDatePreset(key: DatePresetKey) {
    if (key === "custom") {
      setCustomStart(asOf);
      setCustomEnd(asOf);
      setShowCustomPicker(true);
      return;
    }
    const today = todayISO();
    const { end } = resolveDateRange(key, today);
    const effective = end > today ? today : end;
    setDatePreset(key);
    setAsOf(effective);
    setDateMenuOpen(false);
  }

  function applyCustomRange() {
    const today = todayISO();
    const start = customStart;
    const end = customEnd < start ? start : customEnd;
    const effective = end > today ? today : end;
    setCustomStart(start);
    setCustomEnd(effective);
    setDatePreset("custom");
    setAsOf(effective);
    setDateMenuOpen(false);
  }

  const dateFilterLabel =
    datePreset === "custom"
      ? `${formatDisplayDate(customStart)} – ${formatDisplayDate(customEnd)}`
      : DATE_PRESETS.find((p) => p.key === datePreset)?.label ?? "Today";

  function exportRows() {
    return selectedIds.size > 0 ? filteredSortedRows.filter((r) => selectedIds.has(r.customerId)) : filteredSortedRows;
  }

  function exportCsv() {
    const list = exportRows();
    const header = ["Customer Code", "Customer Name", ...BUCKETS.map((b) => b.label), "Total", "Status", "Finance Status"];
    const lines = [header.join(",")];
    for (const r of list) {
      lines.push(
        [
          r.code,
          `"${r.name.replace(/"/g, '""')}"`,
          ...BUCKETS.map((b) => r.buckets[b.key].toFixed(2)),
          r.total.toFixed(2),
          worstInvoiceStatus(r.statuses),
          FINANCE_STATUS[financeStatusFor(r.buckets)].label,
        ].join(",")
      );
    }
    lines.push(["", "Grand Total", ...BUCKETS.map((b) => grandTotal.buckets[b.key].toFixed(2)), grandTotal.total.toFixed(2), "", ""].join(","));
    downloadBlob(lines.join("\n"), `ar-ageing-${asOf}.csv`, "text/csv;charset=utf-8;");
  }

  function exportExcel() {
    const list = exportRows();
    const headerCells = ["Customer Code", "Customer Name", ...BUCKETS.map((b) => b.label), "Total", "Status", "Finance Status"]
      .map((h) => `<th style="background:#f1f5f9;padding:6px 10px;border:1px solid #e2e8f0;text-align:left;">${h}</th>`)
      .join("");
    const rowsHtml = list
      .map((r) => {
        const cells = [
          r.code,
          r.name,
          ...BUCKETS.map((b) => r.buckets[b.key].toFixed(2)),
          r.total.toFixed(2),
          worstInvoiceStatus(r.statuses),
          FINANCE_STATUS[financeStatusFor(r.buckets)].label,
        ];
        return `<tr>${cells.map((c) => `<td style="padding:6px 10px;border:1px solid #e2e8f0;">${c}</td>`).join("")}</tr>`;
      })
      .join("");
    const html = `<html><head><meta charset="utf-8" /></head><body><table>${headerCells ? `<tr>${headerCells}</tr>` : ""}${rowsHtml}</table></body></html>`;
    downloadBlob(html, `ar-ageing-${asOf}.xls`, "application/vnd.ms-excel;charset=utf-8;");
  }

  function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  if (!isConfigured) {
    return (
      <>
        <PageHeader title="AR Ageing" subtitle="Outstanding invoices, bucketed by days overdue." />
        <NotConfigured />
      </>
    );
  }

  const donutSegments = BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    range: bucketDateRange(b.key, asOf),
    value: grandTotal.buckets[b.key],
    color: BUCKET_COLOR[b.key],
  }));
  const openDrawerRow = openCustomerId ? rows.find((r) => r.customerId === openCustomerId) ?? null : null;

  const tableCols: { key: string; label: string; sortField?: SortField; align?: "left" | "right" | "center"; title?: string }[] = [
    { key: "customer", label: "Customer", sortField: "name", align: "left" },
    ...BUCKETS.map((b) => ({ key: b.key, label: b.shortLabel, sortField: b.key as SortField, align: "right" as const, title: bucketDateRange(b.key, asOf) })),
    { key: "total", label: "Total", sortField: "total", align: "right" as const },
    { key: "status", label: "Status", sortField: "status" as SortField, align: "center" as const },
    { key: "risk", label: "Risk", align: "center" as const },
  ];
  const tableWidth = 36 + 44 + Object.values(colWidths).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="AR Ageing"
        subtitle={`Outstanding as of ${formatDisplayDate(asOf)}, bucketed by days overdue.`}
        action={
          <div ref={dateMenuRef} className="relative print:hidden">
            <button
              type="button"
              onClick={() => (dateMenuOpen ? setDateMenuOpen(false) : openDateMenu())}
              className="flex items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 shadow-sm transition-colors hover:border-slate-400"
            >
              <IconCalendar className="h-4 w-4 text-slate-400" />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">As of</span>
                <span className="font-mono text-sm font-medium text-slate-800">{dateFilterLabel}</span>
              </span>
              <IconChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${dateMenuOpen ? "rotate-180" : ""}`} />
            </button>

            <div
              className={`absolute right-0 z-40 mt-2 w-80 origin-top-right rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 transition-all duration-150 ease-out ${
                dateMenuOpen ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
              }`}
            >
              {showCustomPicker ? (
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      onClick={() => setShowCustomPicker(false)}
                      className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      <IconChevronLeft className="h-4 w-4" />
                    </button>
                    <p className="text-sm font-semibold text-slate-800">Custom Range</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Start date</span>
                      <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={inputClass} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">End date</span>
                      <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputClass} />
                    </label>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-400">
                    AR Ageing is a point-in-time snapshot — balances are calculated as of the End Date.
                  </p>
                  <button
                    onClick={applyCustomRange}
                    className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
                  >
                    Apply
                  </button>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {DATE_PRESETS.map((p) => {
                    const selected = datePreset === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => selectDatePreset(p.key)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selected ? "bg-brand/10 font-medium text-brand-dark" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {p.label}
                        {selected && <IconCheck className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        }
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">Couldn&apos;t load the ageing report: {error}</div>
      )}

      {loading ? (
        <div className="flex flex-col gap-6">
          <SkeletonBlock className="h-32 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-24" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-28" />
            ))}
          </div>
          <SkeletonBlock className="h-64 w-full" />
          <SkeletonBlock className="h-72 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
          <IconCheckCircle className="h-10 w-10 text-green-500" />
          <p className="text-sm font-medium text-slate-600">Nothing outstanding</p>
          <p className="text-sm text-slate-400">Every invoice is paid up as of {asOf}.</p>
        </div>
      ) : (
        <>
          {/* SECTION 1 — Executive summary */}
          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-sm print:hidden">
            <div className="flex flex-wrap divide-x divide-y divide-slate-800/70 sm:divide-y-0">
              <ExecutiveMetric
                label="Total Outstanding"
                icon={IconWallet}
                value={grandTotal.total}
                formatter={money}
                trend={trend.map((t) => t.total)}
                previous={previousDay.total}
                valueClass="text-white"
              />
              <ExecutiveMetric
                label="Collection Rate"
                icon={IconTarget}
                value={collectionRate}
                formatter={(n) => `${n.toFixed(1)}%`}
                trend={[collectionRate, collectionRate]}
                previous={collectionRate}
                valueClass={collectionRate >= 80 ? "text-emerald-400" : collectionRate >= 50 ? "text-amber-400" : "text-red-400"}
              />
              <ExecutiveMetric
                label="Avg Days Outstanding"
                icon={IconCalendarClock}
                value={avgOutstandingAge}
                formatter={(n) => `${n.toFixed(0)}d`}
                trend={[avgOutstandingAge, avgOutstandingAge]}
                previous={avgOutstandingAge}
                valueClass={avgOutstandingAge <= 30 ? "text-emerald-400" : avgOutstandingAge <= 60 ? "text-amber-400" : "text-red-400"}
              />
              <ExecutiveMetric
                label="Customers Overdue"
                icon={IconAlertCircle}
                value={customersWithOverdue}
                formatter={(n) => n.toFixed(0)}
                trend={[customersWithOverdue, customersWithOverdue]}
                previous={customersWithOverdue}
                valueClass={customersWithOverdue === 0 ? "text-emerald-400" : "text-amber-400"}
              />
              <ExecutiveMetric
                label="High Risk Customers"
                icon={IconUsers}
                value={highRiskCustomers}
                formatter={(n) => n.toFixed(0)}
                trend={[highRiskCustomers, highRiskCustomers]}
                previous={highRiskCustomers}
                valueClass={highRiskCustomers === 0 ? "text-emerald-400" : "text-red-400"}
              />
            </div>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:hidden">
            {BUCKETS.map((b) => (
              <KpiCard
                key={b.key}
                label={b.label}
                subtitle={bucketDateRange(b.key, asOf)}
                icon={BUCKET_ICON[b.key]}
                value={grandTotal.buckets[b.key]}
                color={BUCKET_COLOR[b.key]}
                trend={trend.map((t) => t.buckets[b.key])}
                previous={previousDay.buckets[b.key]}
              />
            ))}
          </div>

          {/* SECTION 2 — Financial visualization */}
          <div className="mb-8 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 print:hidden">
            <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6">
              <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500">AR Distribution</p>
              <div className="flex flex-1 items-center">
                <DonutChart segments={donutSegments} total={grandTotal.total} hovered={hoveredBucket} onHover={setHoveredBucket} />
              </div>
            </div>

            <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly Outstanding Trend</p>
              <p className="mb-4 text-xs text-slate-400">By invoice due month, ± 3 months from {asOf}</p>
              <div className="flex flex-1 items-center">
                <MonthlyTrendChart data={monthlyTrend} />
              </div>
            </div>
          </div>

          {/* SECTION 3 — Toolbar */}
          <div className="sticky top-0 z-30 mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between print:hidden">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-52">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer…" className={`${inputClass} w-full pl-9`} />
              </div>

              <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className={inputClass}>
                <option value="all">All customers</option>
                {rows
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((r) => (
                    <option key={r.customerId} value={r.customerId}>
                      {r.name}
                    </option>
                  ))}
              </select>

              <select value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value)} className={inputClass}>
                <option value="all">All buckets</option>
                {BUCKETS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
                <option value="status_current">Status: Current</option>
                <option value="status_slightly">Status: Slightly Overdue</option>
                <option value="status_attention">Status: Attention Required</option>
                <option value="status_critical">Status: Critical</option>
                <option value="status_severe">Status: Severely Critical</option>
              </select>

              <select
                value={`${sort.field}:${sort.dir}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split(":") as [SortField, SortDir];
                  setSort({ field, dir });
                }}
                className={inputClass}
              >
                <option value="total:desc">Sort: Total (high → low)</option>
                <option value="total:asc">Sort: Total (low → high)</option>
                <option value="name:asc">Sort: Customer name (A–Z)</option>
                <option value="status:desc">Sort: Risk (high → low)</option>
              </select>

              <button onClick={resetFilters} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
                <IconRotate className="h-4 w-4" />
                Reset
              </button>
              <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
                <IconRefresh className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && <span className="font-mono text-xs font-medium tabular-nums text-brand-dark">{selectedIds.size} selected</span>}
              <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                <IconFileText className="h-4 w-4" />
                CSV
              </button>
              <button onClick={exportExcel} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                <IconDownload className="h-4 w-4" />
                Excel
              </button>
              <button onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                <IconPrinter className="h-4 w-4" />
                Print / PDF
              </button>
            </div>
          </div>

          {/* Ageing bucket legend */}
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Ageing Buckets</span>
            <span className="text-slate-300">—</span>
            <span>Current → Due after selected date</span>
            <span className="text-slate-300">·</span>
            <span>0–30D → Due within last 30 days</span>
            <span className="text-slate-300">·</span>
            <span>31–60D → Due within last 31–60 days</span>
            <span className="text-slate-300">·</span>
            <span>61–90D → Due within last 61–90 days</span>
            <span className="text-slate-300">·</span>
            <span>90+D → Due more than 90 days</span>
          </div>

          {/* SECTION 4 — Data table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[560px] overflow-auto">
              <table className="text-sm" style={{ width: tableWidth, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: 44 }} />
                  {tableCols.map((c) => (
                    <col key={c.key} style={{ width: colWidths[c.key] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="sticky top-0 z-10 bg-slate-50 px-2 py-2.5" />
                    <th className="sticky top-0 z-10 bg-slate-50 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.customerId))}
                        onChange={toggleSelectAllOnPage}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </th>
                    {tableCols.map((c) => (
                      <th
                        key={c.key}
                        onMouseEnter={() => setHoveredCol(c.key)}
                        onMouseLeave={() => setHoveredCol(null)}
                        className={`group/th sticky top-0 z-10 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 transition-colors ${
                          c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                        } ${sort.field === c.sortField ? "bg-brand/5 text-brand-dark" : ""} ${hoveredCol === c.key ? "bg-slate-100" : ""}`}
                        style={{ position: "sticky" }}
                      >
                        <span
                          className={`relative inline-flex items-center gap-1 ${c.sortField ? "cursor-pointer select-none" : ""} ${c.align === "right" ? "justify-end w-full" : c.align === "center" ? "justify-center w-full" : ""}`}
                          onClick={() => c.sortField && toggleSort(c.sortField)}
                        >
                          {c.label}
                          {c.sortField &&
                            sort.field === c.sortField &&
                            (sort.dir === "asc" ? <IconChevronUp className="h-3.5 w-3.5" /> : <IconChevronDown className="h-3.5 w-3.5" />)}
                          {c.title && <InfoTooltip text={c.title} />}
                        </span>
                        <ResizeHandle onDrag={(d) => resizeCol(c.key, d)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={tableCols.length + 2} className="px-4 py-10 text-center text-slate-400">
                        No customers match your search or filter.
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((r, idx) => {
                      const status = financeStatusFor(r.buckets);
                      const style = FINANCE_STATUS[status];
                      const invStatus = worstInvoiceStatus(r.statuses);
                      const barPct = r.creditLimit > 0 ? (r.total / r.creditLimit) * 100 : (r.total / (grandTotal.total || 1)) * 100;
                      const selected = selectedIds.has(r.customerId);
                      const expanded = expandedIds.has(r.customerId);
                      return (
                        <Fragment key={r.customerId}>
                          <tr
                            onClick={() => toggleExpand(r.customerId)}
                            className={`cursor-pointer border-b border-slate-100 transition-all duration-150 last:border-0 hover:z-10 hover:shadow-md hover:relative ${
                              idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"
                            } ${selected ? "bg-brand/5" : ""} ${expanded ? "bg-brand/[0.06]" : ""} hover:bg-brand/[0.04]`}
                          >
                            <td className="px-2 py-3 text-center">
                              <IconChevronDown
                                className={`inline-block h-4 w-4 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
                              />
                            </td>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selected} onChange={() => toggleSelect(r.customerId)} className="h-4 w-4 rounded border-slate-300" />
                            </td>
                            <td className={`px-4 py-3 text-slate-700 ${hoveredCol === "customer" ? "bg-slate-50" : ""}`}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenCustomerId(r.customerId);
                                }}
                                className="font-medium text-slate-900 underline-offset-2 hover:text-brand-dark hover:underline"
                              >
                                {r.name}
                              </button>
                              <span className="ml-2 font-mono text-xs text-slate-400">{r.code}</span>
                              <div className="mt-1.5 max-w-[160px]">
                                <ProgressBar pct={barPct} color={style.bar} height={3} />
                              </div>
                            </td>
                            {BUCKETS.map((b) => (
                              <td key={b.key} className={`px-4 py-3 text-right font-mono tabular-nums ${BUCKET_TEXT_CLASS[b.key]} ${hoveredCol === b.key ? "bg-slate-50" : ""}`}>
                                {r.buckets[b.key] > 0 ? money(r.buckets[b.key]) : "—"}
                              </td>
                            ))}
                            <td className={`px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 ${hoveredCol === "total" ? "bg-slate-50" : ""}`}>{money(r.total)}</td>
                            <td className={`px-4 py-3 text-center ${hoveredCol === "status" ? "bg-slate-50" : ""}`}>
                              <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium capitalize ${INVOICE_STATUS_STYLE[invStatus]}`}>{invStatus}</span>
                            </td>
                            <td className={`px-4 py-3 text-center ${hoveredCol === "risk" ? "bg-slate-50" : ""}`}>
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${style.pill}`}>
                                <Dot color={style.bar} /> {style.label}
                              </span>
                            </td>
                          </tr>
                          <tr className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                            <td colSpan={tableCols.length + 2} className="p-0">
                              <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}>
                                <div className="overflow-hidden">
                                  <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Invoices for {r.name} ({r.invoices.length})
                                    </p>
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                      <table className="w-full min-w-[860px] text-xs">
                                        <thead>
                                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                                            <th className="px-3 py-2 font-semibold">Invoice No.</th>
                                            <th className="px-3 py-2 font-semibold">Invoice Date</th>
                                            <th className="px-3 py-2 font-semibold">Due Date</th>
                                            <th className="px-3 py-2 text-right font-semibold">Invoice Amount</th>
                                            <th className="px-3 py-2 text-right font-semibold">Paid Amount</th>
                                            <th className="px-3 py-2 text-right font-semibold">Outstanding</th>
                                            <th className="px-3 py-2 text-right font-semibold">Days Overdue</th>
                                            <th className="px-3 py-2 text-center font-semibold">Status</th>
                                            <th className="px-3 py-2 font-semibold">Last Reminder</th>
                                            <th className="px-3 py-2 font-semibold">Payment Terms</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {r.invoices.map((inv) => {
                                            const paid = inv.total - inv.outstanding;
                                            const overdue = daysOverdueLabel(asOf, inv.dueDate);
                                            return (
                                              <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                <td className="px-3 py-2 font-mono font-medium text-slate-800">{inv.invoiceNo}</td>
                                                <td className="px-3 py-2 font-mono text-slate-600">{inv.invoiceDate}</td>
                                                <td className="px-3 py-2 font-mono text-slate-600">{inv.dueDate}</td>
                                                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{money(inv.total)}</td>
                                                <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700">{money(paid)}</td>
                                                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">{money(inv.outstanding)}</td>
                                                <td className={`px-3 py-2 text-right font-mono tabular-nums ${overdue.days > 0 ? "font-medium text-red-600" : "text-slate-500"}`}>
                                                  {overdue.text}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${INVOICE_STATUS_STYLE[inv.status] ?? INVOICE_STATUS_STYLE.open}`}>
                                                    {inv.status}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 font-mono text-slate-500">
                                                  {inv.lastReminderAt
                                                    ? new Date(inv.lastReminderAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                                                    : "Not sent"}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-slate-500">Net {r.creditDays} days</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-950 text-white">
                    <td className="px-2 py-4" />
                    <td className="px-3 py-4" />
                    <td className="px-4 py-4 text-xs font-bold uppercase tracking-widest text-slate-300">Grand Total</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="px-4 py-4 text-right font-mono font-semibold tabular-nums text-slate-100">
                        {money(grandTotal.buckets[b.key])}
                      </td>
                    ))}
                    <td className="px-4 py-4 text-right font-mono text-base font-bold tabular-nums text-white">{money(grandTotal.total)}</td>
                    <td className="px-4 py-4" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Pagination footer */}
          <div className="mt-3 flex flex-col items-center justify-between gap-3 text-sm text-slate-500 sm:flex-row print:hidden">
            <p className="font-mono tabular-nums">
              Showing {pagedRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{(currentPage - 1) * pageSize + pagedRows.length} of{" "}
              {filteredSortedRows.length} customer{filteredSortedRows.length === 1 ? "" : "s"}
              {filteredSortedRows.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                Rows per page
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={`${inputClass} py-1`}>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="px-2 tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {openDrawerRow && (
        <CustomerDrawer
          row={openDrawerRow}
          asOf={asOf}
          receipts={receiptsByCustomer.get(openDrawerRow.customerId) ?? []}
          avgPaymentDays={avgPaymentDaysByCustomer.get(openDrawerRow.customerId) ?? null}
          onClose={() => setOpenCustomerId(null)}
        />
      )}
    </>
  );
}
