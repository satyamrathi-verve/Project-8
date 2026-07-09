import { Icon } from "@/components/Icon";

/*
  Small action atoms shared by popovers, context menus and bulk-action bars
  across every module: a menu row (icon + label, optional danger tone) and a
  bulk-bar button (bordered pill with icon + label).
*/

export function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
        danger ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
      }`}
    >
      <Icon name={icon} className="h-4 w-4 flex-none text-slate-400" /> {label}
    </button>
  );
}

export function BulkBtn({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 font-medium transition-colors dark:bg-slate-800 ${
        danger ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
      }`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/** The "N selected · Clear" bar shown above the grid when rows are selected. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-blue-50/70 px-4 py-2.5 text-sm dark:border-brand/30 dark:bg-brand/10">
      <span className="font-semibold text-brand">{count} selected</span>
      <button onClick={onClear} className="text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400">
        Clear
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
