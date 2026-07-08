"use client";

import { motion } from "framer-motion";

/*
  Tiny, dependency-free, dark-aware charts for compact ERP analytics.
  Restrained palette; everything scales to its container. Used by the GL
  analytics strip and the summary-card sparklines.
*/

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/* ---- Donut (Account Type Distribution) ---- */
export function Donut({ data, size = 132, thickness = 16 }: { data: Slice[]; size?: number; thickness?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-slate-100 dark:stroke-slate-800" />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const seg = (
            <motion.circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${c}` }}
              animate={{ strokeDasharray: `${Math.max(len - 2, 0)} ${c - Math.max(len - 2, 0)}` }}
              transition={{ duration: 0.7, delay: i * 0.06, ease: "easeOut" }}
              style={{ strokeDashoffset: -offset }}
            />
          );
          offset += len;
          return seg;
        })}
        <text x="50%" y="50%" dy="0.32em" textAnchor="middle" className="rotate-90 fill-slate-900 text-[18px] font-bold dark:fill-white" style={{ transformOrigin: "center" }}>
          {total}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: d.color }} />
            <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{d.label}</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---- Paired horizontal bars (Assets vs Liabilities, Income vs Expense) ---- */
export function BarPair({ rows, format }: { rows: Slice[]; format: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{format(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className="h-full rounded-full"
              style={{ background: r.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.08, ease: "easeOut" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Sparkline (card trend) ---- */
export function Sparkline({ points, color, width = 96, height = 30 }: { points: number[]; color: string; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => [i * step, height - ((p - min) / span) * (height - 4) - 2] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `sp-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2" fill={color} />
    </svg>
  );
}

/* ---- Trend bars (Monthly Account Creation) ---- */
export function TrendBars({ points, labels, color }: { points: number[]; labels: string[]; color: string }) {
  const max = Math.max(...points, 1);
  return (
    <div className="flex h-full items-end gap-1.5">
      {points.map((p, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-16 w-full items-end">
            <motion.div
              className="w-full rounded-md"
              style={{ background: color, opacity: 0.35 + (p / max) * 0.65 }}
              initial={{ height: 0 }}
              animate={{ height: `${(p / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
              title={`${labels[i]}: ${p}`}
            />
          </div>
          <span className="text-[9px] text-slate-400">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
