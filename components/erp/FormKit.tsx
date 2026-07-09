"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";

/*
  Building blocks for every Add/Edit slide-over form: a grouped section
  header, a labeled field (with required/error/"changed since open" states),
  and an animated toggle switch. Use these in every module's create/edit
  drawer so forms across the app share the same rhythm as GL Master's.
*/

export function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon name={icon} className="h-3.5 w-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
}

export function Field({
  label,
  required,
  error,
  changed,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  changed?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500">*</span>}
        {changed && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Changed</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

export function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-lg px-1 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <span>
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{desc}</span>
      </span>
      <span className={`relative mt-0.5 inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors ${checked ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"}`}>
        <motion.span
          layout
          className={`inline-block h-4 w-4 rounded-full bg-white shadow ${checked ? "translate-x-4" : "translate-x-0.5"}`}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  );
}
