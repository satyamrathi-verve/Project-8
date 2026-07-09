"use client";

import { Icon } from "@/components/Icon";
import { Popover } from "@/components/Popover";

/*
  A single filter chip: a pill button that opens a popover list of options.
  Compose a row of these under the search bar for every list screen's filter
  bar — Type, Status, Parent Group, whatever the module needs. Keep the set
  small (5-6 chips); more than that belongs behind an "Advanced filters" panel.
*/
export function FilterChip({
  icon,
  label,
  value,
  options,
  onSelect,
}: {
  icon: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
}) {
  const active = value !== "";
  return (
    <Popover
      panelClass="w-52"
      button={() => (
        <button
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            active
              ? "border-brand/40 bg-blue-50 text-brand dark:border-brand/40 dark:bg-brand/10 dark:text-blue-300"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Icon name={icon} className="h-3.5 w-3.5" /> {label}
          {active && <span className="max-w-[110px] truncate font-semibold">: {value}</span>}
          <Icon name="chevron-down" className="h-3 w-3 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-64 overflow-y-auto scroll-thin">
          {options.map((o) => (
            <button
              key={o.value || "all"}
              onClick={() => {
                onSelect(o.value);
                close();
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${
                value === o.value ? "font-semibold text-brand" : "text-slate-700 dark:text-slate-200"
              }`}
            >
              <span className="truncate">{o.label}</span>
              {value === o.value && <Icon name="check" className="h-4 w-4 flex-none" />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** A pill-styled trigger for popovers like Views / Columns, matching FilterChip's look. */
export function ChipBtn({ open, icon, label }: { open: boolean; icon: string; label: string }) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        open ? "border-brand/40 bg-blue-50 text-brand dark:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      <Icon name={icon} className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/** The "N selected · Reset" line shown when filters are active. */
export function FilterResetButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400">
      <Icon name="x" className="h-3.5 w-3.5" /> Reset ({count})
    </button>
  );
}
