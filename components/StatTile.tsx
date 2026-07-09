/*
  A single overview number for the Dashboard / Cashflow-style screens. Reuse this
  for every tile instead of building bespoke cards per screen.
*/
const TONES = {
  default: "text-slate-900",
  brand: "text-brand",
  warning: "text-amber-600",
  danger: "text-red-600",
} as const;

export function StatTile({
  label,
  value,
  subtitle,
  tone = "default",
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${TONES[tone]}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
}
