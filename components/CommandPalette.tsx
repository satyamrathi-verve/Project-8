"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";

/*
  VS Code / Linear-style command palette. The page supplies a flat list of
  commands (grouped by `section`) plus the account list for record search.
  Fully keyboard driven: ↑/↓ to move, Enter to run, Esc to close.
*/

export interface Command {
  id: string;
  section: string;
  label: string;
  hint?: string;
  icon: string;
  keywords?: string;
  run: () => void;
}

export interface PaletteAccount {
  id: string;
  code: string;
  name: string;
  icon: string;
  tone: string; // text color class
  soft: string; // bg class
}

const SECTION_ORDER = ["Create", "Navigation", "Commands"];

export function CommandPalette({
  open,
  onClose,
  commands,
  accounts,
  onOpenAccount,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  accounts: PaletteAccount[];
  onOpenAccount: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const query = q.trim().toLowerCase();

  const cmdMatches = useMemo(() => {
    if (!query) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(query) || (c.keywords ?? "").toLowerCase().includes(query) || c.section.toLowerCase().includes(query));
  }, [commands, query]);

  const acctMatches = useMemo(() => {
    if (!query) return accounts.slice(0, 6);
    return accounts.filter((a) => a.code.toLowerCase().includes(query) || a.name.toLowerCase().includes(query)).slice(0, 8);
  }, [accounts, query]);

  // Flatten for keyboard nav: [...commands grouped, ...accounts]
  type Row = { kind: "cmd"; cmd: Command } | { kind: "acct"; acct: PaletteAccount };
  const rows: Row[] = useMemo(() => {
    const grouped: Row[] = [];
    SECTION_ORDER.forEach((sec) => cmdMatches.filter((c) => c.section === sec).forEach((cmd) => grouped.push({ kind: "cmd", cmd })));
    cmdMatches.filter((c) => !SECTION_ORDER.includes(c.section)).forEach((cmd) => grouped.push({ kind: "cmd", cmd }));
    acctMatches.forEach((acct) => grouped.push({ kind: "acct", acct }));
    return grouped;
  }, [cmdMatches, acctMatches]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(rows.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const r = rows[active];
        if (!r) return;
        if (r.kind === "cmd") r.cmd.run();
        else onOpenAccount(r.acct.id);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rows, active, onClose, onOpenAccount]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Build render sections in order
  const sections: { title: string; rows: { idx: number; row: Row }[] }[] = [];
  const idxOf = new Map<Row, number>();
  rows.forEach((r, i) => idxOf.set(r, i));
  const pushSec = (title: string, filter: (r: Row) => boolean) => {
    const items = rows.map((row, idx) => ({ idx, row })).filter(({ row }) => filter(row));
    if (items.length) sections.push({ title, rows: items });
  };
  SECTION_ORDER.forEach((sec) => pushSec(sec, (r) => r.kind === "cmd" && r.cmd.section === sec));
  pushSec("Accounts", (r) => r.kind === "acct");

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
          <motion.div
            className="fixed left-1/2 top-[12vh] z-[90] w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <Icon name="search" className="h-5 w-5 flex-none text-slate-400" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts, run a command, or jump to a screen…" className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100" />
              <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800">Esc</kbd>
            </div>
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto scroll-thin p-2">
              {rows.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-slate-400">No results for “{q}”</div>
              ) : (
                sections.map((sec) => (
                  <div key={sec.title} className="mb-1">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{sec.title}</p>
                    {sec.rows.map(({ idx, row }) => (
                      <button
                        key={idx}
                        data-idx={idx}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => { if (row.kind === "cmd") row.cmd.run(); else onOpenAccount(row.acct.id); onClose(); }}
                        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${active === idx ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                      >
                        {row.kind === "cmd" ? (
                          <>
                            <Icon name={row.cmd.icon} className={`h-4 w-4 flex-none ${active === idx ? "text-white" : "text-slate-400"}`} />
                            <span className="flex-1 truncate">{row.cmd.label}</span>
                            {row.cmd.hint && <span className={`text-[11px] ${active === idx ? "text-white/70" : "text-slate-400"}`}>{row.cmd.hint}</span>}
                          </>
                        ) : (
                          <>
                            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md ${active === idx ? "bg-white/20" : row.acct.soft}`}>
                              <Icon name={row.acct.icon} className={`h-3.5 w-3.5 ${active === idx ? "text-white" : row.acct.tone}`} />
                            </span>
                            <span className="flex-1 truncate">{row.acct.name}</span>
                            <span className={`font-mono text-[11px] ${active === idx ? "text-white/70" : "text-slate-400"}`}>{row.acct.code}</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">
              <span className="flex items-center gap-1"><kbd className="rounded border border-slate-200 px-1 dark:border-slate-700">↑</kbd><kbd className="rounded border border-slate-200 px-1 dark:border-slate-700">↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-slate-200 px-1 dark:border-slate-700">↵</kbd> select</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
