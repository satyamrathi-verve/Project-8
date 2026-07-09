import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

/*
  The sticky page header shell every ERP screen shares: breadcrumb, an icon
  avatar + title + subtitle, a right-side actions slot, and an optional ribbon
  toolbar row underneath. Built once for GL Master — reuse this on every
  other module (Dashboard, Customer Master, Invoices, Receipts, …) so the
  whole app reads as one product instead of a per-screen redesign.

  <ScreenHeader
    icon="bank"
    title="GL Accounts"
    subtitle="Manage your chart of accounts"
    breadcrumb={["Masters", "GL Accounts"]}
    actions={<ThemeToggle />}
    ribbon={<Ribbon>...</Ribbon>}
  />
*/
export function ScreenHeader({
  icon,
  title,
  subtitle,
  breadcrumb,
  actions,
  ribbon,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  breadcrumb: string[];
  actions?: ReactNode;
  ribbon?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
      <div className="px-6 pt-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb} className="flex items-center gap-1.5">
              {i > 0 && <Icon name="chevron-right" className="h-3 w-3" />}
              <span className={i === breadcrumb.length - 1 ? "text-slate-600 dark:text-slate-300" : ""}>{crumb}</span>
            </span>
          ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-3 pt-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow">
            <Icon name={icon} className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {ribbon}
    </header>
  );
}
