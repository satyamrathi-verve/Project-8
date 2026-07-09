"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";

/*
  The single, powerful search bar every list screen uses: leading icon,
  Ctrl+K hint, clear button, and an optional dropdown (suggestions / recent
  searches / anything else) rendered via `dropdown`. The dropdown's open
  state is controlled by the caller (`open`/`onOpenChange`) so it can react
  to focus, Enter, Escape and outside clicks exactly like GL Master's.

  Wire Ctrl+K globally in the page:
    useEffect(() => {
      const onKey = (e) => { if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); ref.current?.focus(); } };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);
*/
export function SearchBar({
  value,
  onChange,
  placeholder,
  ariaLabel,
  open,
  onOpenChange,
  onCommit,
  dropdown,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit?: (v: string) => void;
  dropdown?: React.ReactNode;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  return (
    <div ref={boxRef} className="relative">
      <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => onOpenChange(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onCommit?.(value);
            onOpenChange(false);
          } else if (e.key === "Escape") onOpenChange(false);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-24 text-sm outline-none transition-colors focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {value && (
          <button onClick={() => onChange("")} aria-label="Clear search" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
        <kbd className="pointer-events-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-900">Ctrl K</kbd>
      </div>

      <AnimatePresence>
        {open && dropdown && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-float dark:border-slate-700 dark:bg-slate-800"
          >
            {dropdown}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Wraps the first match of `query` in `text` with a <mark> highlight. */
export function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/30">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
