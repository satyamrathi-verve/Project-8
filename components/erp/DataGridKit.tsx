import { Icon } from "@/components/Icon";

/*
  Shared pieces for every enterprise data grid: a sortable column-header
  button, a pagination footer, shimmering loading rows, and a calm empty
  state with a small inline illustration. Compose these around your own
  <table> so every list screen shares the same sort glyphs, pager, skeleton
  and "nothing here" treatment as GL Master.
*/

export function HeaderSort({
  label,
  info,
  align,
  onClick,
}: {
  label: string;
  info: { dir: "asc" | "desc"; order: number } | null;
  align?: "right";
  onClick: (shift: boolean) => void;
}) {
  return (
    <button
      onClick={(e) => onClick(e.shiftKey)}
      title="Click to sort · Shift-click to add"
      className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white ${align === "right" ? "flex-row-reverse" : ""} ${info ? "text-slate-900 dark:text-white" : ""}`}
    >
      {label}
      {info ? (
        <Icon name={info.dir === "asc" ? "arrow-up" : "arrow-down"} className="h-3.5 w-3.5 text-brand" />
      ) : (
        <Icon name="sort" className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
      )}
      {info && info.order > 0 && <span className="rounded bg-brand/15 px-1 text-[9px] font-bold text-brand">{info.order}</span>}
    </button>
  );
}

export function Pager({ disabled, onClick, label, icon }: { disabled: boolean; onClick: () => void; label: string; icon: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

export function Pagination({
  page,
  totalPages,
  pageSize,
  pageSizes,
  setPageSize,
  setPage,
  total,
  itemLabel = "rows",
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizes: number[];
  setPageSize: (n: number) => void;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  itemLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
      <div className="flex items-center gap-2">
        <span>Rows</span>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800"
        >
          {pageSizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="hidden sm:inline">
          · {total} {itemLabel}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Pager disabled={page === 1} onClick={() => setPage(1)} label="First page" icon="chevrons-left" />
        <Pager disabled={page === 1} onClick={() => setPage((p) => p - 1)} label="Previous page" icon="chevron-left" />
        <span className="px-2 font-medium text-slate-700 dark:text-slate-200">
          {page} / {totalPages}
        </span>
        <Pager disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} label="Next page" icon="chevron-right" />
        <Pager disabled={page === totalPages} onClick={() => setPage(totalPages)} label="Last page" icon="chevrons-right" />
      </div>
    </div>
  );
}

/** Shimmering skeleton rows for a table body while data loads. `leadCols` reserves space for a checkbox + avatar/name cell before the shimmer columns. */
export function SkeletonRows({ cols, leadCols = 2, rows = 8 }: { cols: number; leadCols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100 dark:border-slate-800/70">
          {leadCols > 0 && (
            <td className="px-4 py-3.5">
              <div className="h-4 w-4 rounded shimmer" />
            </td>
          )}
          {leadCols > 1 && (
            <td className="px-2 py-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl shimmer" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-40 rounded shimmer" />
                  <div className="h-2.5 w-24 rounded shimmer" />
                </div>
              </div>
            </td>
          )}
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5">
              <div className="h-3.5 rounded shimmer" style={{ width: `${50 + ((r + c) % 4) * 12}%` }} />
            </td>
          ))}
          <td className="px-4 py-3.5">
            <div className="ml-auto h-4 w-6 rounded shimmer" />
          </td>
        </tr>
      ))}
    </>
  );
}

export type EmptyVariant = "empty" | "search" | "error";

export function EmptyState({
  variant,
  title,
  body,
  actionLabel,
  onAction,
}: {
  variant: EmptyVariant;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 text-center">
      <EmptyIllustration variant={variant} />
      <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</p>
      <button
        onClick={onAction}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-dark hover:shadow-md"
      >
        {variant === "empty" && <Icon name="plus" className="h-4 w-4" />}
        {actionLabel}
      </button>
    </div>
  );
}

function EmptyIllustration({ variant }: { variant: EmptyVariant }) {
  const accent = variant === "error" ? "#f43f5e" : variant === "search" ? "#f59e0b" : "#2f6bff";
  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 mx-auto h-24 w-24 rounded-full blur-2xl" style={{ background: `${accent}22` }} />
      <svg width="120" height="96" viewBox="0 0 120 96" fill="none">
        <rect x="20" y="14" width="80" height="68" rx="8" className="fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700" strokeWidth="2" />
        <rect x="20" y="14" width="80" height="18" rx="8" fill={accent} opacity="0.14" />
        <rect x="32" y="42" width="26" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
        <rect x="32" y="54" width="46" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
        <rect x="32" y="66" width="36" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
        <circle cx="86" cy="70" r="16" fill={accent} opacity="0.12" />
        <path
          d={variant === "error" ? "M86 64v6m0 4h.01" : variant === "search" ? "M92 76l-4-4m1-3a5 5 0 10-10 0 5 5 0 0010 0z" : "M80 70l4 4 8-8"}
          stroke={accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
