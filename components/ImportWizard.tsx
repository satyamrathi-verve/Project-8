"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { inputClass } from "@/components/FormField";

/*
  Professional 5-step CSV import wizard:
  Upload → Map columns → Validate → Preview → Import.
  Only the four real ledger columns (code, name, type, parent_group) are written;
  the page's onImport does the actual Supabase insert.
*/

export interface ImportRow {
  code: string;
  name: string;
  type: string;
  parent_group: string | null;
}

type Field = "code" | "name" | "type" | "parent";
const FIELDS: { key: Field; label: string; required: boolean }[] = [
  { key: "code", label: "Account Code", required: true },
  { key: "name", label: "Account Name", required: true },
  { key: "type", label: "Account Type", required: false },
  { key: "parent", label: "Parent Group", required: false },
];
const VALID_TYPES = ["asset", "liability", "income", "expense"];
const STEPS = ["Upload", "Map", "Validate", "Preview", "Import"];

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
        } else if (ch === "," && !inQ) { out.push(cur); cur = ""; } else cur += ch;
      }
      out.push(cur);
      return out.map((c) => c.trim());
    });
}

export function ImportWizard({
  open,
  onClose,
  existingCodes,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  existingCodes: Set<string>;
  onImport: (rows: ImportRow[]) => Promise<{ count: number; error?: string }>;
}) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState<Record<Field, number>>({ code: -1, name: -1, type: -1, parent: -1 });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ count: number; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(0); setFileName(""); setHeaders([]); setRows([]); setMap({ code: -1, name: -1, type: -1, parent: -1 }); setImporting(false); setResult(null);
  };
  const close = () => { reset(); onClose(); };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const grid = parseCsv(text);
    if (!grid.length) return;
    const looksHeader = /code|name|type/i.test(grid[0].join(","));
    setHasHeader(looksHeader);
    const hdr = looksHeader ? grid[0] : grid[0].map((_, i) => `Column ${i + 1}`);
    const body = looksHeader ? grid.slice(1) : grid;
    setFileName(file.name);
    setHeaders(hdr);
    setRows(body);
    // auto-guess mapping
    const guess = (re: RegExp) => hdr.findIndex((h) => re.test(h));
    setMap({ code: guess(/code/i), name: guess(/name|account/i), type: guess(/type/i), parent: guess(/parent|group/i) });
    setStep(1);
  };

  const dataRows = rows;
  const validated = useMemo(() => {
    const seen = new Set<string>();
    return dataRows.map((r, i) => {
      const code = map.code >= 0 ? (r[map.code] ?? "").trim() : "";
      const name = map.name >= 0 ? (r[map.name] ?? "").trim() : "";
      const rawType = map.type >= 0 ? (r[map.type] ?? "").trim().toLowerCase() : "asset";
      const type = VALID_TYPES.includes(rawType) ? rawType : "asset";
      const parent = map.parent >= 0 ? (r[map.parent] ?? "").trim() : "";
      const errors: string[] = [];
      if (!code) errors.push("Missing code");
      if (!name) errors.push("Missing name");
      if (code && existingCodes.has(code.toLowerCase())) errors.push("Code already exists");
      if (code && seen.has(code.toLowerCase())) errors.push("Duplicate in file");
      if (map.type >= 0 && rawType && !VALID_TYPES.includes(rawType)) errors.push(`Type "${rawType}" → defaulted to asset`);
      if (code) seen.add(code.toLowerCase());
      return { line: i + 1 + (hasHeader ? 1 : 0), code, name, type, parent, errors, ok: !errors.some((e) => !e.includes("→")) && !!code && !!name };
    });
  }, [dataRows, map, existingCodes, hasHeader]);

  const okRows = validated.filter((v) => v.ok);
  const errRows = validated.filter((v) => !v.ok);
  const warnRows = validated.filter((v) => v.ok && v.errors.length);
  const canMap = map.code >= 0 && map.name >= 0;

  const doImport = async () => {
    setImporting(true);
    const payload: ImportRow[] = okRows.map((v) => ({ code: v.code, name: v.name, type: v.type, parent_group: v.parent || null }));
    const res = await onImport(payload);
    setResult(res);
    setImporting(false);
    setStep(4);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            role="dialog"
            aria-label="Import accounts"
            className="fixed left-1/2 top-1/2 z-[90] flex max-h-[86vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
          >
            {/* header + stepper */}
            <div className="border-b border-slate-100 px-6 pb-4 pt-5 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"><Icon name="upload" className="h-5 w-5 text-brand" /> Import Accounts</h2>
                <button onClick={close} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon name="x" className="h-5 w-5" /></button>
              </div>
              <ol className="mt-4 flex items-center gap-1">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex flex-1 items-center gap-1">
                    <div className={`flex items-center gap-2 ${i <= step ? "text-brand" : "text-slate-400"}`}>
                      <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-bold ${i < step ? "bg-brand text-white" : i === step ? "bg-brand/15 text-brand ring-1 ring-brand" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                        {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="hidden text-xs font-medium sm:inline">{s}</span>
                    </div>
                    {i < STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? "bg-brand" : "bg-slate-200 dark:bg-slate-700"}`} />}
                  </li>
                ))}
              </ol>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto scroll-thin px-6 py-5">
              {step === 0 && (
                <div>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                  <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 py-12 transition-colors hover:border-brand hover:bg-blue-50/40 dark:border-slate-700 dark:hover:bg-slate-800/50">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Icon name="upload" className="h-7 w-7" /></span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Click to upload a CSV file</span>
                    <span className="text-xs text-slate-400">Columns: code, name, type, parent_group</span>
                  </button>
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Tip: the first row can be a header. Type must be one of asset, liability, income, expense (anything else defaults to asset).
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Map your file’s columns to ledger fields. Detected <span className="font-semibold">{rows.length}</span> rows in <span className="font-mono">{fileName}</span>.</p>
                  <div className="space-y-3">
                    {FIELDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-3">
                        <label className="w-40 flex-none text-sm font-medium text-slate-700 dark:text-slate-300">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                        <select value={map[f.key]} onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))} className={`${inputClass} flex-1`}>
                          <option value={-1}>— Not mapped —</option>
                          {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {!canMap && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Map both Account Code and Account Name to continue.</p>}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat n={okRows.length} label="Ready" tone="emerald" />
                    <Stat n={warnRows.length} label="Warnings" tone="amber" />
                    <Stat n={errRows.length} label="Errors (skipped)" tone="rose" />
                  </div>
                  {errRows.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
                      <p className="mb-2 text-xs font-semibold text-rose-700 dark:text-rose-300">These rows will be skipped:</p>
                      <ul className="max-h-40 space-y-1 overflow-y-auto scroll-thin text-xs text-rose-600 dark:text-rose-300">
                        {errRows.slice(0, 30).map((r, i) => <li key={i}>Line {r.line}: {r.code || "—"} — {r.errors.join(", ")}</li>)}
                      </ul>
                    </div>
                  )}
                  {okRows.length === 0 && <p className="text-sm font-medium text-rose-600">No valid rows to import.</p>}
                </div>
              )}

              {step === 3 && (
                <div>
                  <p className="mb-3 text-sm text-slate-600 dark:text-slate-300"><span className="font-semibold">{okRows.length}</span> account{okRows.length !== 1 ? "s" : ""} will be imported.</p>
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left dark:bg-slate-800"><tr>{["Code", "Name", "Type", "Parent"].map((h) => <th key={h} className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">{h}</th>)}</tr></thead>
                      <tbody>
                        {okRows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-200">{r.code}</td>
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{r.name}</td>
                            <td className="px-3 py-1.5 capitalize text-slate-500">{r.type}</td>
                            <td className="px-3 py-1.5 text-slate-500">{r.parent || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {okRows.length > 50 && <p className="mt-2 text-xs text-slate-400">Showing first 50 of {okRows.length}.</p>}
                </div>
              )}

              {step === 4 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  {result?.error ? (
                    <>
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15"><Icon name="alert" className="h-7 w-7" /></span>
                      <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">Import failed</p>
                      <p className="mt-1 text-sm text-slate-500">{result.error}</p>
                    </>
                  ) : (
                    <>
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15"><Icon name="check" className="h-7 w-7" /></motion.span>
                      <p className="mt-3 text-base font-semibold text-slate-900 dark:text-white">Imported {result?.count ?? 0} account{result?.count !== 1 ? "s" : ""}</p>
                      <p className="mt-1 text-sm text-slate-500">Your chart of accounts has been updated.</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
              <button onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{step === 4 ? "Close" : "Cancel"}</button>
              <div className="flex gap-2">
                {step > 0 && step < 4 && <button onClick={() => setStep((s) => s - 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Back</button>}
                {step === 1 && <button onClick={() => setStep(2)} disabled={!canMap} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40">Continue</button>}
                {step === 2 && <button onClick={() => setStep(3)} disabled={okRows.length === 0} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40">Continue</button>}
                {step === 3 && <button onClick={doImport} disabled={importing} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{importing && <Icon name="refresh" className="h-4 w-4 animate-spin" />}Import {okRows.length} accounts</button>}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "emerald" | "amber" | "rose" }) {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="rounded-xl border border-slate-200 p-3 text-center dark:border-slate-800">
      <p className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{n}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
