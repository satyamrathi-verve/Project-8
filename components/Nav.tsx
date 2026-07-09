"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { signOut } from "@/lib/auth";

/*
  Left sidebar — collapsible, icon-led, with section groups, an active "glow",
  and notification badges. Flip `built` + set `href` when a screen lands. Sign
  In is the front-door gate, not an in-app page, so it isn't listed here — use
  the Sign out button in the footer instead.
*/
type NavItem = { href: string; label: string; icon: string; built: boolean; badge?: number };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/", label: "Home", icon: "home", built: true },
      { href: "/dashboard", label: "Dashboard", icon: "grid", built: false },
    ],
  },
  {
    title: "Masters",
    items: [
      { href: "/masters/customers", label: "Customers", icon: "users", built: true },
      { href: "/masters/gl", label: "GL Accounts", icon: "bank", built: true },
    ],
  },
  {
    title: "Transactions",
    items: [
      { href: "/invoices", label: "Sales Invoices", icon: "receipt", built: false },
      { href: "/receipts", label: "Receipt Entry", icon: "wallet", built: true },
      { href: "/upload", label: "Upload Report", icon: "upload", built: false },
      { href: "/reminders", label: "AR Followup", icon: "bell", built: false, badge: 3 },
    ],
  },
  {
    title: "Reports",
    items: [
      { href: "/reports/statement", label: "Customer Statement", icon: "file-text", built: false },
      { href: "/reports/ageing", label: "AR Ageing", icon: "scale", built: false },
      { href: "/cashflow", label: "Cashflow", icon: "trending-up", built: false },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("nav_collapsed") === "1");
    setReady(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("nav_collapsed", next ? "1" : "0");
      return next;
    });
  };

  function handleSignOut() {
    signOut();
    router.push("/signin");
  }

  return (
    <nav
      className={`relative flex h-full flex-col border-r border-slate-200 bg-white transition-[width] duration-300 ease-out dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? "w-[76px]" : "w-64"
      } ${ready ? "" : "duration-0"}`}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow">
          <Icon name="bank" className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-brand">Verve</p>
            <h1 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">AR Manager</h1>
          </div>
        )}
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-2">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-slate-100 dark:border-slate-800" />
            ) : (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const content = (
                  <>
                    <span className="relative flex-none">
                      <Icon
                        name={item.icon}
                        className={`h-[18px] w-[18px] ${
                          active ? "text-white" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                        }`}
                      />
                      {item.badge && collapsed && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </span>
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
                        {item.badge}
                      </span>
                    )}
                    {!collapsed && !item.built && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                        soon
                      </span>
                    )}
                  </>
                );

                const base =
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all";

                if (!item.built) {
                  return (
                    <div
                      key={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`${base} cursor-not-allowed text-slate-400 dark:text-slate-600`}
                    >
                      {content}
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`${base} ${
                      active
                        ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-glow"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sign out */}
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Icon name="lock" className="h-[18px] w-[18px] flex-none" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} className="h-[18px] w-[18px] flex-none" />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
