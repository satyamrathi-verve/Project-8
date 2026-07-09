import type { ReactNode } from "react";

/*
  A compact, single-line summary of key counts above a list — the accounting-
  software alternative to a dashboard's KPI card grid. Numbers only, no
  charts, no sparklines: "Total 42 · Assets 12 Liabilities 8 …". Use this on
  every list screen instead of building a new stat-card layout each time.
*/
export function SummaryStrip({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-card dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  );
}

export function SummaryStat({ label, value, hex, muted }: { label: string; value: number | string; hex?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      {hex && <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />}
      <span className={`text-base font-semibold tabular-nums ${muted ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"}`}>{value}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

export function StatDivider() {
  return <span className="hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" />;
}
