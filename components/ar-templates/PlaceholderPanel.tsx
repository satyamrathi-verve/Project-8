"use client";

import { useMemo, useState } from "react";
import { Search, Copy, Check } from "lucide-react";
import { PLACEHOLDERS } from "@/lib/ar-templates/placeholders";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PlaceholderPanel({ onInsert }: { onInsert: (placeholder: string) => void }) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(
    () => PLACEHOLDERS.filter((p) => p.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

  async function copy(placeholder: string) {
    await navigator.clipboard.writeText(placeholder);
    setCopied(placeholder);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        Available Placeholders
      </h3>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search placeholders…"
          className="pl-8"
        />
      </div>

      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">No placeholders match.</p>
        )}
        {filtered.map((p) => (
          <div
            key={p}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800"
          >
            <button
              type="button"
              onClick={() => onInsert(p)}
              className="flex-1 truncate text-left font-mono text-xs font-medium text-brand hover:underline"
              title={`Insert ${p} at cursor`}
            >
              {p}
            </button>
            <button
              type="button"
              onClick={() => copy(p)}
              aria-label={`Copy ${p}`}
              title="Copy placeholder"
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700",
                copied === p && "text-emerald-600"
              )}
            >
              {copied === p ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
