/*
  GL account "enrichment" the backend doesn't store.

  The real `gl_accounts` table only has: code, name, type, parent_group — and the
  `type` column is locked by a DB CHECK to asset|liability|income|expense. So the
  richer ERP attributes an accountant expects (status, opening balance, normal
  balance, posting controls, financial-statement mapping, GST/cash-flow category,
  dimensions, favourites, audit trail) live here as front-end-only state kept in
  localStorage, keyed by account id — the same "simulate what the backend can't
  hold" pattern the app already uses for Sign In and email.

  Nothing here writes to Supabase. Persisting the four real columns stays in the
  page via the supabase client.
*/

import type { GLAccount } from "@/lib/types";

export type GLStatus = "active" | "inactive" | "archived";
export type NormalBalance = "debit" | "credit";
export type CashflowCategory = "Operating" | "Investing" | "Financing" | "Not Applicable";
export type GSTCategory = "Taxable" | "Exempt" | "Nil Rated" | "Not Applicable";

/** Per-account attributes we keep on the client only. */
export interface GLMeta {
  status: GLStatus;
  opening_balance: number;
  currency: string;
  description: string;
  // posting controls
  posting_allowed: boolean;
  control_account: boolean;
  bank_reconciliation: boolean;
  is_system: boolean;
  // accounting semantics
  normal_balance: NormalBalance;
  fs_mapping: string;
  cashflow_category: CashflowCategory;
  gst_category: GSTCategory;
  // dimensions
  department: string;
  location: string;
  cost_center: string;
  // personalisation
  favorite: boolean;
  pinned: boolean;
  /** True when opening_balance below is a live subledger total, not a manually entered figure. */
  balance_is_live: boolean;
  // audit
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

/** An account joined with its client-side metadata — what screens actually render. */
export type EnrichedGLAccount = GLAccount & { meta: GLMeta };

// v3: dropped the fake hash-derived opening balance in favour of real, live
// subledger totals for control accounts — bumped so browsers with stale v2
// data (fabricated balances) start clean instead of keeping the fake numbers.
const META_KEY = "gl_meta_v3";
const RECENT_KEY = "gl_recent_v1";
const VIEWS_KEY = "gl_views_v1";
const CURRENT_USER = "You";

/* ------------------------------------------------------------------ *
 * Derived display classification (finer grain than the 4 DB types)
 * ------------------------------------------------------------------ */

export type DisplayTypeKey =
  | "asset"
  | "receivable"
  | "bank"
  | "cash"
  | "inventory"
  | "fixed"
  | "liability"
  | "payable"
  | "tax"
  | "equity"
  | "income"
  | "cogs"
  | "expense";

export interface DisplayType {
  key: DisplayTypeKey;
  label: string;
  base: GLAccount["type"];
  icon: string;
}

export function classify(acc: GLAccount): DisplayType {
  const n = acc.name.toLowerCase();
  const g = (acc.parent_group ?? "").toLowerCase();
  const has = (re: RegExp) => re.test(n) || re.test(g);

  switch (acc.type) {
    case "asset":
      if (has(/receivable|debtor/)) return { key: "receivable", label: "Accounts Receivable", base: "asset", icon: "users" };
      if (has(/\bbank\b/)) return { key: "bank", label: "Bank", base: "asset", icon: "bank" };
      if (has(/cash|petty/)) return { key: "cash", label: "Cash", base: "asset", icon: "wallet" };
      if (has(/inventor|stock/)) return { key: "inventory", label: "Inventory", base: "asset", icon: "layers" };
      if (has(/fixed|equipment|furniture|deprecia|building|machinery|vehicle/))
        return { key: "fixed", label: "Fixed Asset", base: "asset", icon: "building" };
      return { key: "asset", label: "Asset", base: "asset", icon: "coins" };
    case "liability":
      // GST/tax check runs first: a name like "Output GST Payable" contains
      // both "gst" and "payable" — it's a duties-and-taxes account, not a
      // vendor payable, so the more specific match must win.
      if (has(/gst|tax|vat|duty|tds/)) return { key: "tax", label: "Tax Payable", base: "liability", icon: "hash" };
      if (has(/payable|creditor/)) return { key: "payable", label: "Accounts Payable", base: "liability", icon: "receipt" };
      if (has(/equity|capital|retained|owner|reserve/))
        return { key: "equity", label: "Equity", base: "liability", icon: "scale" };
      return { key: "liability", label: "Liability", base: "liability", icon: "book" };
    case "income":
      return { key: "income", label: "Income", base: "income", icon: "trending-up" };
    case "expense":
      // \bdirect\b, not "direct" — otherwise "Indirect Expenses" (which
      // contains "direct" as a substring) wrongly matches and every expense
      // parked under it gets mislabelled Cost of Goods Sold.
      if (has(/cost of goods|cogs|\bdirect\b|freight|purchase|carriage/))
        return { key: "cogs", label: "Cost of Goods Sold", base: "expense", icon: "layers" };
      return { key: "expense", label: "Expense", base: "expense", icon: "trending-down" };
  }
}

/** Premium, muted pill styling per display type (light + dark). Full class strings so Tailwind keeps them. */
export const TYPE_TONE: Record<DisplayTypeKey, { pill: string; dot: string; soft: string; text: string }> = {
  asset: { pill: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20", dot: "bg-blue-500", soft: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  receivable: { pill: "bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20", dot: "bg-indigo-500", soft: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400" },
  bank: { pill: "bg-cyan-50 text-cyan-700 ring-cyan-600/15 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20", dot: "bg-cyan-500", soft: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400" },
  cash: { pill: "bg-teal-50 text-teal-700 ring-teal-600/15 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20", dot: "bg-teal-500", soft: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
  inventory: { pill: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20", dot: "bg-sky-500", soft: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
  fixed: { pill: "bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/20", dot: "bg-slate-500", soft: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-300" },
  liability: { pill: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20", dot: "bg-rose-500", soft: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
  payable: { pill: "bg-orange-50 text-orange-700 ring-orange-600/15 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20", dot: "bg-orange-500", soft: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
  tax: { pill: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20", dot: "bg-amber-500", soft: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  equity: { pill: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20", dot: "bg-violet-500", soft: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
  income: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20", dot: "bg-emerald-500", soft: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  cogs: { pill: "bg-purple-50 text-purple-700 ring-purple-600/15 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20", dot: "bg-purple-500", soft: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
  expense: { pill: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/15 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20", dot: "bg-fuchsia-500", soft: "bg-fuchsia-500/10", text: "text-fuchsia-600 dark:text-fuchsia-400" },
};

/* ------------------------------------------------------------------ *
 * Accounting-semantic derivations
 * ------------------------------------------------------------------ */

export function normalBalanceOf(type: GLAccount["type"]): NormalBalance {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

export function fsMappingOf(type: GLAccount["type"]): string {
  return type === "asset" || type === "liability" ? "Balance Sheet" : "Profit & Loss";
}

export function cashflowOf(key: DisplayTypeKey): CashflowCategory {
  if (key === "fixed") return "Investing";
  if (key === "equity") return "Financing";
  if (key === "asset" || key === "liability") return "Not Applicable";
  return "Operating";
}

export function gstOf(key: DisplayTypeKey): GSTCategory {
  if (key === "income" || key === "cogs" || key === "expense") return "Taxable";
  if (key === "tax") return "Taxable";
  return "Not Applicable";
}

/* ------------------------------------------------------------------ *
 * Live control-account balances — real numbers from the real subledgers
 * (invoices, receipts, customers), not placeholder data. A handful of
 * accounts are "control accounts": the ledger doesn't hold their balance
 * directly, it's the total of a subledger (AR = the sum of what every
 * customer owes; Bank/Cash = money actually received; GST Payable = tax
 * actually collected on invoices). Computing these live is what makes
 * the chart of accounts trustworthy instead of decorative.
 * ------------------------------------------------------------------ */

export interface LedgerAggregates {
  /** customers.opening_balance + invoices.total − receipt_allocations.amount, summed across everyone. */
  debtorsBalance: number;
  /** receipts.amount where mode is neft/upi/cheque (anything that lands in a bank account). */
  bankBalance: number;
  /** receipts.amount where mode is cash. */
  cashBalance: number;
  /** invoices.tax_amount, summed — GST collected on sales, owed to the government. */
  taxPayable: number;
}

/** The real balance for a control-account type, or null if this account isn't one we can derive. */
export function liveBalanceFor(key: DisplayTypeKey, agg: LedgerAggregates): number | null {
  switch (key) {
    case "receivable": return agg.debtorsBalance;
    case "bank": return agg.bankBalance;
    case "cash": return agg.cashBalance;
    case "tax": return agg.taxPayable;
    default: return null;
  }
}

/**
 * Whether this specific account may receive a live balance at all. Excludes
 * "input" tax accounts (e.g. Input CGST) — taxPayable is GST collected on
 * sales (output side); this app has no purchase ledger, so there's no real
 * number for input tax credit, and showing the output figure there would be
 * a genuine accounting error, not just a cosmetic one.
 */
export function isLiveEligible(acc: { name: string }, key: DisplayTypeKey): boolean {
  if (key === "tax") return !/input/i.test(acc.name);
  return key === "receivable" || key === "bank" || key === "cash";
}

/** Plain-English source of a live balance, shown wherever we tell the user why a number isn't editable. */
export function liveBalanceSource(key: DisplayTypeKey): string {
  switch (key) {
    case "receivable": return "Computed live from every customer's opening balance plus invoiced totals, minus receipts allocated against them.";
    case "bank": return "Computed live from receipts recorded in Receipt Entry with mode NEFT, UPI or Cheque.";
    case "cash": return "Computed live from receipts recorded in Receipt Entry with mode Cash.";
    case "tax": return "Computed live from GST collected (tax_amount) across all sales invoices.";
    default: return "";
  }
}

/* ------------------------------------------------------------------ *
 * localStorage metadata store
 * ------------------------------------------------------------------ */

type MetaStore = Record<string, GLMeta>;

function readStore(): MetaStore {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(META_KEY) ?? "{}") as MetaStore;
  } catch {
    return {};
  }
}

function writeStore(store: MetaStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(META_KEY, JSON.stringify(store));
}

function defaultMeta(acc: GLAccount, nowIso: string): GLMeta {
  const cls = classify(acc);
  const isControl = cls.key === "receivable" || cls.key === "payable" || cls.key === "tax" || cls.key === "bank";
  return {
    status: "active",
    opening_balance: 0,
    currency: "INR",
    description: "",
    posting_allowed: !isControl,
    control_account: isControl,
    bank_reconciliation: cls.key === "bank" || cls.key === "cash",
    is_system: cls.key === "receivable" || cls.key === "tax",
    normal_balance: normalBalanceOf(acc.type),
    fs_mapping: fsMappingOf(acc.type),
    cashflow_category: cashflowOf(cls.key),
    gst_category: gstOf(cls.key),
    department: "Finance",
    location: "Head Office",
    cost_center: "Corporate",
    favorite: false,
    pinned: false,
    balance_is_live: false,
    created_by: "System",
    created_at: nowIso,
    updated_by: "System",
    updated_at: nowIso,
  };
}

function blankMeta(): GLMeta {
  const iso = new Date().toISOString();
  return {
    status: "active",
    opening_balance: 0,
    currency: "INR",
    description: "",
    posting_allowed: true,
    control_account: false,
    bank_reconciliation: false,
    is_system: false,
    normal_balance: "debit",
    fs_mapping: "Balance Sheet",
    cashflow_category: "Operating",
    gst_category: "Not Applicable",
    department: "Finance",
    location: "Head Office",
    cost_center: "Corporate",
    favorite: false,
    pinned: false,
    balance_is_live: false,
    created_by: CURRENT_USER,
    created_at: iso,
    updated_by: CURRENT_USER,
    updated_at: iso,
  };
}

/**
 * Join real accounts with stored metadata, filling defaults for first-seen rows.
 * When `ledger` is supplied, control accounts (Debtors, Bank, Cash, GST Payable)
 * get their real, live balance substituted in for display — the persisted
 * meta itself is left untouched, so this never overwrites a manual entry on
 * disk, it just means the control accounts always render the true current
 * number instead of whatever was last saved.
 */
export function enrich(accounts: GLAccount[], ledger?: LedgerAggregates): EnrichedGLAccount[] {
  const store = readStore();
  const nowIso = new Date().toISOString();
  let dirty = false;

  // Only auto-compute a control account's balance when exactly one account
  // fills that role. If a team ever adds a second Bank ledger, say, there's
  // no way to know how the real total splits between them — better to leave
  // both manual than silently attribute the whole subledger to the wrong one.
  const eligibleKeyCounts = new Map<DisplayTypeKey, number>();
  if (ledger) {
    accounts.forEach((acc) => {
      const cls = classify(acc);
      if (isLiveEligible(acc, cls.key)) eligibleKeyCounts.set(cls.key, (eligibleKeyCounts.get(cls.key) ?? 0) + 1);
    });
  }

  const rows = accounts.map((acc) => {
    let meta = store[acc.id];
    if (!meta) {
      meta = defaultMeta(acc, nowIso);
      store[acc.id] = meta;
      dirty = true;
    }

    let displayMeta = meta;
    if (ledger) {
      const cls = classify(acc);
      const unambiguous = isLiveEligible(acc, cls.key) && eligibleKeyCounts.get(cls.key) === 1;
      const live = unambiguous ? liveBalanceFor(cls.key, ledger) : null;
      if (live !== null) {
        displayMeta = { ...meta, opening_balance: live, balance_is_live: true, control_account: true, posting_allowed: false };
      }
    }

    return { ...acc, meta: displayMeta };
  });

  if (dirty) writeStore(store);
  return rows;
}

/** Persist a patch to one account's client metadata; returns the merged meta. */
export function saveMeta(id: string, patch: Partial<GLMeta>): GLMeta {
  const store = readStore();
  const base: GLMeta = store[id] ?? blankMeta();
  const merged: GLMeta = { ...base, ...patch, updated_by: CURRENT_USER, updated_at: new Date().toISOString() };
  store[id] = merged;
  writeStore(store);
  return merged;
}

/** Drop metadata for a deleted account. */
export function removeMeta(id: string) {
  const store = readStore();
  delete store[id];
  writeStore(store);
}

/* ------------------------------------------------------------------ *
 * Recently viewed
 * ------------------------------------------------------------------ */

export function pushRecent(id: string) {
  if (typeof window === "undefined") return;
  try {
    const list: string[] = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    const next = [id, ...list.filter((x) => x !== id)].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Saved filter views
 * ------------------------------------------------------------------ */

export interface SavedView {
  id: string;
  name: string;
  search: string;
  filterType: string;
  filterStatus: string;
  filterGroup: string;
  filterSystem: string;
}

export function readViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(VIEWS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function writeViews(views: SavedView[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
}

export function makeId(): string {
  // Browser-only id; fine for demo view keys.
  return Math.random().toString(36).slice(2, 9);
}

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

export function formatMoney(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function compactMoney(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ *
 * Deterministic demo series (stable across refreshes) — for sparklines
 * and the monthly-creation trend. Purely presentational.
 * ------------------------------------------------------------------ */

export function pseudoSeries(seed: string, n: number, base = 10): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  let v = base + (h % 7);
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    v = Math.max(1, v + ((h % 9) - 4));
    out.push(v);
  }
  return out;
}

export function lastMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toLocaleDateString("en-IN", { month: "short" }));
  }
  return out;
}
