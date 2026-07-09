"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BrainCircuit,
  CircleDollarSign,
  Clock3,
  FileDown,
  Filter,
  Files,
  IndianRupee,
  Menu,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Company, Customer, Invoice, Receipt, ReceiptAllocation, ReminderLog } from "@/lib/types";
import { formatCurrency, formatDate, isOverdue, isUnpaid, outstandingAmount, todayStr } from "@/lib/ar";
import { AnimatedCounter } from "@/components/AnimatedCounter";

type InvoiceRow = Invoice & {
  customer: Customer | null;
  allocated: number;
  outstanding: number;
  daysOverdue: number;
  priority: "Critical" | "High" | "Medium" | "Low";
};

type CustomerRiskRow = {
  customer: Customer;
  outstanding: number;
  overdue: number;
  riskScore: number;
  paymentBehavior: string;
  creditUtilization: number;
  averageDelay: number;
  collectionProbability: number;
  segment: string;
  openInvoices: number;
};

type ActivityRow = {
  id: string;
  kind: "payment" | "reminder" | "warning" | "invoice";
  title: string;
  detail: string;
  amount?: number;
  at: string;
};

type ChartPoint = {
  label: string;
  value: number;
  value2?: number;
};

const DEMO_COMPANY: Company = {
  id: "demo",
  name: "Verve Manufacturing Ltd.",
  address: null,
  gstin: null,
  email: null,
  phone: null,
};

const FILTERS = [
  "Date Range",
  "Business Unit",
  "Branch",
  "Salesperson",
  "Customer",
  "Region",
  "Currency",
  "Invoice Status",
  "Collection Status",
  "Payment Method",
  "Saved Views",
];

const PAGE_SIZE = 8;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function parseDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-IN", { month: "short" });
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function shiftMonthsBack(count: number) {
  const base = startOfMonth();
  return Array.from({ length: count }, (_, index) => addMonths(base, index - count + 1));
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function formatCompactCurrency(amount: number) {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `₹${lakhs >= 10 ? lakhs.toFixed(1) : lakhs.toFixed(2)}L`.replace(/\.?0+L$/, "L");
  }
  return formatCurrency(amount);
}

function pct(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function groupByMonth<T>(items: T[], getDate: (item: T) => string, getValue: (item: T) => number) {
  const months = shiftMonthsBack(12);
  const map = new Map(months.map((date) => [monthKey(date), 0]));
  items.forEach((item) => {
    const key = monthKey(parseDate(getDate(item)));
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + getValue(item));
    }
  });
  return months.map((date) => ({
    label: monthLabel(date),
    value: map.get(monthKey(date)) ?? 0,
  }));
}

