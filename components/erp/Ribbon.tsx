import { Icon } from "@/components/Icon";

/*
  The action ribbon under a ScreenHeader: New / Edit / Duplicate / Delete /
  Import / Export / Print / Refresh / Settings, wherever a module needs it.
  Every button carries an icon, label, and optional keyboard-shortcut hint in
  its tooltip. Keep the set small per screen — this is a toolbar, not a menu.
*/
export function Ribbon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scroll-thin border-t border-slate-100 px-4 py-1.5 dark:border-slate-800">
      {children}
    </div>
  );
}

export function RibbonButton({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  primary,
  spinning,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} · ${shortcut}` : label}
      aria-label={label}
      className={`inline-flex flex-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? "bg-brand text-white hover:bg-brand-dark shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      <Icon name={icon} className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function RibbonDivider() {
  return <span className="mx-1 h-5 w-px flex-none bg-slate-200 dark:bg-slate-700" />;
}