function buildSparkline(values: number[], width = 120, height = 36, padding = 4) {
  if (!values.length) {
    return "";
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

/*
  Genuine month-over-month change: current bucket vs the one before it. Capped to
  a sane range so a near-zero prior month can't blow up into a five-figure percentage.
*/
function momTrend(values: number[]) {
  if (values.length < 2) return 0;
  const current = values[values.length - 1] ?? 0;
  const previous = values[values.length - 2] ?? 0;
  if (previous <= 0) return current > 0 ? 100 : 0;
  return clamp(((current - previous) / previous) * 100, -999, 999);
}

function Card({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("group rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05),0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:border-slate-200 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.08),0_24px_60px_rgba(15,23,42,0.12)]", className)}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {Icon ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm transition-transform duration-200 group-hover:scale-[1.02]">
                <Icon className="h-4.5 w-4.5" />
              </span>
            ) : null}
            <h2 className="text-[22px] font-semibold tracking-tight text-slate-950">{title}</h2>
          </div>
          {subtitle ? <p className="text-sm leading-6 text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

type StatBadge = { kind: "trend"; value: number; unit?: "%" | "pts" } | { kind: "note"; text: string };

function StatCard({
  label,
  value,
  format = (v) => Math.round(v).toLocaleString("en-IN"),
  badge,
  icon: Icon,
  sparkline,
  subtitle,
  className,
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  badge: StatBadge;
  icon: ComponentType<{ className?: string }>;
  sparkline: number[];
  subtitle: string;
  className?: string;
}) {
  const rising = badge.kind === "trend" ? badge.value >= 0 : true;
  const trendLabel =
    badge.kind === "trend"
      ? `${badge.value >= 0 ? "+" : ""}${badge.value.toFixed(1)}${badge.unit === "pts" ? " pts" : "%"} vs last month`
      : badge.text;
  const ariaTrend = badge.kind === "trend" ? `, ${rising ? "up" : "down"} ${Math.abs(badge.value).toFixed(1)}${badge.unit === "pts" ? " points" : " percent"} versus last month` : "";

  return (
    <article
      tabIndex={0}
      aria-label={`${label}: ${format(value)}${ariaTrend}`}
      className={cn(
        "group rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05),0_18px_50px_rgba(15,23,42,0.06)] outline-none transition-all duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:border-slate-200 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.08),0_24px_60px_rgba(15,23,42,0.12)] focus-visible:-translate-y-1 focus-visible:border-brand/40 focus-visible:shadow-[0_0_0_4px_rgba(47,107,255,0.15)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
            <AnimatedCounter value={value} format={format} />
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm transition-transform duration-200 group-hover:scale-[1.03]">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              badge.kind === "trend" ? (rising ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700") : "bg-slate-100 text-slate-600"
            )}
          >
            {badge.kind === "trend" ? rising ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" /> : null}
            {trendLabel}
          </p>
          <p className="text-[13px] leading-5 text-slate-500">{subtitle}</p>
        </div>
        <div className="h-9 w-24 shrink-0 rounded-xl bg-slate-50 px-2 py-1.5">
          <svg viewBox="0 0 120 36" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id={`spark-${label.replace(/[^a-z0-9]+/gi, "-")}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#2f6bff" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <polyline
              fill="none"
              stroke={`url(#spark-${label.replace(/[^a-z0-9]+/gi, "-")})`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={buildSparkline(sparkline)}
              className="dash-spark"
            />
          </svg>
        </div>
      </div>
    </article>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
  purple: "bg-violet-50 text-violet-700",
} as const;

function Badge({
  tone = "neutral",
  inverted = false,
  className,
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  inverted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors duration-200",
        inverted ? "bg-white/15 text-white" : BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<Invoice["status"], keyof typeof BADGE_TONES> = {
  open: "neutral",
  paid: "success",
  overdue: "danger",
  partial: "warning",
};

const PRIORITY_TONE: Record<InvoiceRow["priority"], keyof typeof BADGE_TONES> = {
  Critical: "danger",
  High: "warning",
  Medium: "warning",
  Low: "neutral",
};

function SectionChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label ? <p className="mb-1 font-semibold text-slate-950">{label}</p> : null}
      {payload.map((entry: any) => (
        <p key={entry.dataKey ?? entry.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color ?? entry.payload?.color }} />
          {entry.name ?? entry.dataKey}: <span className="font-semibold text-slate-950">{formatCompactCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function DistributionDonut({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  return (
    <div className="flex items-center gap-5">
      <div className="h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive
            >
              {segments.map((segment) => (
                <Cell key={segment.label} fill={segment.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 text-sm">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
            <span className="text-slate-600">{segment.label}</span>
            <span className="ml-auto font-semibold text-slate-950">{formatCompactCurrency(segment.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgingBarChart({ buckets }: { buckets: { label: string; value: number; color: string }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef2f7" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => formatCompactCurrency(v)} width={64} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
          <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={48} isAnimationActive>
            {buckets.map((bucket) => (
              <Cell key={bucket.label} fill={bucket.color} />
            ))}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  title,
  detail,
  amount,
  at,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  amount?: number;
  at: string;
  tone: "emerald" | "amber" | "red" | "blue" | "slate";
}) {
  const toneMap: Record<"emerald" | "amber" | "red" | "blue" | "slate", string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-rose-50 text-rose-700 border-rose-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };

  return (
    <div className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3">
      <div className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl border", toneMap[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
          {amount ? <p className="shrink-0 text-xs font-semibold text-slate-950">{formatCompactCurrency(amount)}</p> : null}
        </div>
        <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">{at}</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05),0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="space-y-4">
        <div className="h-3 w-28 rounded-full shimmer" />
        <div className="h-10 w-44 rounded-2xl shimmer" />
        <div className="h-20 rounded-2xl shimmer" />
      </div>
    </div>
  );
}

function InsightCard({
  severity,
  icon: Icon,
  title,
  description,
  action,
}: {
  severity: "blue" | "emerald" | "amber" | "red" | "purple";
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: string;
}) {
  const palette: Record<typeof severity, string> = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-700",
    red: "border-rose-100 bg-rose-50/70 text-rose-700",
    purple: "border-violet-100 bg-violet-50/70 text-violet-700",
  };

  return (
    <div className={cn("rounded-[24px] border-l-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md", palette[severity])}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-slate-900 shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Recommendation
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
              {action}
            </button>
            <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50">
              Learn More
            </button>
            <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50">
              Dismiss
            </button>
            <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50">
              Mark Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05),0_18px_50px_rgba(15,23,42,0.06)]", className)}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-2xl shimmer" />
          <div className="h-4 w-40 rounded-full shimmer" />
        </div>
        <div className="h-48 rounded-3xl shimmer" />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-hidden="true" aria-busy="true" className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonBlock key={index} />
          ))}
        </div>
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
      <div className="space-y-6">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBlock key={index} />
        ))}
      </div>
    </div>
  );
}

function SpeedDial() {
  const [open, setOpen] = useState(false);
  const actions = [
    { label: "Create Invoice", icon: Plus },
    { label: "Record Payment", icon: ReceiptText },
    { label: "Send Reminder", icon: Send },
    { label: "Export", icon: FileDown },
    { label: "Add Customer", icon: Users },
  ];

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      <div
        className={cn(
          "flex origin-bottom-right flex-col items-end gap-2 transition-all duration-200 ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-95 opacity-0"
        )}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            aria-label={action.label}
            className="flex items-center gap-3 rounded-full border border-white/70 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.08),0_24px_60px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white">
              <action.icon className="h-4 w-4" />
            </span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_rgba(15,23,42,0.08),0_24px_60px_rgba(15,23,42,0.12)] transition duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-0.5 hover:bg-slate-800"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </div>
  );
}

export function ArManagerDashboard({ title = "AR Manager Dashboard" }: { title?: string }) {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company>(DEMO_COMPANY);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [reminders, setReminders] = useState<ReminderLog[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Invoice["status"]>("all");
  const [sortKey, setSortKey] = useState<"due" | "outstanding" | "invoice_date">("due");
  const [page, setPage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isConfigured || !supabase) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const [
          companyRes,
          customersRes,
          invoicesRes,
          receiptsRes,
          allocationsRes,
          remindersRes,
        ] = await Promise.all([
          supabase.from("company").select("*").maybeSingle(),
          supabase.from("customers").select("*").order("name", { ascending: true }),
          supabase
            .from("invoices")
            .select("*, customers(id, code, name, credit_limit, credit_days, opening_balance, contact_person, email, phone)")
            .order("invoice_date", { ascending: false }),
          supabase.from("receipts").select("*").order("receipt_date", { ascending: false }),
          supabase.from("receipt_allocations").select("*"),
          supabase.from("reminder_log").select("*").order("sent_at", { ascending: false }).limit(30),
        ]);

        const customerList = (customersRes.data ?? []) as Customer[];
        const invoiceData = (invoicesRes.data ?? []) as Array<Invoice & { customers: Customer | null }>;
        const allocationData = (allocationsRes.data ?? []) as ReceiptAllocation[];

        const allocationMap = new Map<string, number>();
        allocationData.forEach((allocation) => {
          allocationMap.set(allocation.invoice_id, (allocationMap.get(allocation.invoice_id) ?? 0) + allocation.amount);
        });

        const today = parseDate(todayStr());
        const rows: InvoiceRow[] = invoiceData.map((invoice) => {
          const allocated = allocationMap.get(invoice.id) ?? 0;
          const outstanding = outstandingAmount(invoice, allocationData);
          const dueDate = parseDate(invoice.due_date);
          const daysOverdue = isOverdue(invoice) ? Math.max(0, daysBetween(dueDate, today)) : 0;
          let priority: InvoiceRow["priority"] = "Low";

          if (outstanding > 0 && daysOverdue >= 30) {
            priority = "Critical";
          } else if (outstanding > 0 && daysOverdue >= 1) {
            priority = "High";
          } else if (outstanding > 0 && invoice.status === "partial") {
            priority = "Medium";
          }

          return {
            ...invoice,
            customer: invoice.customers,
            allocated,
            outstanding,
            daysOverdue,
            priority,
          };
        });

        if (!cancelled) {
          setCompany(companyRes.data ?? DEMO_COMPANY);
          setCustomers(customerList);
          setInvoices(rows);
          setReceipts((receiptsRes.data ?? []) as Receipt[]);
          setReminders((remindersRes.data ?? []) as ReminderLog[]);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = parseDate(todayStr());
  const monthStart = startOfMonth(today);
  const monthKeyValue = monthKey(monthStart);
  const prevMonthKeyValue = monthKey(addMonths(monthStart, -1));

  const activeCustomers = useMemo(() => {
    return new Set(invoices.map((invoice) => invoice.customer_id)).size;
  }, [invoices]);

  const customerLookup = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const invoiceRows = invoices.map((invoice) => ({
    ...invoice,
    customer: invoice.customer ?? customerLookup.get(invoice.customer_id) ?? null,
  }));

  const unpaidInvoices = invoiceRows.filter(isUnpaid);
  const overdueInvoices = invoiceRows.filter((invoice) => isOverdue(invoice));
  const totalOutstanding = unpaidInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0);
  const totalReceivable = invoiceRows.reduce((sum, invoice) => sum + invoice.total, 0);
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0);
  const collectedThisMonth = receipts
    .filter((receipt) => monthKey(parseDate(receipt.receipt_date)) === monthKeyValue)
    .reduce((sum, receipt) => sum + receipt.amount, 0);
  const collectedPrevMonth = receipts
    .filter((receipt) => monthKey(parseDate(receipt.receipt_date)) === prevMonthKeyValue)
    .reduce((sum, receipt) => sum + receipt.amount, 0);
  const openInvoiceCount = unpaidInvoices.length;
  const pendingFollowups = overdueInvoices.filter((invoice) => invoice.daysOverdue >= 0).length + invoiceRows.filter((invoice) => !isOverdue(invoice) && invoice.outstanding > 0 && daysBetween(parseDate(invoice.due_date), today) <= 3).length;

  const receivableTrend = groupByMonth(invoiceRows, (invoice) => invoice.invoice_date, (invoice) => invoice.outstanding);
  const collectionTrend = groupByMonth(receipts, (receipt) => receipt.receipt_date, (receipt) => receipt.amount);
  const collectionsVsReceivables = receivableTrend.map((point, index) => ({
    label: point.label,
    value: collectionTrend[index]?.value ?? 0,
    value2: point.value,
  }));

  const agingBuckets = [
    {
      label: "Not due",
      value: unpaidInvoices.filter((invoice) => parseDate(invoice.due_date) >= today).reduce((sum, invoice) => sum + invoice.outstanding, 0),
      color: "#2563eb",
    },
    {
      label: "0-30",
      value: overdueInvoices.filter((invoice) => invoice.daysOverdue <= 30).reduce((sum, invoice) => sum + invoice.outstanding, 0),
      color: "#2f6bff",
    },
    {
      label: "31-60",
      value: overdueInvoices.filter((invoice) => invoice.daysOverdue > 30 && invoice.daysOverdue <= 60).reduce((sum, invoice) => sum + invoice.outstanding, 0),
      color: "#f59e0b",
    },
    {
      label: "61-90",
      value: overdueInvoices.filter((invoice) => invoice.daysOverdue > 60 && invoice.daysOverdue <= 90).reduce((sum, invoice) => sum + invoice.outstanding, 0),
      color: "#ef4444",
    },
    {
      label: "90+",
      value: overdueInvoices.filter((invoice) => invoice.daysOverdue > 90).reduce((sum, invoice) => sum + invoice.outstanding, 0),
      color: "#7c3aed",
    },
  ];

  const paidAmount = invoiceRows.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.total, 0);
  const badDebt = agingBuckets.find((bucket) => bucket.label === "90+")?.value ?? 0;

  const customerRisks: CustomerRiskRow[] = customers
    .map((customer) => {
      const invoicesForCustomer = invoiceRows.filter((invoice) => invoice.customer_id === customer.id);
      const outstanding = invoicesForCustomer.reduce((sum, invoice) => sum + invoice.outstanding, 0);
      const overdue = invoicesForCustomer.filter((invoice) => isOverdue(invoice)).reduce((sum, invoice) => sum + invoice.outstanding, 0);
      const creditUtilization = customer.credit_limit > 0 ? outstanding / customer.credit_limit : 0;
      const overdueInvoicesForCustomer = invoicesForCustomer.filter((invoice) => isOverdue(invoice));
      const averageDelay = overdueInvoicesForCustomer.length
        ? overdueInvoicesForCustomer.reduce((sum, invoice) => sum + invoice.daysOverdue, 0) / overdueInvoicesForCustomer.length
        : 0;
      const openInvoices = invoicesForCustomer.filter((invoice) => isUnpaid(invoice)).length;
      const paymentBehavior =
        overdue / Math.max(outstanding, 1) > 0.55
          ? "Late payer"
          : creditUtilization > 0.85
          ? "Near limit"
          : openInvoices > 4
          ? "High touch"
          : "Healthy";
      const riskScore = clamp(
        Math.round(creditUtilization * 45 + (averageDelay / 2) + (overdue > 0 ? 18 : 0) + openInvoices * 3),
        0,
        100
      );
      const collectionProbability = clamp(98 - riskScore * 0.7, 5, 98);
      const segment = riskScore < 20 ? "Excellent" : riskScore < 35 ? "Good" : riskScore < 55 ? "Average" : riskScore < 75 ? "Poor" : "High Risk";
      return {
        customer,
        outstanding,
        overdue,
        riskScore,
        paymentBehavior,
        creditUtilization,
        averageDelay,
        collectionProbability,
        segment,
        openInvoices,
      };
    })
    .filter((row) => row.outstanding > 0)
    .sort((a, b) => b.riskScore - a.riskScore);

  const topRiskCustomers = customerRisks.slice(0, 5);
  const highRiskCustomers = customerRisks.filter((row) => row.riskScore >= 70).length;
  const invoicesNeedingAttention = invoiceRows
    .filter((invoice) => invoice.outstanding > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding)
    .slice(0, 10);

  const topPriorityInvoices = invoicesNeedingAttention.slice(0, 10);

  const invoicedTrend = groupByMonth(invoiceRows, (invoice) => invoice.invoice_date, (invoice) => invoice.total);
  const monthlyOutstanding = receivableTrend.map((point) => point.value);
  const monthlyReceipts = collectionTrend.map((point) => point.value);
  const monthlyTrend = monthlyReceipts.map((value, index) => value - (monthlyOutstanding[index] ?? 0));
  const outstandingTrend = monthlyOutstanding.length ? monthlyOutstanding : [0];
  const monthTrend = momTrend(outstandingTrend);
  const receiptTrend = momTrend(monthlyReceipts);
  const receivableTrendPercent = momTrend(invoicedTrend.map((point) => point.value));
  const collectionEfficiency = clamp((collectedThisMonth / Math.max(collectedThisMonth + overdueAmount + 1, 1)) * 100, 0, 100);
  const prevCollectionEfficiency = clamp((collectedPrevMonth / Math.max(collectedPrevMonth + overdueAmount + 1, 1)) * 100, 0, 100);
  const collectionEfficiencyTrend = clamp(collectionEfficiency - prevCollectionEfficiency, -100, 100);
  const averageCollectionPeriod = unpaidInvoices.length
    ? Math.round(unpaidInvoices.reduce((sum, invoice) => sum + daysBetween(parseDate(invoice.invoice_date), today), 0) / unpaidInvoices.length)
    : 0;
  const overdueShareOfReceivable = totalReceivable > 0 ? (overdueAmount / totalReceivable) * 100 : 0;
  const openInvoiceShare = invoiceRows.length > 0 ? (openInvoiceCount / invoiceRows.length) * 100 : 0;
  const followupsDueSoon = Math.max(pendingFollowups - overdueInvoices.length, 0);
  const next7DaysExpected = invoiceRows
    .filter((invoice) => invoice.outstanding > 0 && parseDate(invoice.due_date) >= today && daysBetween(today, parseDate(invoice.due_date)) <= 7)
    .reduce((sum, invoice) => sum + invoice.outstanding, 0);
  const top5Share = totalOutstanding > 0 ? (topRiskCustomers.reduce((sum, row) => sum + row.outstanding, 0) / totalOutstanding) * 100 : 0;

  const smartInsights = [
    {
      severity: "red" as const,
      icon: AlertTriangle,
      title: "Outstanding is rising this month",
      description: `Outstanding increased by ${Math.abs(monthTrend).toFixed(0)}% this month. Focus on the highest-value overdue accounts first.`,
      action: "Review overdue queue",
    },
    {
      severity: "emerald" as const,
      icon: BadgeCheck,
      title: "Collections are improving",
      description: `Collections improved by ${Math.abs(receiptTrend).toFixed(0)}% month over month. Keep the momentum with today’s follow-ups.`,
      action: "Share with team",
    },
    {
      severity: "amber" as const,
      icon: Clock3,
      title: "Upcoming overdue risk",
      description: `${invoiceRows.filter((invoice) => invoice.daysOverdue > 0 && invoice.daysOverdue <= 3).length} invoices become overdue within 3 days.`,
      action: "Pre-send reminder",
    },
    {
      severity: "blue" as const,
      icon: ShieldAlert,
      title: "Credit limit warning",
      description: `${topRiskCustomers[0]?.customer.name ?? "Top customer"} has crossed ${pct(topRiskCustomers[0]?.creditUtilization ?? 0)} of credit limit.`,
      action: "Open customer",
    },
    {
      severity: "purple" as const,
      icon: Users,
      title: "Receivables concentration",
      description: `Top 5 customers account for ${pct(top5Share)} of receivables.`,
      action: "Export concentration",
    },
    {
      severity: "blue" as const,
      icon: CircleDollarSign,
      title: "Expected cash next week",
      description: `Expected cash inflow next week is ${formatCompactCurrency(next7DaysExpected)}.`,
      action: "Review forecast",
    },
  ];

  const derivedActivities: ActivityRow[] = [
    ...receipts.slice(0, 5).map((receipt) => ({
      id: receipt.id,
      kind: "payment" as const,
      title: `Payment received from ${customerLookup.get(receipt.customer_id)?.name ?? "a customer"}`,
      detail: `Receipt ${receipt.receipt_no} · ${receipt.mode.toUpperCase()} · ${formatDate(receipt.receipt_date)}`,
      amount: receipt.amount,
      at: receipt.receipt_date,
    })),
    ...reminders.slice(0, 5).map((reminder) => ({
      id: reminder.id,
      kind: "reminder" as const,
      title: reminder.subject ?? "Reminder sent",
      detail: reminder.to_email ? `Sent to ${reminder.to_email}` : "Reminder logged",
      at: reminder.sent_at,
    })),
    ...invoicesNeedingAttention.slice(0, 3).map((invoice) => ({
      id: invoice.id,
      kind: "warning" as const,
      title: `${invoice.invoice_no} requires attention`,
      detail: `${invoice.customer?.name ?? "Unknown customer"} is ${invoice.daysOverdue} days overdue`,
      amount: invoice.outstanding,
      at: invoice.due_date,
    })),
  ].sort((a, b) => parseDate(b.at).getTime() - parseDate(a.at).getTime());

  const selectedInvoice = invoiceRows.find((invoice) => invoice.id === selectedInvoiceId) ?? invoiceRows[0] ?? null;

  useEffect(() => {
    if (!selectedInvoiceId && invoiceRows[0]) {
      setSelectedInvoiceId(invoiceRows[0].id);
    }
  }, [selectedInvoiceId, invoiceRows]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = invoiceRows.filter((invoice) => {
      const matchesSearch =
        !q ||
        invoice.invoice_no.toLowerCase().includes(q) ||
        invoice.customer?.name.toLowerCase().includes(q) ||
        invoice.customer?.code.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" ? true : invoice.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "outstanding") return b.outstanding - a.outstanding;
      if (sortKey === "invoice_date") return parseDate(b.invoice_date).getTime() - parseDate(a.invoice_date).getTime();
      return parseDate(a.due_date).getTime() - parseDate(b.due_date).getTime();
    });

    return sorted;
  }, [invoiceRows, search, sortKey, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey]);

  const pageCount = Math.max(Math.ceil(filteredInvoices.length / PAGE_SIZE), 1);
  const pagedInvoices = filteredInvoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);


  const healthSegments = customerRisks.reduce<Record<string, { count: number; outstanding: number }>>((acc, row) => {
    const key = row.segment;
    acc[key] ??= { count: 0, outstanding: 0 };
    acc[key].count += 1;
    acc[key].outstanding += row.outstanding;
    return acc;
  }, {});

  const notificationItems: ActivityRow[] = [
    ...invoicesNeedingAttention.slice(0, 3).map((invoice) => ({
      id: `n-${invoice.id}`,
      kind: "warning" as const,
      title: `Invoice ${invoice.invoice_no} overdue today`,
      detail: `${invoice.customer?.name ?? "Unknown customer"} · ${formatCompactCurrency(invoice.outstanding)}`,
      at: invoice.due_date,
    })),
    ...receipts.slice(0, 2).map((receipt) => ({
      id: `r-${receipt.id}`,
      kind: "payment" as const,
      title: `Payment received from ${customerLookup.get(receipt.customer_id)?.name ?? "Customer"}`,
      detail: `${receipt.receipt_no} · ${receipt.mode.toUpperCase()}`,
      at: receipt.receipt_date,
      amount: receipt.amount,
    })),
  ];

  const actionItems = [
    { icon: Plus, label: "Create Invoice" },
    { icon: ReceiptText, label: "Record Payment" },
    { icon: Upload, label: "Import Invoices" },
    { icon: FileDown, label: "Export Report" },
    { icon: Send, label: "Send Bulk Reminder" },
    { icon: CircleDollarSign, label: "Generate Statement" },
  ];

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(47,107,255,0.14),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_38%,_#f8fafc_100%)] text-slate-800">
      <div className="sticky top-0 z-30 border-b border-white/60 bg-white/75 px-5 py-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
              <span>Finance</span>
              <span>•</span>
              <span>AR Command Center</span>
              <span>•</span>
              <span>{company.name}</span>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
              <h1 className="text-[32px] font-semibold tracking-tight text-slate-950">{title}</h1>
              <p className="text-sm text-slate-500">
                {new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(today)}
              </p>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              Good morning, Finance team. You have {formatCompactCurrency(totalOutstanding)} outstanding across {openInvoiceCount} open invoices.
              {invoicesNeedingAttention.length} invoices require immediate attention today, and {pendingFollowups} need follow-up this week.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoices, customers"
                className="w-52 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
              <Bell className="h-4 w-4" />
              Alerts
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-5 py-6 lg:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <>
              {Array.from({ length: 9 }, (_, index) => (
                <SkeletonCard key={index} />
              ))}
            </>
          ) : (
            <>
              <StatCard
                label="Total Outstanding"
                value={totalOutstanding}
                format={formatCompactCurrency}
                badge={{ kind: "trend", value: monthTrend }}
                icon={Wallet}
                sparkline={outstandingTrend}
                subtitle={`${openInvoiceCount} open invoices, ${overdueInvoices.length} already overdue`}
              />
              <StatCard
                label="Total Receivable"
                value={totalReceivable}
                format={formatCompactCurrency}
                badge={{ kind: "trend", value: receivableTrendPercent }}
                icon={Files}
                sparkline={invoicedTrend.map((point) => point.value)}
                subtitle="Gross receivables across the full invoice book"
              />
              <StatCard
                label="Overdue Amount"
                value={overdueAmount}
                format={formatCompactCurrency}
                badge={{ kind: "note", text: `${pct(overdueShareOfReceivable)} of total receivables` }}
                icon={AlertTriangle}
                sparkline={agingBuckets.map((bucket) => bucket.value)}
                subtitle={`${overdueInvoices.length} invoices need attention now`}
              />
              <StatCard
                label="Collection Efficiency"
                value={collectionEfficiency}
                format={(v) => pct(v)}
                badge={{ kind: "trend", value: collectionEfficiencyTrend, unit: "pts" }}
                icon={BadgeCheck}
                sparkline={monthlyReceipts.length ? monthlyReceipts : [0]}
                subtitle={`₹${formatCompactCurrency(collectedThisMonth)} collected this month`}
              />
              <StatCard
                label="Average Collection Period"
                value={averageCollectionPeriod}
                format={(v) => `${Math.round(v)} Days`}
                badge={{ kind: "note", text: "Benchmark 30–45 days" }}
                icon={Clock3}
                sparkline={[41, 39, 37, 35, 34, 33, averageCollectionPeriod]}
                subtitle="Days between invoice date and payment signal"
              />
              <StatCard
                label="Active Customers"
                value={activeCustomers}
                badge={{ kind: "note", text: `of ${customers.length} total customers` }}
                icon={Users}
                sparkline={customerRisks.slice(0, 6).map((row) => row.outstanding)}
                subtitle="Customers with at least one invoice"
              />
              <StatCard
                label="Open Invoices"
                value={openInvoiceCount}
                badge={{ kind: "note", text: `${pct(openInvoiceShare)} of all invoices` }}
                icon={ReceiptText}
                sparkline={invoicesNeedingAttention.map((invoice) => invoice.outstanding)}
                subtitle="Everything still waiting to be collected"
              />
              <StatCard
                label="High Risk Customers"
                value={highRiskCustomers}
                badge={{ kind: "note", text: `of ${customerRisks.length} carrying a balance` }}
                icon={ShieldAlert}
                sparkline={topRiskCustomers.map((row) => row.riskScore)}
                subtitle="Customers with elevated collection risk"
              />
              <StatCard
                label="Pending Follow-ups"
                value={pendingFollowups}
                badge={{ kind: "note", text: `${overdueInvoices.length} overdue, ${followupsDueSoon} due soon` }}
                icon={Activity}
                sparkline={notificationItems.map((item) => item.amount ?? 0)}
                subtitle="Calls, emails, WhatsApp nudges and escalations"
              />
            </>
          )}
        </div>

        {loading ? (
          <DashboardSkeleton />
        ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Outstanding Trend" subtitle="Last 12 months of open receivables" icon={ArrowUpRight}>
                <TrendLineChart data={receivableTrend} />
              </Card>
              <Card title="Collections vs Receivables" subtitle="Area view of collection momentum against receivable build-up" icon={Wallet}>
                <SplitAreaChart data={collectionsVsReceivables} />
              </Card>
              <Card title="Invoice Aging" subtitle="Outstanding split across aging buckets" icon={AlertTriangle}>
                <AgingBarChart buckets={agingBuckets} />
              </Card>
              <Card title="Receivable Distribution" subtitle="Paid, outstanding, overdue and bad debt" icon={BadgeCheck}>
                <DistributionDonut
                  segments={[
                    { label: "Paid", value: paidAmount, color: "#10b981" },
                    { label: "Outstanding", value: totalOutstanding, color: "#2563eb" },
                    { label: "Overdue", value: overdueAmount, color: "#ef4444" },
                    { label: "Bad Debt", value: badDebt, color: "#7c3aed" },
                  ]}
                />
              </Card>
              <Card title="Monthly Collections" subtitle="Cash collected by month" icon={IndianRupee}>
                <CollectionsColumnChart data={collectionTrend} color="#2f6bff" />
              </Card>
              <Card title="Customer Payment Trend" subtitle="Monthly inflows by customer payment rhythm" icon={Activity}>
                <TrendLineChart
                  data={collectionTrend.map((point, index) => ({
                    label: point.label,
                    value: point.value + (monthlyTrend[index] ?? 0),
                    value2: point.value,
                  }))}
                  secondaryKey="value2"
                />
              </Card>
            </div>

            <Card
              title="Top Priority Invoices"
              subtitle="Maximum 10 invoices sorted by urgency"
              icon={AlertTriangle}
              action={<SectionChip>Critical / High / Medium / Low</SectionChip>}
            >
              <div className="grid gap-3">
                {topPriorityInvoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                    className={cn(
                      "grid gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg",
                      selectedInvoiceId === invoice.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-100 bg-white"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{invoice.invoice_no}</p>
                          <Badge tone={PRIORITY_TONE[invoice.priority]} inverted={selectedInvoiceId === invoice.id}>
                            {invoice.priority}
                          </Badge>
                          <Badge tone={STATUS_TONE[invoice.status]} inverted={selectedInvoiceId === invoice.id}>
                            {invoice.status}
                          </Badge>
                        </div>
                        <p className={cn("mt-1 text-sm", selectedInvoiceId === invoice.id ? "text-white/75" : "text-slate-500")}>
                          {invoice.customer?.name ?? "Unknown customer"} · Due {formatDate(invoice.due_date)} · {invoice.daysOverdue} days overdue
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold">{formatCompactCurrency(invoice.outstanding)}</p>
                        <p className={cn("text-xs", selectedInvoiceId === invoice.id ? "text-white/65" : "text-slate-500")}>
                          {formatCompactCurrency(invoice.allocated)} collected
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.2em]">
                      <span className={cn("rounded-full px-2.5 py-1 font-semibold", selectedInvoiceId === invoice.id ? "bg-white/10 text-white/85" : "bg-slate-100 text-slate-600")}>View</span>
                      <div className="flex flex-wrap gap-2">
                        <span className={cn("rounded-full px-2.5 py-1 font-semibold", selectedInvoiceId === invoice.id ? "bg-white/10 text-white/85" : "bg-slate-100 text-slate-600")}>Reminder</span>
                        <span className={cn("rounded-full px-2.5 py-1 font-semibold", selectedInvoiceId === invoice.id ? "bg-white/10 text-white/85" : "bg-slate-100 text-slate-600")}>Record Payment</span>
                        <span className={cn("rounded-full px-2.5 py-1 font-semibold", selectedInvoiceId === invoice.id ? "bg-white/10 text-white/85" : "bg-slate-100 text-slate-600")}>Call Customer</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Recent Invoices" subtitle="Search, sort, paginate and drill into an invoice" icon={Files}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search invoice no or customer"
                    className="w-full border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="partial">Partial</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </select>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
                >
                  <option value="due">Sort by Due Date</option>
                  <option value="outstanding">Sort by Outstanding</option>
                  <option value="invoice_date">Sort by Invoice Date</option>
                </select>
                <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  <Filter className="h-4 w-4" />
                  Filter
                </button>
                <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  <FileDown className="h-4 w-4" />
                  Export
                </button>
              </div>

              <div className="overflow-hidden rounded-3xl border border-slate-100">
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                      <tr>
                        <th className="px-4 py-3 font-medium">Invoice No</th>
                        <th className="px-4 py-3 font-medium">Customer</th>
                        <th className="px-4 py-3 font-medium">Invoice Date</th>
                        <th className="px-4 py-3 font-medium">Due Date</th>
                        <th className="px-4 py-3 font-medium">Total</th>
                        <th className="px-4 py-3 font-medium">Paid</th>
                        <th className="px-4 py-3 font-medium">Outstanding</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Assigned To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-16 text-center">
                            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                                <Files className="h-5 w-5" />
                              </div>
                              <p className="text-sm font-semibold text-slate-950">No invoices match your filters</p>
                              <p className="text-sm leading-6 text-slate-500">Try widening the search or clearing the status filter to bring invoices back into view.</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearch("");
                                  setStatusFilter("all");
                                  setSortKey("due");
                                }}
                                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                              >
                                Reset filters
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        pagedInvoices.map((invoice, index) => (
                          <tr
                            key={invoice.id}
                            tabIndex={0}
                            role="button"
                            aria-label={`View invoice ${invoice.invoice_no} for ${invoice.customer?.name ?? "Unknown customer"}`}
                            aria-selected={selectedInvoiceId === invoice.id}
                            onClick={() => setSelectedInvoiceId(invoice.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedInvoiceId(invoice.id);
                              }
                            }}
                            className={cn(
                              "cursor-pointer border-b border-slate-100 outline-none transition-colors duration-200 hover:bg-slate-50 focus-visible:bg-blue-50/70 focus-visible:shadow-[inset_0_0_0_2px_rgba(47,107,255,0.35)]",
                              index % 2 === 0 ? "bg-white" : "bg-slate-50/60",
                              selectedInvoiceId === invoice.id ? "bg-blue-50/70" : ""
                            )}
                          >
                            <td className="px-4 py-3 font-semibold text-slate-950">{invoice.invoice_no}</td>
                            <td className="px-4 py-3 text-slate-600">{invoice.customer?.name ?? "Unknown customer"}</td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(invoice.invoice_date)}</td>
                            <td className="px-4 py-3 text-slate-600">{formatDate(invoice.due_date)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{formatCompactCurrency(invoice.total)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{formatCompactCurrency(invoice.allocated)}</td>
                            <td className="px-4 py-3 font-semibold text-slate-950">{formatCompactCurrency(invoice.outstanding)}</td>
                            <td className="px-4 py-3">
                              <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{hashOwner(invoice.customer?.name ?? invoice.invoice_no)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                <p>
                  Showing {Math.min((page - 1) * PAGE_SIZE + 1, filteredInvoices.length)} to {Math.min(page * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length} invoices
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium shadow-sm disabled:opacity-50"
                    disabled={page === 1}
                  >
                    Previous
                  </button>
                  <span className="rounded-xl bg-slate-950 px-3 py-2 font-medium text-white">
                    Page {page} of {pageCount}
                  </span>
                  <button
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium shadow-sm disabled:opacity-50"
                    disabled={page === pageCount}
                  >
                    Next
                  </button>
                </div>
              </div>
            </Card>

            <Card title="Overdue Invoices" subtitle="Invoices that need immediate action" icon={AlertTriangle}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {overdueInvoices.slice(0, 6).map((invoice) => (
                  <div key={invoice.id} className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-rose-950">{invoice.invoice_no}</p>
                        <p className="mt-1 text-xs text-rose-700">{invoice.customer?.name ?? "Unknown customer"}</p>
                      </div>
                      <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                        {invoice.daysOverdue}d
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-rose-500">Outstanding</p>
                        <p className="text-lg font-semibold text-rose-950">{formatCompactCurrency(invoice.outstanding)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-rose-600">
                        <span className="rounded-full bg-white/90 px-2.5 py-1 font-semibold shadow-sm">Reminder</span>
                        <span className="rounded-full bg-white/90 px-2.5 py-1 font-semibold shadow-sm">Call</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card title="Quick View" subtitle="The selected invoice at a glance" icon={Search}>
              {selectedInvoice ? (
                <div className="space-y-4">
                  <div className="rounded-3xl bg-slate-950 p-4 text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-white/50">Selected invoice</p>
                        <p className="mt-1 text-lg font-semibold">{selectedInvoice.invoice_no}</p>
                        <p className="mt-1 text-sm text-white/70">{selectedInvoice.customer?.name ?? "Unknown customer"}</p>
                      </div>
                      <Badge tone={STATUS_TONE[selectedInvoice.status]} inverted>
                        {selectedInvoice.status}
                      </Badge>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-white/50">Outstanding</p>
                        <p className="mt-1 font-semibold">{formatCompactCurrency(selectedInvoice.outstanding)}</p>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-white/50">Due date</p>
                        <p className="mt-1 font-semibold">{formatDate(selectedInvoice.due_date)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/70">
                      <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold">Owner {hashOwner(selectedInvoice.customer?.name ?? selectedInvoice.invoice_no)}</span>
                      <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold">{selectedInvoice.daysOverdue} days overdue</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15">View Invoice</button>
                    <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">Record Payment</button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Select an invoice from the priority list or recent table.</div>
              )}
            </Card>

            <Card title="Customer Risk" subtitle="Top risky customers and payment behavior" icon={ShieldAlert}>
              <div className="space-y-3">
                {topRiskCustomers.map((row) => (
                  <div key={row.customer.id} className="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{row.customer.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.paymentBehavior} · {formatCompactCurrency(row.outstanding)} outstanding
                        </p>
                      </div>
                      <Badge tone={row.segment === "High Risk" ? "danger" : row.segment === "Poor" ? "warning" : "info"}>
                        {row.riskScore}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-3 text-xs text-slate-600">
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="uppercase tracking-[0.2em] text-slate-400">Credit Utilization</p>
                          <p className="font-semibold text-slate-950">{pct(row.creditUtilization * 100)}</p>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200">
                          <div className="h-2 rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${clamp(row.creditUtilization * 100, 4, 100)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="uppercase tracking-[0.2em] text-slate-400">Collection Probability</p>
                          <p className="font-semibold text-slate-950">{pct(row.collectionProbability)}</p>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200">
                          <div className="h-2 rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${row.collectionProbability}%` }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <p className="uppercase tracking-[0.2em] text-slate-400">Average Delay</p>
                          <p className="mt-1 font-semibold text-slate-950">{Math.round(row.averageDelay)} days</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-[0.2em] text-slate-400">Open Invoices</p>
                          <p className="mt-1 font-semibold text-slate-950">{row.openInvoices}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Smart Insights" subtitle="AI-style business commentary" icon={BrainCircuit}>
              <div className="space-y-3">
                {smartInsights.map((insight) => (
                  <InsightCard
                    key={insight.title}
                    severity={insight.severity}
                    icon={insight.icon}
                    title={insight.title}
                    description={insight.description}
                    action={insight.action}
                  />
                ))}
              </div>
            </Card>

            <Card title="Today's Follow-ups" subtitle="Pending calls, emails, WhatsApp reminders and escalations" icon={Send}>
              <div className="space-y-3">
                {invoicesNeedingAttention.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{invoice.customer?.name ?? "Unknown customer"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Due today · Priority {invoice.priority.toLowerCase()} · Owner {hashOwner(invoice.customer?.name ?? invoice.invoice_no)}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                      {formatCompactCurrency(invoice.outstanding)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Payment Activity" subtitle="Recent inflows and reminder log" icon={Activity}>
              <div className="space-y-3">
                {derivedActivities.slice(0, 6).map((activity) => (
                  <TimelineItem
                    key={activity.id}
                    icon={activity.kind === "payment" ? BadgeCheck : activity.kind === "reminder" ? RefreshCcw : AlertTriangle}
                    title={activity.title}
                    detail={activity.detail}
                    amount={activity.amount}
                    at={formatDate(activity.at)}
                    tone={activity.kind === "payment" ? "emerald" : activity.kind === "reminder" ? "blue" : "amber"}
                  />
                ))}
              </div>
            </Card>

            <Card title="Notification Center" subtitle="Operational alerts and finance reminders" icon={Bell}>
              <div className="space-y-3">
                {notificationItems.map((activity) => (
                  <TimelineItem
                    key={activity.id}
                    icon={activity.kind === "payment" ? BadgeCheck : AlertTriangle}
                    title={activity.title}
                    detail={activity.detail}
                    amount={activity.amount}
                    at={formatDate(activity.at)}
                    tone={activity.kind === "payment" ? "emerald" : "red"}
                  />
                ))}
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  GST filing reminder · E-invoice generated · Customer exceeded credit limit
                </div>
              </div>
            </Card>

            <Card title="Collection Performance" subtitle="Leader-style summary of team outcomes" icon={Users}>
              <div className="space-y-3">
                {[
                  { name: "North Pod", amount: collectedThisMonth * 0.34, invoicesClosed: 18, success: 96, recovery: 28 },
                  { name: "West Pod", amount: collectedThisMonth * 0.29, invoicesClosed: 14, success: 93, recovery: 31 },
                  { name: "South Pod", amount: collectedThisMonth * 0.24, invoicesClosed: 11, success: 89, recovery: 34 },
                  { name: "East Pod", amount: collectedThisMonth * 0.13, invoicesClosed: 7, success: 84, recovery: 39 },
                ].map((row) => (
                  <div key={row.name} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{row.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.invoicesClosed} invoices closed · {row.recovery} day recovery
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-950">{pct(row.success)}</p>
                      <p className="text-xs text-slate-500">{formatCompactCurrency(row.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Invoice Aging Summary" subtitle="Overview by bucket" icon={Files}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {agingBuckets.map((bucket) => (
                  <div key={bucket.label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{bucket.label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{formatCompactCurrency(bucket.value)}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (bucket.value / Math.max(totalOutstanding, 1)) * 100)}%`, background: bucket.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Customer Health Score" subtitle="Segment counts and exposure" icon={BadgeCheck}>
              <div className="space-y-3">
                {["Excellent", "Good", "Average", "Poor", "High Risk"].map((segment) => {
                  const summary = healthSegments[segment] ?? { count: 0, outstanding: 0 };
                  return (
                    <div key={segment} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{segment}</p>
                        <p className="mt-1 text-xs text-slate-500">{summary.count} customers · {formatCompactCurrency(summary.outstanding)} outstanding</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{pct((summary.outstanding / Math.max(totalOutstanding, 1)) * 100)}</p>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Quick Actions" subtitle="Always-visible command center" icon={Plus}>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {actionItems.map((item) => (
                  <button
                    key={item.label}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Global Filters" subtitle="Scoping controls for the whole dashboard" icon={Filter}>
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((filter) => (
                  <button
                    key={filter}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
        )}
      </div>
      <SpeedDial />
    </div>
  );
}

function TrendLineChart({ data, secondaryKey }: { data: ChartPoint[]; secondaryKey?: "value2" }) {
  const lineId = useId();
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 to-slate-800 p-4 text-white">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={lineId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="value" stroke="#7dd3fc" strokeWidth={3} fill={`url(#${lineId})`} isAnimationActive name="Outstanding" />
            {secondaryKey ? (
              <Area type="monotone" dataKey={secondaryKey} stroke="#c084fc" strokeWidth={2} strokeDasharray="6 6" fill="transparent" isAnimationActive name="Prior" />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SplitAreaChart({ data }: { data: ChartPoint[] }) {
  const areaId = useId();
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-white to-slate-100 p-4">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#2f6bff" stopOpacity="0.03" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="value" stroke="#2f6bff" strokeWidth={3} fill={`url(#${areaId})`} isAnimationActive name="Collections" />
            <Area type="monotone" dataKey="value2" stroke="#0f172a" strokeWidth={2} strokeDasharray="8 8" fill="transparent" isAnimationActive name="Receivables" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CollectionsColumnChart({ data, color }: { data: ChartPoint[]; color: string }) {
  return (
    <div className="rounded-3xl bg-slate-950 p-4 text-white">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
            <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={36} fill={color} isAnimationActive name="Collected" />
          </RBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function hashOwner(seed: string) {
  const owners = ["Alex", "Mira", "Jordan", "Priya", "Noah", "Sana"];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % owners.length;
  }
  return owners[hash];
}
