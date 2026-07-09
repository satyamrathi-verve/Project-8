"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import { supabase, isConfigured } from "@/lib/supabase";
import type { GLAccount } from "@/lib/types";
import {
  classify,
  enrich,
  saveMeta,
  removeMeta,
  pushRecent,
  readRecent,
  readViews,
  writeViews,
  makeId,
  normalBalanceOf,
  fsMappingOf,
  formatMoney,
  compactMoney,
  formatDate,
  formatDateTime,
  pseudoSeries,
  lastMonths,
  TYPE_TONE,
  type EnrichedGLAccount,
  type GLStatus,
  type SavedView,
} from "@/lib/glMeta";
import { Icon } from "@/components/Icon";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { MotionDrawer } from "@/components/MotionDrawer";
import { Popover } from "@/components/Popover";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { NotConfigured } from "@/components/NotConfigured";
import { inputClass } from "@/components/FormField";
import { useToast, Toaster } from "@/components/Toast";
import { Donut, BarPair, Sparkline, TrendBars } from "@/components/MiniCharts";
import { CommandPalette, type Command, type PaletteAccount } from "@/components/CommandPalette";
import { ImportWizard, type ImportRow } from "@/components/ImportWizard";
import { useRouter } from "next/navigation";

/* =============================================================== *
 * Config
 * =============================================================== */

const BASE_TYPES: { value: GLAccount["type"]; label: string; help: string; icon: string }[] = [
  { value: "asset", label: "Asset", help: "Cash, bank, receivables, inventory", icon: "coins" },
  { value: "liability", label: "Liability", help: "Payables, tax, loans, equity", icon: "book" },
  { value: "income", label: "Income", help: "Sales, service & other revenue", icon: "trending-up" },
  { value: "expense", label: "Expense", help: "Cost of goods sold & opex", icon: "trending-down" },
];
const TYPE_ORDER: GLAccount["type"][] = ["asset", "liability", "income", "expense"];
const TYPE_LABEL: Record<GLAccount["type"], string> = { asset: "Assets", liability: "Liabilities", income: "Income", expense: "Expenses" };

const STATUS_META: Record<GLStatus, { label: string; variant: "success" | "warning" | "default"; dot: string }> = {
  active: { label: "Active", variant: "success", dot: "bg-emerald-500" },
  inactive: { label: "Inactive", variant: "warning", dot: "bg-amber-500" },
  archived: { label: "Archived", variant: "default", dot: "bg-slate-400" },
};

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];
const DATE_PRESETS = [
  { value: "", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const YESNO = [
  { value: "", label: "Any" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

type ColKey = "type" | "parent" | "normal" | "status" | "balance" | "currency" | "system" | "created" | "updated";
const COLDEF: Record<ColKey, { label: string; align?: "right"; minWidth: number; width: number; sortable: boolean }> = {
  type: { label: "Type", minWidth: 130, width: 160, sortable: true },
  parent: { label: "Parent Group", minWidth: 130, width: 170, sortable: true },
  normal: { label: "Normal Balance", minWidth: 120, width: 140, sortable: true },
  status: { label: "Status", minWidth: 110, width: 130, sortable: true },
  balance: { label: "Opening Balance", align: "right", minWidth: 140, width: 170, sortable: true },
  currency: { label: "Currency", minWidth: 90, width: 110, sortable: true },
  system: { label: "System", minWidth: 100, width: 120, sortable: true },
  created: { label: "Created", minWidth: 120, width: 140, sortable: true },
  updated: { label: "Last Updated", minWidth: 120, width: 150, sortable: true },
};
const DEFAULT_ORDER: ColKey[] = ["type", "parent", "normal", "status", "balance", "currency", "system", "created", "updated"];
const DEFAULT_VISIBLE: Record<ColKey, boolean> = { type: true, parent: true, normal: true, status: true, balance: true, currency: false, system: true, created: false, updated: true };
const PAGE_SIZES = [10, 25, 50];

const TYPE_HEX: Record<GLAccount["type"] | "equity", string> = {
  asset: "#3b82f6",
  liability: "#f43f5e",
  income: "#10b981",
  expense: "#d946ef",
  equity: "#8b5cf6",
};

interface FormState {
  code: string;
  name: string;
  type: GLAccount["type"];
  parent_group: string;
  status: GLStatus;
  description: string;
  opening_balance: string;
  currency: string;
  normal_balance: "debit" | "credit";
  cashflow_category: string;
  gst_category: string;
  posting_allowed: boolean;
  control_account: boolean;
  bank_reconciliation: boolean;
  is_system: boolean;
  department: string;
  location: string;
  cost_center: string;
}
const emptyForm: FormState = {
  code: "", name: "", type: "asset", parent_group: "", status: "active", description: "",
  opening_balance: "0", currency: "INR", normal_balance: "debit", cashflow_category: "Operating",
  gst_category: "Not Applicable", posting_allowed: true, control_account: false, bank_reconciliation: false,
  is_system: false, department: "Finance", location: "Head Office", cost_center: "Corporate",
};

type Sort = { col: string; dir: "asc" | "desc" };
type Density = "comfortable" | "compact";
type ViewMode = "grid" | "tree";
type DetailTab = "overview" | "opening" | "journal" | "audit" | "linked" | "attachments" | "notes" | "activity";

/* =============================================================== *
 * Page
 * =============================================================== */

export default function GLMasterPage() {
  const toast = useToast();

  const [accounts, setAccounts] = useState<EnrichedGLAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fGroup, setFGroup] = useState("");
  const [fCurrency, setFCurrency] = useState("");
  const [fNormal, setFNormal] = useState("");
  const [fPosting, setFPosting] = useState("");
  const [fControl, setFControl] = useState("");
  const [fSystem, setFSystem] = useState("");
  const [fCreated, setFCreated] = useState("");
  const [fUpdated, setFUpdated] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);

  // sort + paging + view
  const [sorts, setSorts] = useState<Sort[]>([{ col: "code", dir: "asc" }]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [view, setView] = useState<ViewMode>("grid");
  const [split, setSplit] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(TYPE_ORDER.map((t) => `type:${t}`)));

  // extra filters
  const [fDept, setFDept] = useState("");
  const [fLoc, setFLoc] = useState("");
  const [fCost, setFCost] = useState("");

  // command palette + import wizard + bulk currency
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bulkCurrencyOpen, setBulkCurrencyOpen] = useState(false);
  const [bulkCurrency, setBulkCurrency] = useState("INR");
  const router = useRouter();

  // columns
  const [order, setOrder] = useState<ColKey[]>(DEFAULT_ORDER);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(DEFAULT_VISIBLE);
  const [widths, setWidths] = useState<Record<ColKey, number>>(() => Object.fromEntries(DEFAULT_ORDER.map((k) => [k, COLDEF[k].width])) as Record<ColKey, number>);

  // selection + kbd
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<number>(-1);
  const [lastClicked, setLastClicked] = useState<number>(-1);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  // panels / modals
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [deleteTarget, setDeleteTarget] = useState<EnrichedGLAccount | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [parentChangeOpen, setParentChangeOpen] = useState(false);
  const [parentChangeValue, setParentChangeValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [recentIds, setRecentIds] = useState<string[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* ---------------- data ---------------- */
  const fetchAccounts = useCallback(
    async (announce = false) => {
      if (!supabase) return;
      setLoading(true);
      const { data, error } = await supabase.from("gl_accounts").select("*").order("code", { ascending: true });
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      setLoadError(null);
      setAccounts(enrich((data ?? []) as GLAccount[]));
      setRecentIds(readRecent());
      setLoading(false);
      if (announce) toast.success("Accounts refreshed");
    },
    [toast],
  );

  useEffect(() => {
    fetchAccounts();
    setViews(readViews());
    try {
      setRecentSearches(JSON.parse(localStorage.getItem("gl_recent_search") ?? "[]"));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- shortcuts ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && k === "n") {
        e.preventDefault();
        openAdd();
      } else if ((e.metaKey || e.ctrlKey) && k === "e") {
        e.preventDefault();
        if (primaryAccount) openEdit(primaryAccount);
      } else if (e.key === "?" && e.shiftKey) {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /* ---------------- context-menu dismiss ---------------- */
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  /* ---------------- search dropdown dismiss ---------------- */
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchOpen]);

  /* ---------------- derived ---------------- */
  const parentGroups = useMemo(() => Array.from(new Set(accounts.map((a) => a.parent_group).filter(Boolean) as string[])).sort(), [accounts]);
  const currencies = useMemo(() => Array.from(new Set(accounts.map((a) => a.meta.currency))).sort(), [accounts]);
  const departments = useMemo(() => Array.from(new Set(accounts.map((a) => a.meta.department).filter(Boolean))).sort(), [accounts]);
  const locations = useMemo(() => Array.from(new Set(accounts.map((a) => a.meta.location).filter(Boolean))).sort(), [accounts]);
  const costCenters = useMemo(() => Array.from(new Set(accounts.map((a) => a.meta.cost_center).filter(Boolean))).sort(), [accounts]);

  const withinDays = (iso: string, days: string) => {
    if (!days) return true;
    return Date.now() - new Date(iso).getTime() <= Number(days) * 86400000;
  };

  const filtered = useMemo(() => {
    let rows = accounts;
    const q = search.trim().toLowerCase();
    if (q)
      rows = rows.filter((a) => {
        const t = classify(a);
        return (
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.parent_group ?? "").toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q) ||
          t.label.toLowerCase().includes(q) ||
          a.meta.description.toLowerCase().includes(q) ||
          a.meta.currency.toLowerCase().includes(q) ||
          a.meta.created_by.toLowerCase().includes(q)
        );
      });
    if (fType) rows = rows.filter((a) => a.type === fType);
    if (fStatus) rows = rows.filter((a) => a.meta.status === fStatus);
    if (fGroup) rows = rows.filter((a) => a.parent_group === fGroup);
    if (fCurrency) rows = rows.filter((a) => a.meta.currency === fCurrency);
    if (fNormal) rows = rows.filter((a) => a.meta.normal_balance === fNormal);
    if (fPosting) rows = rows.filter((a) => a.meta.posting_allowed === (fPosting === "yes"));
    if (fControl) rows = rows.filter((a) => a.meta.control_account === (fControl === "yes"));
    if (fSystem) rows = rows.filter((a) => a.meta.is_system === (fSystem === "yes"));
    if (fCreated) rows = rows.filter((a) => withinDays(a.meta.created_at, fCreated));
    if (fUpdated) rows = rows.filter((a) => withinDays(a.meta.updated_at, fUpdated));
    if (fDept) rows = rows.filter((a) => a.meta.department === fDept);
    if (fLoc) rows = rows.filter((a) => a.meta.location === fLoc);
    if (fCost) rows = rows.filter((a) => a.meta.cost_center === fCost);
    if (favOnly) rows = rows.filter((a) => a.meta.favorite);

    const val = (a: EnrichedGLAccount, col: string): string | number => {
      switch (col) {
        case "code": return a.code;
        case "name": return a.name;
        case "type": return classify(a).label;
        case "parent": return a.parent_group ?? "";
        case "normal": return a.meta.normal_balance;
        case "status": return a.meta.status;
        case "balance": return a.meta.opening_balance;
        case "currency": return a.meta.currency;
        case "system": return a.meta.is_system ? 1 : 0;
        case "created": return a.meta.created_at;
        case "updated": return a.meta.updated_at;
        default: return a.code;
      }
    };
    return [...rows].sort((a, b) => {
      if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
      for (const s of sorts) {
        const av = val(a, s.col);
        const bv = val(b, s.col);
        let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [accounts, search, fType, fStatus, fGroup, fCurrency, fNormal, fPosting, fControl, fSystem, fCreated, fUpdated, fDept, fLoc, fCost, favOnly, sorts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
    setActiveRow(-1);
    setLastClicked(-1);
  }, [search, fType, fStatus, fGroup, fCurrency, fNormal, fPosting, fControl, fSystem, fCreated, fUpdated, fDept, fLoc, fCost, favOnly, pageSize, view]);

  const visibleCols = useMemo(() => order.filter((k) => visible[k]), [order, visible]);

  /* ---------------- money + counts + charts ---------------- */
  const money = useMemo(() => {
    const s = { asset: 0, liability: 0, income: 0, expense: 0 } as Record<GLAccount["type"], number>;
    accounts.forEach((a) => (s[a.type] += a.meta.opening_balance));
    return { ...s, net: s.asset - s.liability };
  }, [accounts]);

  const counts = useMemo(() => {
    const c = { total: accounts.length, asset: 0, liability: 0, income: 0, expense: 0, equity: 0, inactive: 0, system: 0, recentAdded: 0, recentUpdated: 0, pending: 0 };
    const days30 = 30 * 86400000;
    accounts.forEach((a) => {
      c[a.type] += 1;
      if (classify(a).key === "equity") c.equity += 1;
      if (a.meta.status !== "active") c.inactive += 1;
      if (a.meta.is_system) c.system += 1;
      if (Date.now() - new Date(a.meta.created_at).getTime() <= days30) c.recentAdded += 1;
      if (Date.now() - new Date(a.meta.updated_at).getTime() <= days30) c.recentUpdated += 1;
      if (a.meta.status === "archived") c.pending += 1;
    });
    return c;
  }, [accounts]);

  // last updated + fiscal context
  const lastUpdated = useMemo(() => {
    if (!accounts.length) return null;
    return accounts.reduce((m, a) => (a.meta.updated_at > m ? a.meta.updated_at : m), accounts[0].meta.updated_at);
  }, [accounts]);
  const fiscal = useMemo(() => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // India FY Apr–Mar
    return { year: `FY ${y}–${String((y + 1) % 100).padStart(2, "0")}`, period: now.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }, []);

  // analytics: top parent groups, opening-balance distribution, recently modified
  const topGroups = useMemo(() => {
    const m = new Map<string, number>();
    accounts.forEach((a) => { const g = a.parent_group ?? "Ungrouped"; m.set(g, (m.get(g) ?? 0) + 1); });
    const palette = ["#2f6bff", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e"];
    return Array.from(m.entries()).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
  }, [accounts]);
  const recentlyModified = useMemo(() => [...accounts].sort((a, b) => (a.meta.updated_at < b.meta.updated_at ? 1 : -1)).slice(0, 5), [accounts]);

  const donutData = useMemo(
    () => [
      { label: "Assets", value: counts.asset, color: TYPE_HEX.asset },
      { label: "Liabilities", value: Math.max(counts.liability - counts.equity, 0), color: TYPE_HEX.liability },
      { label: "Equity", value: counts.equity, color: TYPE_HEX.equity },
      { label: "Income", value: counts.income, color: TYPE_HEX.income },
      { label: "Expenses", value: counts.expense, color: TYPE_HEX.expense },
    ].filter((d) => d.value > 0),
    [counts],
  );
  const trendPoints = useMemo(() => pseudoSeries(`create-${accounts.length}`, 6, Math.max(2, Math.round(accounts.length / 3))), [accounts.length]);
  const trendLabels = useMemo(() => lastMonths(6), []);

  /* ---------------- selection ---------------- */
  const pageIds = paged.map((a) => a.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const selectedAccounts = accounts.filter((a) => selected.has(a.id));

  const toggleSelectAllPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const rowCheck = useCallback(
    (index: number, id: string, shift: boolean) => {
      if (shift && lastClicked >= 0) {
        const [s, e] = [Math.min(lastClicked, index), Math.max(lastClicked, index)];
        const ids = paged.slice(s, e + 1).map((r) => r.id);
        setSelected((prev) => {
          const n = new Set(prev);
          ids.forEach((x) => n.add(x));
          return n;
        });
      } else {
        toggleRow(id);
      }
      setLastClicked(index);
    },
    [lastClicked, paged, toggleRow],
  );

  const primaryAccount =
    activeRow >= 0 && paged[activeRow] ? paged[activeRow] : selected.size === 1 ? accounts.find((a) => selected.has(a.id)) ?? null : null;

  /* ---------------- sorting ---------------- */
  const applySort = (col: string, shift: boolean) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.col === col);
      if (shift) {
        if (existing) return prev.map((s) => (s.col === col ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : s));
        return [...prev, { col, dir: "asc" }];
      }
      if (existing && prev.length === 1) return [{ col, dir: existing.dir === "asc" ? "desc" : "asc" }];
      return [{ col, dir: "asc" }];
    });
  };
  const sortInfo = (col: string) => {
    const idx = sorts.findIndex((s) => s.col === col);
    return idx === -1 ? null : { dir: sorts[idx].dir, order: sorts.length > 1 ? idx + 1 : 0 };
  };

  /* ---------------- column resize ---------------- */
  const startResize = (key: ColKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const move = (ev: PointerEvent) => setWidths((w) => ({ ...w, [key]: Math.max(COLDEF[key].minWidth, startW + ev.clientX - startX) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------------- keyboard nav ---------------- */
  const onGridKey = (e: React.KeyboardEvent) => {
    if (paged.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveRow((i) => Math.min(paged.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveRow((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeRow >= 0) {
      e.preventDefault();
      openDetails(paged[activeRow]);
    } else if ((e.key === "x" || e.key === " ") && activeRow >= 0) {
      e.preventDefault();
      toggleRow(paged[activeRow].id);
    }
  };

  /* ---------------- form ---------------- */
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setErrors({});
    setFormOpen(true);
  };
  const toForm = (a: EnrichedGLAccount): FormState => ({
    code: a.code, name: a.name, type: a.type, parent_group: a.parent_group ?? "", status: a.meta.status,
    description: a.meta.description, opening_balance: String(a.meta.opening_balance), currency: a.meta.currency,
    normal_balance: a.meta.normal_balance, cashflow_category: a.meta.cashflow_category, gst_category: a.meta.gst_category,
    posting_allowed: a.meta.posting_allowed, control_account: a.meta.control_account, bank_reconciliation: a.meta.bank_reconciliation,
    is_system: a.meta.is_system, department: a.meta.department, location: a.meta.location, cost_center: a.meta.cost_center,
  });
  const openEdit = useCallback((a: EnrichedGLAccount) => {
    const f = toForm(a);
    setEditingId(a.id);
    setForm(f);
    setInitialForm(f);
    setErrors({});
    setFormOpen(true);
  }, []);
  const openDuplicate = useCallback(
    (a: EnrichedGLAccount) => {
      const f = { ...toForm(a), code: nextCodeFrom(a.code), name: `${a.name} (Copy)`, is_system: false, status: "active" as GLStatus };
      setEditingId(null);
      setForm(f);
      setInitialForm(emptyForm);
      setErrors({});
      setFormOpen(true);
      toast.info("Duplicated — review the new code before saving");
    },
    [toast],
  );

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const requestCloseForm = () => (dirty ? setConfirmDiscard(true) : setFormOpen(false));

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) e.code = "Account code is required";
    if (!name) e.name = "Account name is required";
    if (code && accounts.some((a) => a.id !== editingId && a.code.toLowerCase() === code.toLowerCase())) e.code = "This account code already exists";
    if (name && accounts.some((a) => a.id !== editingId && a.name.toLowerCase() === name.toLowerCase())) e.name = "An account with this name already exists";
    if (form.opening_balance && Number.isNaN(Number(form.opening_balance))) e.opening_balance = "Enter a valid number";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!supabase || !validate()) return;
    setSaving(true);
    const real = { code: form.code.trim(), name: form.name.trim(), type: form.type, parent_group: form.parent_group.trim() || null };
    const meta = {
      status: form.status, description: form.description.trim(), opening_balance: Number(form.opening_balance) || 0, currency: form.currency,
      normal_balance: form.normal_balance, fs_mapping: fsMappingOf(form.type),
      cashflow_category: form.cashflow_category as EnrichedGLAccount["meta"]["cashflow_category"],
      gst_category: form.gst_category as EnrichedGLAccount["meta"]["gst_category"],
      posting_allowed: form.posting_allowed, control_account: form.control_account, bank_reconciliation: form.bank_reconciliation,
      is_system: form.is_system, department: form.department, location: form.location, cost_center: form.cost_center,
    };
    if (editingId) {
      const { error } = await supabase.from("gl_accounts").update(real).eq("id", editingId);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
      saveMeta(editingId, meta);
      toast.success("Account updated");
    } else {
      const { data, error } = await supabase.from("gl_accounts").insert([real]).select().single();
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
      saveMeta(data.id, { ...meta, created_by: "You" });
      toast.success("Account created");
    }
    setSaving(false);
    setFormOpen(false);
    await fetchAccounts();
  };

  /* ---------------- personalisation ---------------- */
  const patchLocal = useCallback(
    (id: string, patch: Partial<EnrichedGLAccount["meta"]>) => setAccounts((prev) => prev.map((x) => (x.id === id ? { ...x, meta: { ...x.meta, ...patch } } : x))),
    [],
  );
  const toggleFavorite = useCallback(
    (a: EnrichedGLAccount) => {
      const v = !a.meta.favorite;
      saveMeta(a.id, { favorite: v });
      patchLocal(a.id, { favorite: v });
    },
    [patchLocal],
  );
  const togglePin = useCallback(
    (a: EnrichedGLAccount) => {
      const v = !a.meta.pinned;
      saveMeta(a.id, { pinned: v });
      patchLocal(a.id, { pinned: v });
      toast.info(v ? `Pinned ${a.code}` : `Unpinned ${a.code}`);
    },
    [patchLocal, toast],
  );
  const copyCode = useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(code);
        toast.success(`Copied "${code}"`);
      } catch {
        toast.error("Couldn't copy");
      }
    },
    [toast],
  );
  const openDetails = useCallback((a: EnrichedGLAccount) => {
    setDetailsId(a.id);
    setDetailTab("overview");
    pushRecent(a.id);
    setRecentIds(readRecent());
  }, []);
  const deactivate = useCallback(
    (a: EnrichedGLAccount) => {
      saveMeta(a.id, { status: "inactive" });
      patchLocal(a.id, { status: "inactive" });
      setDeleteTarget(null);
      toast.success(`${a.code} marked inactive`);
    },
    [patchLocal, toast],
  );
  const askDelete = useCallback((a: EnrichedGLAccount) => setDeleteTarget(a), []);

  /* ---------------- delete ---------------- */
  const doDelete = async (a: EnrichedGLAccount) => {
    if (!supabase) return;
    if (a.meta.is_system) {
      toast.error("System accounts cannot be deleted");
      return;
    }
    const { error } = await supabase.from("gl_accounts").delete().eq("id", a.id);
    if (error) {
      toast.error("Can't delete: referenced by transactions. Deactivate it instead.");
      setDeleteTarget(null);
      return;
    }
    removeMeta(a.id);
    setSelected((p) => {
      const n = new Set(p);
      n.delete(a.id);
      return n;
    });
    setDeleteTarget(null);
    toast.success("Account deleted");
    await fetchAccounts();
  };

  /* ---------------- bulk ---------------- */
  const bulkSetStatus = (status: GLStatus) => {
    const ids = selectedAccounts.map((a) => a.id);
    ids.forEach((id) => saveMeta(id, { status }));
    setAccounts((prev) => prev.map((x) => (selected.has(x.id) ? { ...x, meta: { ...x.meta, status } } : x)));
    toast.success(`${ids.length} account${ids.length > 1 ? "s" : ""} ${status === "active" ? "activated" : "deactivated"}`);
  };
  const doBulkDelete = async () => {
    if (!supabase) return;
    const ids = selectedAccounts.filter((a) => !a.meta.is_system).map((a) => a.id);
    if (!ids.length) {
      setBulkDeleteOpen(false);
      toast.error("Selected accounts are all system accounts");
      return;
    }
    const { error } = await supabase.from("gl_accounts").delete().in("id", ids);
    if (error) toast.error("Some accounts are referenced by transactions and were kept");
    else {
      ids.forEach(removeMeta);
      toast.success(`${ids.length} account${ids.length > 1 ? "s" : ""} deleted`);
    }
    setSelected(new Set());
    setBulkDeleteOpen(false);
    await fetchAccounts();
  };
  const doBulkParent = async () => {
    if (!supabase) return;
    const ids = selectedAccounts.map((a) => a.id);
    const val = parentChangeValue.trim() || null;
    const { error } = await supabase.from("gl_accounts").update({ parent_group: val }).in("id", ids);
    setParentChangeOpen(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Moved ${ids.length} account${ids.length > 1 ? "s" : ""} to "${val ?? "Ungrouped"}"`);
    await fetchAccounts();
  };
  const doBulkCurrency = () => {
    const ids = selectedAccounts.map((a) => a.id);
    ids.forEach((id) => saveMeta(id, { currency: bulkCurrency }));
    setAccounts((prev) => prev.map((x) => (selected.has(x.id) ? { ...x, meta: { ...x.meta, currency: bulkCurrency } } : x)));
    setBulkCurrencyOpen(false);
    toast.success(`Set ${ids.length} account${ids.length > 1 ? "s" : ""} to ${bulkCurrency}`);
  };
  const copyRow = (a: EnrichedGLAccount) => {
    const row = [a.code, a.name, classify(a).label, a.parent_group ?? "", a.meta.normal_balance, a.meta.opening_balance, a.meta.currency, a.meta.status].join("\t");
    navigator.clipboard.writeText(row).then(() => toast.success("Row copied"), () => toast.error("Couldn't copy"));
  };
  const viewHistory = (a: EnrichedGLAccount) => { openDetails(a); setDetailTab("activity"); };

  /* ---------------- saved views ---------------- */
  const saveView = (name: string) => {
    if (!name.trim()) return;
    const next = [...views, { id: makeId(), name: name.trim(), search, filterType: fType, filterStatus: fStatus, filterGroup: fGroup, filterSystem: fSystem, favOnly }];
    setViews(next);
    writeViews(next);
    toast.success(`View "${name.trim()}" saved`);
  };
  const applyView = (v: SavedView) => {
    setSearch(v.search);
    setFType(v.filterType);
    setFStatus(v.filterStatus);
    setFGroup(v.filterGroup);
    setFSystem(v.filterSystem);
    setFavOnly(v.favOnly);
    toast.info(`Applied "${v.name}"`);
  };
  const deleteView = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    writeViews(next);
  };

  const clearFilters = () => {
    setSearch("");
    setFType("");
    setFStatus("");
    setFGroup("");
    setFCurrency("");
    setFNormal("");
    setFPosting("");
    setFControl("");
    setFSystem("");
    setFCreated("");
    setFUpdated("");
    setFDept("");
    setFLoc("");
    setFCost("");
    setFavOnly(false);
  };
  const activeFilterCount =
    [fType, fStatus, fGroup, fCurrency, fNormal, fPosting, fControl, fSystem, fCreated, fUpdated, fDept, fLoc, fCost].filter(Boolean).length + (favOnly ? 1 : 0);

  /* ---------------- search suggestions / recent ---------------- */
  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return accounts
      .filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.parent_group ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [accounts, search]);
  const commitSearch = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recentSearches.filter((x) => x !== t)].slice(0, 6);
    setRecentSearches(next);
    localStorage.setItem("gl_recent_search", JSON.stringify(next));
  };

  /* ---------------- export / import / print ---------------- */
  const rowsToRecords = (rows: EnrichedGLAccount[]) =>
    rows.map((a) => ({
      Code: a.code, Name: a.name, "Base Type": a.type, "Display Type": classify(a).label, "Parent Group": a.parent_group ?? "",
      "Normal Balance": a.meta.normal_balance === "debit" ? "Debit" : "Credit", "Opening Balance": a.meta.opening_balance, Currency: a.meta.currency,
      Status: a.meta.status, System: a.meta.is_system ? "Yes" : "No", "FS Mapping": a.meta.fs_mapping, "Cash Flow": a.meta.cashflow_category,
      GST: a.meta.gst_category, Department: a.meta.department, Location: a.meta.location, "Cost Center": a.meta.cost_center,
      "Posting Allowed": a.meta.posting_allowed ? "Yes" : "No", "Control A/c": a.meta.control_account ? "Yes" : "No",
      Created: formatDate(a.meta.created_at), Updated: formatDate(a.meta.updated_at),
    }));
  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = (rows: EnrichedGLAccount[]) => {
    if (!rows.length) return toast.error("Nothing to export");
    const recs = rowsToRecords(rows);
    const headers = Object.keys(recs[0]);
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...recs.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","))].join("\n");
    download(csv, "gl-accounts.csv", "text/csv;charset=utf-8;");
    toast.success(`Exported ${rows.length} rows to CSV`);
  };
  const exportExcel = (rows: EnrichedGLAccount[]) => {
    if (!rows.length) return toast.error("Nothing to export");
    const recs = rowsToRecords(rows);
    const headers = Object.keys(recs[0]);
    const th = headers.map((h) => `<th style="background:#0f172a;color:#fff;padding:6px 10px;text-align:left">${h}</th>`).join("");
    const trs = recs.map((r) => `<tr>${headers.map((h) => `<td style="padding:5px 10px;border:1px solid #e2e8f0">${String((r as Record<string, unknown>)[h])}</td>`).join("")}</tr>`).join("");
    download(`<html><head><meta charset="utf-8"></head><body><table>${`<tr>${th}</tr>`}${trs}</table></body></html>`, "gl-accounts.xls", "application/vnd.ms-excel");
    toast.success(`Exported ${rows.length} rows to Excel`);
  };
  const onImport = async (file: File) => {
    if (!supabase) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return toast.error("File is empty");
    const header = lines[0].toLowerCase();
    const start = header.includes("code") && header.includes("name") ? 1 : 0;
    const valid = ["asset", "liability", "income", "expense"];
    const rows: { code: string; name: string; type: string; parent_group: string | null }[] = [];
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const [code, name, type, parent] = cols;
      if (!code || !name) continue;
      if (accounts.some((a) => a.code.toLowerCase() === code.toLowerCase())) continue;
      rows.push({ code, name, type: valid.includes((type || "").toLowerCase()) ? type.toLowerCase() : "asset", parent_group: parent || null });
    }
    if (!rows.length) return toast.error("No new accounts found (duplicates skipped)");
    const { error } = await supabase.from("gl_accounts").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${rows.length} account${rows.length > 1 ? "s" : ""}`);
    fetchAccounts();
  };

  const resetColumns = () => {
    setOrder(DEFAULT_ORDER);
    setVisible(DEFAULT_VISIBLE);
    setWidths(Object.fromEntries(DEFAULT_ORDER.map((k) => [k, COLDEF[k].width])) as Record<ColKey, number>);
    toast.info("Column layout reset");
  };

  const detailAccount = accounts.find((a) => a.id === detailsId) ?? null;
  const rowPad = density === "compact" ? "py-1.5" : "py-2.5";

  // stable API object for memoized rows
  const rowApi = useMemo(
    () => ({ openDetails, openEdit, openDuplicate, copyCode, togglePin, toggleFavorite, deactivate, askDelete, rowCheck, setCtx: (x: number, y: number, id: string) => setCtxMenu({ x, y, id }) }),
    [openDetails, openEdit, openDuplicate, copyCode, togglePin, toggleFavorite, deactivate, askDelete, rowCheck],
  );

  /* ---------------- import wizard ---------------- */
  const existingCodes = useMemo(() => new Set(accounts.map((a) => a.code.toLowerCase())), [accounts]);
  const handleWizardImport = async (rows: ImportRow[]): Promise<{ count: number; error?: string }> => {
    if (!supabase) return { count: 0, error: "Not connected" };
    if (!rows.length) return { count: 0 };
    const { error } = await supabase.from("gl_accounts").insert(rows);
    if (error) return { count: 0, error: error.message };
    await fetchAccounts();
    return { count: rows.length };
  };

  /* ---------------- command palette ---------------- */
  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("gl_theme", next ? "dark" : "light");
  };
  const openByName = (needle: string) => {
    const a = accounts.find((x) => x.name.toLowerCase().includes(needle));
    if (a) openDetails(a);
    else toast.info(`No account matching “${needle}”`);
  };
  const paletteAccounts: PaletteAccount[] = useMemo(
    () => accounts.map((a) => { const c = classify(a); const tone = TYPE_TONE[c.key]; return { id: a.id, code: a.code, name: a.name, icon: c.icon, tone: tone.text, soft: tone.soft }; }),
    [accounts],
  );
  const paletteCommands: Command[] = useMemo(() => {
    const soon = (label: string) => () => toast.info(`${label} isn't built yet`);
    return [
      { id: "new", section: "Create", label: "Create Account", hint: "Ctrl N", icon: "plus", keywords: "add new account", run: openAdd },
      { id: "open-cash", section: "Create", label: "Open Cash account", icon: "wallet", keywords: "cash", run: () => openByName("cash") },
      { id: "open-bank", section: "Create", label: "Open Bank account", icon: "bank", keywords: "bank", run: () => openByName("bank") },
      { id: "open-sales", section: "Create", label: "Open Sales / Revenue", icon: "trending-up", keywords: "sales revenue income", run: () => openByName("sales") },
      { id: "nav-home", section: "Navigation", label: "Go to Home", icon: "home", keywords: "start", run: () => router.push("/") },
      { id: "nav-gl", section: "Navigation", label: "Go to GL Accounts", icon: "bank", keywords: "ledger chart", run: () => {} },
      { id: "nav-cust", section: "Navigation", label: "Go to Customers", icon: "users", keywords: "customer master", run: soon("Customers") },
      { id: "nav-inv", section: "Navigation", label: "Go to Invoices", icon: "receipt", keywords: "sales invoice", run: soon("Invoices") },
      { id: "nav-rcpt", section: "Navigation", label: "Go to Receipts", icon: "wallet", keywords: "receipt payment", run: soon("Receipts") },
      { id: "nav-rep", section: "Navigation", label: "Go to Reports", icon: "file-text", keywords: "ageing statement", run: soon("Reports") },
      { id: "cmd-excel", section: "Commands", label: "Export to Excel", icon: "chart-bar", keywords: "download xls", run: () => exportExcel(filtered) },
      { id: "cmd-csv", section: "Commands", label: "Export to CSV", icon: "download", keywords: "download", run: () => exportCsv(filtered) },
      { id: "cmd-import", section: "Commands", label: "Import CSV…", icon: "upload", keywords: "wizard upload", run: () => setWizardOpen(true) },
      { id: "cmd-print", section: "Commands", label: "Print", icon: "printer", keywords: "", run: () => window.print() },
      { id: "cmd-grid", section: "Commands", label: "Switch to Grid view", icon: "columns", keywords: "table", run: () => setView("grid") },
      { id: "cmd-tree", section: "Commands", label: "Switch to Tree view", icon: "layers", keywords: "hierarchy chart of accounts", run: () => setView("tree") },
      { id: "cmd-split", section: "Commands", label: "Toggle Split view", icon: "panel-left", keywords: "detail dock", run: () => setSplit((s) => !s) },
      { id: "cmd-refresh", section: "Commands", label: "Refresh", icon: "refresh", keywords: "reload", run: () => fetchAccounts(true) },
      { id: "cmd-settings", section: "Commands", label: "Open Settings", icon: "save", keywords: "preferences density", run: () => setSettingsOpen(true) },
      { id: "cmd-theme", section: "Commands", label: "Toggle dark mode", icon: "moon", keywords: "theme light", run: toggleTheme },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, filtered]);

  /* =============================================================== *
   * Render
   * =============================================================== */
  if (!isConfigured) {
    return (
      <div className="p-6">
        <NotConfigured />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      {/* ============ Sticky header + ribbon ============ */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
        <div className="px-6 pt-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
            <span>Masters</span>
            <Icon name="chevron-right" className="h-3 w-3" />
            <span className="text-slate-600 dark:text-slate-300">GL Accounts</span>
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-3 pt-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow">
              <Icon name="bank" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">GL Accounts</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage your chart of accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPaletteOpen(true)} className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 md:inline-flex dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800" title="Command palette · Ctrl K">
              <Icon name="search" className="h-4 w-4" /> <span className="text-slate-400">Search…</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-900">Ctrl K</kbd>
            </button>
            <ViewToggle view={view} setView={setView} />
            <button onClick={() => setSplit((s) => !s)} title="Split view (details beside grid)" aria-pressed={split} className={`hidden h-9 w-9 items-center justify-center rounded-lg border transition-colors lg:inline-flex ${split ? "border-brand/40 bg-blue-50 text-brand dark:bg-brand/10" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
              <Icon name="panel-left" className="h-[18px] w-[18px]" />
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* meta strip: company · fiscal year · period · last updated */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 pb-2 text-xs text-slate-500 dark:text-slate-400">
          <Popover panelClass="w-56" button={(o) => (
            <button className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${o ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              <Icon name="building" className="h-3.5 w-3.5 text-slate-400" /> Verve Advisory Pvt Ltd <Icon name="chevron-down" className="h-3 w-3 opacity-60" />
            </button>
          )}>
            {(close) => (
              <div>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Company</p>
                <button onClick={close} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-brand hover:bg-slate-100 dark:hover:bg-slate-700"><Icon name="check" className="h-4 w-4" /> Verve Advisory Pvt Ltd</button>
                <p className="px-2.5 py-2 text-xs text-slate-400">Single-entity demo. Multi-company coming with consolidation.</p>
              </div>
            )}
          </Popover>
          <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="h-3.5 w-3.5 text-slate-400" /> {fiscal.year}</span>
          <span className="inline-flex items-center gap-1.5"><Icon name="book" className="h-3.5 w-3.5 text-slate-400" /> Period: {fiscal.period}</span>
          {lastUpdated && <span className="inline-flex items-center gap-1.5"><Icon name="refresh" className="h-3.5 w-3.5 text-slate-400" /> Updated {formatDate(lastUpdated)}</span>}
        </div>

        {/* ERP ribbon */}
        <div className="flex items-center gap-1 overflow-x-auto scroll-thin border-t border-slate-100 px-4 py-1.5 dark:border-slate-800">
          <RibbonButton icon="plus" label="New" shortcut="Ctrl N" primary onClick={openAdd} />
          <RibbonButton icon="edit" label="Edit" shortcut="Ctrl E" disabled={!primaryAccount} onClick={() => primaryAccount && openEdit(primaryAccount)} />
          <RibbonButton icon="duplicate" label="Duplicate" disabled={!primaryAccount} onClick={() => primaryAccount && openDuplicate(primaryAccount)} />
          <RibbonButton icon="trash" label="Delete" disabled={!primaryAccount} onClick={() => primaryAccount && askDelete(primaryAccount)} />
          <RibbonDivider />
          <RibbonButton icon="upload" label="Import" onClick={() => setWizardOpen(true)} />
          <RibbonButton icon="chart-bar" label="Excel" onClick={() => exportExcel(filtered)} />
          <RibbonButton icon="download" label="CSV" onClick={() => exportCsv(filtered)} />
          <RibbonButton icon="printer" label="Print" onClick={() => window.print()} />
          <RibbonDivider />
          <RibbonButton icon="refresh" label="Refresh" spinning={loading} onClick={() => fetchAccounts(true)} />
          <RibbonButton icon="save" label="Settings" onClick={() => setSettingsOpen(true)} />
        </div>
      </header>

      <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />

      <div className="space-y-5 p-6">
        {/* ============ KPI dashboard ============ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <SummaryCard label="Total Accounts" value={counts.total} icon="ledger" hex="#64748b" idx={0} />
          <SummaryCard label="Assets" value={counts.asset} icon="coins" hex={TYPE_HEX.asset} idx={1} />
          <SummaryCard label="Liabilities" value={counts.liability} icon="book" hex={TYPE_HEX.liability} idx={2} />
          <SummaryCard label="Equity" value={counts.equity} icon="scale" hex={TYPE_HEX.equity} idx={3} />
          <SummaryCard label="Income" value={counts.income} icon="trending-up" hex={TYPE_HEX.income} idx={4} />
          <SummaryCard label="Expense" value={counts.expense} icon="trending-down" hex={TYPE_HEX.expense} idx={5} />
          <SummaryCard label="System Accounts" value={counts.system} icon="lock" hex="#8b5cf6" idx={6} />
          <SummaryCard label="Inactive" value={counts.inactive} icon="alert" hex="#f59e0b" idx={7} />
          <SummaryCard label="Recently Added" value={counts.recentAdded} icon="plus" hex="#06b6d4" idx={8} />
          <SummaryCard label="Recently Updated" value={counts.recentUpdated} icon="edit" hex="#10b981" idx={9} />
          <SummaryCard label="Pending Approval" value={counts.pending} icon="activity" hex="#f43f5e" idx={10} />
          <SummaryCard label="Favourites" value={accounts.filter((a) => a.meta.favorite).length} icon="star" hex="#eab308" idx={11} />
        </div>

        {/* ============ Analytics ============ */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
          <button onClick={() => setShowAnalytics((s) => !s)} className="flex w-full items-center justify-between px-5 py-3 text-left" aria-expanded={showAnalytics}>
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Icon name="chart-bar" className="h-4 w-4 text-brand" /> Analytics
            </span>
            <Icon name={showAnalytics ? "chevron-up" : "chevron-down"} className="h-4 w-4 text-slate-400" />
          </button>
          <AnimatePresence initial={false}>
            {showAnalytics && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-5 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-4">
                  <AnalyticsTile title="Account Type Distribution">
                    <Donut data={donutData} />
                  </AnalyticsTile>
                  <AnalyticsTile title="Assets vs Liabilities">
                    <BarPair rows={[{ label: "Assets", value: money.asset, color: TYPE_HEX.asset }, { label: "Liabilities", value: money.liability, color: TYPE_HEX.liability }]} format={(n) => compactMoney(n)} />
                    <NetLine label="Net worth" value={money.net} />
                  </AnalyticsTile>
                  <AnalyticsTile title="Income vs Expense">
                    <BarPair rows={[{ label: "Income", value: money.income, color: TYPE_HEX.income }, { label: "Expense", value: money.expense, color: TYPE_HEX.expense }]} format={(n) => compactMoney(n)} />
                    <NetLine label="Net margin" value={money.income - money.expense} />
                  </AnalyticsTile>
                  <AnalyticsTile title="Monthly Account Creation">
                    <TrendBars points={trendPoints} labels={trendLabels} color="#2f6bff" />
                  </AnalyticsTile>
                  <AnalyticsTile title="Opening Balance Distribution">
                    <BarPair rows={[{ label: "Assets", value: money.asset, color: TYPE_HEX.asset }, { label: "Liabilities", value: money.liability, color: TYPE_HEX.liability }, { label: "Income", value: money.income, color: TYPE_HEX.income }, { label: "Expense", value: money.expense, color: TYPE_HEX.expense }]} format={(n) => compactMoney(n)} />
                  </AnalyticsTile>
                  <AnalyticsTile title="Top Parent Groups">
                    {topGroups.length ? <BarPair rows={topGroups} format={(n) => `${n}`} /> : <p className="text-xs text-slate-400">No groups yet.</p>}
                  </AnalyticsTile>
                  <AnalyticsTile title="Recently Modified">
                    <ul className="space-y-2">
                      {recentlyModified.map((a) => (
                        <li key={a.id} className="flex items-center gap-2 text-xs">
                          <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md ${TYPE_TONE[classify(a).key].soft} ${TYPE_TONE[classify(a).key].text}`}><Icon name={classify(a).icon} className="h-3 w-3" /></span>
                          <button onClick={() => openDetails(a)} className="min-w-0 flex-1 truncate text-left font-medium text-slate-700 hover:text-brand dark:text-slate-200">{a.name}</button>
                          <span className="flex-none text-slate-400">{formatDate(a.meta.updated_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </AnalyticsTile>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ============ Search + filters ============ */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div ref={searchBoxRef} className="relative">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitSearch(search);
                  setSearchOpen(false);
                } else if (e.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Search by code, name, group, description, currency, created by…"
              aria-label="Search accounts"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-24 text-sm outline-none transition-colors focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Icon name="x" className="h-4 w-4" />
                </button>
              )}
              <kbd className="pointer-events-none rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-900">Ctrl K</kbd>
            </div>

            <AnimatePresence>
              {searchOpen && (search ? suggestions.length > 0 : recentSearches.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.14 }}
                  className="absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-float dark:border-slate-700 dark:bg-slate-800"
                >
                  {search ? (
                    <>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Suggestions</p>
                      {suggestions.map((a) => (
                        <button
                          key={a.id}
                          onMouseDown={(e) => { e.preventDefault(); openDetails(a); commitSearch(search); setSearchOpen(false); }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${TYPE_TONE[classify(a).key].soft} ${TYPE_TONE[classify(a).key].text}`}>
                            <Icon name={classify(a).icon} className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{highlight(a.name, search)}</span>
                            <span className="block truncate font-mono text-xs text-slate-400">{highlight(a.code, search)}</span>
                          </span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent searches</p>
                      {recentSearches.map((r) => (
                        <button key={r} onMouseDown={(e) => { e.preventDefault(); setSearch(r); setSearchOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                          <Icon name="refresh" className="h-3.5 w-3.5 text-slate-400" />
                          {r}
                        </button>
                      ))}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FilterChip icon="tag" label="Type" value={fType ? BASE_TYPES.find((t) => t.value === fType)?.label ?? "" : ""} options={[{ value: "", label: "All types" }, ...BASE_TYPES.map((t) => ({ value: t.value, label: t.label }))]} onSelect={setFType} />
            <FilterChip icon="layers" label="Group" value={fGroup} options={[{ value: "", label: "All groups" }, ...parentGroups.map((g) => ({ value: g, label: g }))]} onSelect={setFGroup} />
            <FilterChip icon="activity" label="Status" value={fStatus ? STATUS_META[fStatus as GLStatus].label : ""} options={[{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }]} onSelect={setFStatus} />
            <FilterChip icon="coins" label="Currency" value={fCurrency} options={[{ value: "", label: "All currencies" }, ...currencies.map((c) => ({ value: c, label: c }))]} onSelect={setFCurrency} />
            <FilterChip icon="scale" label="Balance" value={fNormal ? (fNormal === "debit" ? "Debit" : "Credit") : ""} options={[{ value: "", label: "Any" }, { value: "debit", label: "Debit" }, { value: "credit", label: "Credit" }]} onSelect={setFNormal} />
            <FilterChip icon="edit" label="Posting" value={fPosting ? (fPosting === "yes" ? "Allowed" : "Blocked") : ""} options={YESNO} onSelect={setFPosting} />
            <FilterChip icon="book" label="Control A/c" value={fControl ? (fControl === "yes" ? "Yes" : "No") : ""} options={YESNO} onSelect={setFControl} />
            <FilterChip icon="lock" label="System" value={fSystem ? (fSystem === "yes" ? "Yes" : "No") : ""} options={YESNO} onSelect={setFSystem} />
            <FilterChip icon="briefcase" label="Dept" value={fDept} options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d, label: d }))]} onSelect={setFDept} />
            <FilterChip icon="map-pin" label="Location" value={fLoc} options={[{ value: "", label: "All locations" }, ...locations.map((l) => ({ value: l, label: l }))]} onSelect={setFLoc} />
            <FilterChip icon="hash" label="Cost Center" value={fCost} options={[{ value: "", label: "All cost centers" }, ...costCenters.map((c) => ({ value: c, label: c }))]} onSelect={setFCost} />
            <FilterChip icon="calendar" label="Created" value={DATE_PRESETS.find((d) => d.value === fCreated && d.value)?.label ?? ""} options={DATE_PRESETS} onSelect={setFCreated} />
            <FilterChip icon="calendar" label="Updated" value={DATE_PRESETS.find((d) => d.value === fUpdated && d.value)?.label ?? ""} options={DATE_PRESETS} onSelect={setFUpdated} />
            <button onClick={() => setFavOnly((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${favOnly ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
              <Icon name={favOnly ? "star-filled" : "star"} className="h-3.5 w-3.5" /> Favourites
            </button>

            <div className="ml-auto flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400">
                  <Icon name="x" className="h-3.5 w-3.5" /> Reset ({activeFilterCount})
                </button>
              )}
              <Popover align="right" panelClass="w-64" button={(o) => <ChipBtn open={o} icon="save" label="Views" />}>
                {() => <SavedViewsPanel views={views} onApply={applyView} onDelete={deleteView} onSave={saveView} />}
              </Popover>
              <Popover align="right" panelClass="w-64" button={(o) => <ChipBtn open={o} icon="columns" label="Columns" />}>
                {() => <ColumnsPanel order={order} setOrder={setOrder} visible={visible} setVisible={setVisible} onReset={resetColumns} />}
              </Popover>
            </div>
          </div>
        </div>

        {/* ============ Bulk bar ============ */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-blue-50/70 px-4 py-2.5 text-sm dark:border-brand/30 dark:bg-brand/10">
              <span className="font-semibold text-brand">{selected.size} selected</span>
              <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400">Clear</button>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <BulkBtn icon="check" label="Activate" onClick={() => bulkSetStatus("active")} />
                <BulkBtn icon="alert" label="Deactivate" onClick={() => bulkSetStatus("inactive")} />
                <BulkBtn icon="layers" label="Change Parent" onClick={() => { setParentChangeValue(""); setParentChangeOpen(true); }} />
                <BulkBtn icon="coins" label="Currency" onClick={() => setBulkCurrencyOpen(true)} />
                <BulkBtn icon="download" label="Export" onClick={() => exportCsv(selectedAccounts)} />
                <BulkBtn icon="printer" label="Print" onClick={() => window.print()} />
                <BulkBtn icon="trash" label="Delete" danger onClick={() => setBulkDeleteOpen(true)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ Grid / Tree (+ split details) ============ */}
        <div className={split && detailAccount ? "flex items-start gap-5" : ""}>
        <div className={split && detailAccount ? "min-w-0 flex-1" : ""}>
        {view === "grid" ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
            <div ref={gridRef} tabIndex={0} onKeyDown={onGridKey} aria-label="GL accounts grid" className={`${split && detailAccount ? "max-h-[calc(100vh-260px)]" : "max-h-[calc(100vh-200px)]"} overflow-auto scroll-thin outline-none focus:ring-2 focus:ring-inset focus:ring-brand/20`}>
              <table className="w-full border-collapse text-sm" style={{ minWidth: 720 }}>
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-50/95 text-left shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur dark:bg-slate-800/95">
                    <th className="sticky left-0 z-10 w-10 bg-slate-50/95 px-4 py-3 backdrop-blur dark:bg-slate-800/95">
                      <input type="checkbox" aria-label="Select all on page" checked={allPageSelected} ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }} onChange={toggleSelectAllPage} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" />
                    </th>
                    <th className="sticky left-10 z-10 min-w-[280px] bg-slate-50/95 px-2 py-3 font-semibold text-slate-600 backdrop-blur freeze-shadow dark:bg-slate-800/95 dark:text-slate-300">
                      <HeaderSort label="Account" info={sortInfo("code")} onClick={(sh) => applySort("code", sh)} />
                    </th>
                    {visibleCols.map((key) => {
                      const def = COLDEF[key];
                      return (
                        <th key={key} style={{ width: widths[key] }} className={`group/col relative whitespace-nowrap px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 ${def.align === "right" ? "text-right" : "text-left"}`}>
                          {def.sortable ? <HeaderSort label={def.label} info={sortInfo(key)} align={def.align} onClick={(sh) => applySort(key, sh)} /> : def.label}
                          <span onPointerDown={(e) => startResize(key, e)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 transition-opacity hover:bg-brand/40 group-hover/col:opacity-100" />
                        </th>
                      );
                    })}
                    <th className="sticky right-0 z-10 w-16 bg-slate-50/95 px-4 py-3 text-right font-semibold text-slate-600 backdrop-blur dark:bg-slate-800/95 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <SkeletonGrid cols={visibleCols.length} />
                  ) : loadError ? (
                    <tr><td colSpan={visibleCols.length + 3} className="py-20"><EmptyState variant="error" title="Couldn't load accounts" body={loadError} actionLabel="Retry" onAction={() => fetchAccounts(true)} /></td></tr>
                  ) : paged.length === 0 ? (
                    <tr><td colSpan={visibleCols.length + 3} className="py-16">{accounts.length === 0 ? <EmptyState variant="empty" title="No GL Accounts Found" body="Create your first ledger account to start recording transactions." actionLabel="Create Account" onAction={openAdd} /> : <EmptyState variant="search" title="No matching accounts" body="No accounts match your search and filters." actionLabel="Clear filters" onAction={clearFilters} />}</td></tr>
                  ) : (
                    paged.map((a, i) => (
                      <GridRow
                        key={a.id}
                        a={a}
                        index={i}
                        selected={selected.has(a.id)}
                        active={i === activeRow}
                        zebra={i % 2 === 1}
                        query={search}
                        visibleCols={visibleCols}
                        widths={widths}
                        rowPad={rowPad}
                        api={rowApi}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && filtered.length > 0 && (
              <Pagination page={currentPage} totalPages={totalPages} pageSize={pageSize} setPageSize={setPageSize} setPage={setPage} total={filtered.length} />
            )}
          </div>
        ) : (
          <TreeView
            accounts={filtered}
            expanded={expanded}
            setExpanded={setExpanded}
            loading={loading}
            query={search}
            onOpen={openDetails}
            api={rowApi}
            onCreate={openAdd}
            onClear={clearFilters}
            hasAny={accounts.length > 0}
          />
        )}
        </div>
        {split && detailAccount && (
          <aside className="hidden w-[420px] flex-none lg:block">
            <div className="sticky top-[196px] flex h-[calc(100vh-216px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
              <DetailsPanel
                a={detailAccount}
                tab={detailTab}
                setTab={setDetailTab}
                onClose={() => setDetailsId(null)}
                onEdit={() => { const acc = detailAccount; setDetailsId(null); openEdit(acc); }}
                onCopy={() => copyCode(detailAccount.code)}
                onSaveNotes={(text) => { saveMeta(detailAccount.id, { description: text }); patchLocal(detailAccount.id, { description: text }); toast.success("Notes saved"); }}
              />
            </div>
          </aside>
        )}
        </div>

        {/* recent chips */}
        {recentIds.length > 0 && !loading && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-500 dark:text-slate-400">Recently viewed</span>
            {recentIds.map((id) => accounts.find((a) => a.id === id)).filter(Boolean).slice(0, 6).map((a) => (
              <button key={a!.id} onClick={() => openDetails(a!)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand/40 hover:text-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <span className="font-mono">{a!.code}</span>
                <span className="max-w-[120px] truncate">{a!.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ============ Context menu ============ */}
      <AnimatePresence>
        {ctxMenu && (() => {
          const a = accounts.find((x) => x.id === ctxMenu.id);
          if (!a) return null;
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              style={{ top: Math.min(ctxMenu.y, window.innerHeight - 470), left: Math.min(ctxMenu.x, window.innerWidth - 200) }}
              className="fixed z-[70] w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-float dark:border-slate-700 dark:bg-slate-800"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem icon="eye" label="View details" onClick={() => { openDetails(a); setCtxMenu(null); }} />
              <MenuItem icon="edit" label="Edit" onClick={() => { openEdit(a); setCtxMenu(null); }} />
              <MenuItem icon="duplicate" label="Duplicate" onClick={() => { openDuplicate(a); setCtxMenu(null); }} />
              <MenuItem icon="copy" label="Copy code" onClick={() => { copyCode(a.code); setCtxMenu(null); }} />
              <MenuItem icon="ledger" label="Copy row" onClick={() => { copyRow(a); setCtxMenu(null); }} />
              <MenuItem icon={a.meta.pinned ? "pin-filled" : "pin"} label={a.meta.pinned ? "Unpin" : "Pin"} onClick={() => { togglePin(a); setCtxMenu(null); }} />
              <MenuItem icon={a.meta.favorite ? "star-filled" : "star"} label={a.meta.favorite ? "Unfavourite" : "Favourite"} onClick={() => { toggleFavorite(a); setCtxMenu(null); }} />
              <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
              <MenuItem icon="activity" label="View history" onClick={() => { viewHistory(a); setCtxMenu(null); }} />
              <MenuItem icon="download" label="Export" onClick={() => { exportCsv([a]); setCtxMenu(null); }} />
              <MenuItem icon="printer" label="Print" onClick={() => { window.print(); setCtxMenu(null); }} />
              <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
              <MenuItem icon="alert" label="Deactivate" onClick={() => { deactivate(a); setCtxMenu(null); }} />
              <MenuItem icon="trash" label="Delete" danger onClick={() => { askDelete(a); setCtxMenu(null); }} />
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ============ Add/Edit ============ */}
      <MotionDrawer open={formOpen} onClose={requestCloseForm} widthClass="w-[620px]" ariaLabel="Account form">
        <AddEditPanel form={form} setForm={setForm} errors={errors} editing={editingId != null} initialForm={initialForm} dirty={dirty} saving={saving} onCancel={requestCloseForm} onSave={handleSave} />
      </MotionDrawer>

      {/* ============ Details (drawer when not split-docked) ============ */}
      <MotionDrawer open={detailAccount != null && !split} onClose={() => setDetailsId(null)} widthClass="w-[560px]" ariaLabel="Account details">
        {detailAccount && (
          <DetailsPanel
            a={detailAccount}
            tab={detailTab}
            setTab={setDetailTab}
            onClose={() => setDetailsId(null)}
            onEdit={() => { const a = detailAccount; setDetailsId(null); openEdit(a); }}
            onCopy={() => copyCode(detailAccount.code)}
            onSaveNotes={(text) => { saveMeta(detailAccount.id, { description: text }); patchLocal(detailAccount.id, { description: text }); toast.success("Notes saved"); }}
          />
        )}
      </MotionDrawer>

      {/* ============ Modals ============ */}
      <Modal isOpen={deleteTarget != null} title={`Delete ${deleteTarget?.code}?`} description={deleteTarget?.meta.is_system ? "This is a system account and cannot be deleted. Mark it inactive instead." : `"${deleteTarget?.name}" will be permanently removed. If it's used by transactions, deletion is blocked — deactivate it instead.`} size="md" icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15"><Icon name="alert" className="h-5 w-5" /></span>} onClose={() => setDeleteTarget(null)} footer={<>
        <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
        {deleteTarget && <button onClick={() => deactivate(deleteTarget)} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">Deactivate</button>}
        {deleteTarget && !deleteTarget.meta.is_system && <button onClick={() => doDelete(deleteTarget)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete</button>}
      </>} />

      <Modal isOpen={bulkDeleteOpen} title={`Delete ${selectedAccounts.filter((a) => !a.meta.is_system).length} accounts?`} description="System accounts are skipped. Accounts referenced by transactions can't be deleted and will be kept." size="md" icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15"><Icon name="trash" className="h-5 w-5" /></span>} onClose={() => setBulkDeleteOpen(false)} footer={<>
        <button onClick={() => setBulkDeleteOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
        <button onClick={doBulkDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete selected</button>
      </>} />

      <Modal isOpen={parentChangeOpen} title={`Move ${selected.size} account${selected.size > 1 ? "s" : ""}`} description="Assign a new parent group. This updates the ledger for all selected accounts." size="md" icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-50 text-brand dark:bg-brand/15"><Icon name="layers" className="h-5 w-5" /></span>} onClose={() => setParentChangeOpen(false)} footer={<>
        <button onClick={() => setParentChangeOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
        <button onClick={doBulkParent} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Apply</button>
      </>}>
        <input value={parentChangeValue} onChange={(e) => setParentChangeValue(e.target.value)} list="pg-opts" placeholder="e.g. Current Assets (leave blank for Ungrouped)" className={`${inputClass} w-full`} />
      </Modal>

      <Modal isOpen={confirmDiscard} title="Discard changes?" description="You have unsaved changes. Closing now will lose them." size="sm" icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/15"><Icon name="alert" className="h-5 w-5" /></span>} onClose={() => setConfirmDiscard(false)} footer={<>
        <button onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Keep editing</button>
        <button onClick={() => { setConfirmDiscard(false); setFormOpen(false); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Discard</button>
      </>} />

      <Modal isOpen={bulkCurrencyOpen} title={`Set currency for ${selected.size} account${selected.size > 1 ? "s" : ""}`} description="Update the reporting currency for all selected accounts." size="md" icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-50 text-brand dark:bg-brand/15"><Icon name="coins" className="h-5 w-5" /></span>} onClose={() => setBulkCurrencyOpen(false)} footer={<>
        <button onClick={() => setBulkCurrencyOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
        <button onClick={doBulkCurrency} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Apply</button>
      </>}>
        <select value={bulkCurrency} onChange={(e) => setBulkCurrency(e.target.value)} className={`${inputClass} w-full`}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </Modal>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} density={density} setDensity={setDensity} showAnalytics={showAnalytics} setShowAnalytics={setShowAnalytics} pageSize={pageSize} setPageSize={setPageSize} onResetColumns={resetColumns} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} accounts={paletteAccounts} onOpenAccount={(id) => { const a = accounts.find((x) => x.id === id); if (a) openDetails(a); }} />
      <ImportWizard open={wizardOpen} onClose={() => setWizardOpen(false)} existingCodes={existingCodes} onImport={handleWizardImport} />

      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}

/* =============================================================== *
 * Grid row (memoised)
 * =============================================================== */
interface RowApi {
  openDetails: (a: EnrichedGLAccount) => void;
  openEdit: (a: EnrichedGLAccount) => void;
  openDuplicate: (a: EnrichedGLAccount) => void;
  copyCode: (code: string) => void;
  togglePin: (a: EnrichedGLAccount) => void;
  toggleFavorite: (a: EnrichedGLAccount) => void;
  deactivate: (a: EnrichedGLAccount) => void;
  askDelete: (a: EnrichedGLAccount) => void;
  rowCheck: (i: number, id: string, shift: boolean) => void;
  setCtx: (x: number, y: number, id: string) => void;
}

const GridRow = React.memo(function GridRow({
  a, index, selected, active, zebra, query, visibleCols, widths, rowPad, api,
}: {
  a: EnrichedGLAccount;
  index: number;
  selected: boolean;
  active: boolean;
  zebra: boolean;
  query: string;
  visibleCols: ColKey[];
  widths: Record<ColKey, number>;
  rowPad: string;
  api: RowApi;
}) {
  const bg = cellBg(selected, active, zebra);
  return (
    <tr
      onClick={() => api.openDetails(a)}
      onContextMenu={(e) => { e.preventDefault(); api.setCtx(e.clientX, e.clientY, a.id); }}
      style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}
      className={`group animate-fade-up cursor-pointer border-b border-slate-100 transition-colors last:border-0 dark:border-slate-800/70 ${selected ? "bg-blue-50/70 dark:bg-brand/10" : active ? "bg-slate-100/70 dark:bg-slate-800/60" : zebra ? "bg-slate-50/40 dark:bg-slate-900/40" : ""} hover:bg-slate-50 dark:hover:bg-slate-800/60`}
    >
      <td className={`sticky left-0 z-10 px-4 ${rowPad} ${bg}`} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label={`Select ${a.code}`} checked={selected} onChange={() => {}} onClick={(e) => api.rowCheck(index, a.id, e.shiftKey)} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" />
      </td>
      <td className={`sticky left-10 z-10 px-2 ${rowPad} freeze-shadow ${bg}`}>
        <AccountCell a={a} query={query} onFav={() => api.toggleFavorite(a)} />
      </td>
      {visibleCols.map((key) => (
        <td key={key} style={{ width: widths[key] }} className={`whitespace-nowrap px-4 ${rowPad} ${COLDEF[key].align === "right" ? "text-right" : ""}`}>
          <Cell a={a} col={key} />
        </td>
      ))}
      <td className={`sticky right-0 z-10 px-4 ${rowPad} ${bg}`} onClick={(e) => e.stopPropagation()}>
        <RowActions a={a} api={api} />
      </td>
    </tr>
  );
});

function Cell({ a, col }: { a: EnrichedGLAccount; col: ColKey }) {
  switch (col) {
    case "type": return <TypePill acc={a} />;
    case "parent": return a.parent_group ? <span className="text-slate-600 dark:text-slate-300">{a.parent_group}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>;
    case "normal": return <NormalBalancePill nb={a.meta.normal_balance} />;
    case "status": { const s = STATUS_META[a.meta.status]; return <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /><span className="text-slate-600 dark:text-slate-300">{s.label}</span></span>; }
    case "balance": return <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(a.meta.opening_balance, a.meta.currency)}</span>;
    case "currency": return <span className="text-slate-600 dark:text-slate-300">{a.meta.currency}</span>;
    case "system": return a.meta.is_system ? <Badge variant="info" size="sm">System</Badge> : <span className="text-xs text-slate-400">User</span>;
    case "created": return <span className="text-slate-500 dark:text-slate-400">{formatDate(a.meta.created_at)}</span>;
    case "updated": return <span className="text-slate-500 dark:text-slate-400">{formatDate(a.meta.updated_at)}</span>;
  }
}

/* =============================================================== *
 * Presentational helpers
 * =============================================================== */
function highlight(text: string, q: string): React.ReactNode {
  const query = q.trim();
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/30">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

function cellBg(sel: boolean, active: boolean, zebra: boolean) {
  if (sel) return "bg-blue-50/70 group-hover:bg-blue-50 dark:bg-brand/10";
  if (active) return "bg-slate-100/70 dark:bg-slate-800/60";
  return zebra ? "bg-slate-50/40 group-hover:bg-slate-50 dark:bg-slate-900/40 dark:group-hover:bg-slate-800/60" : "bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60";
}

function TypePill({ acc }: { acc: GLAccount }) {
  const t = classify(acc);
  const tone = TYPE_TONE[t.key];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone.pill}`} title={`Base type: ${t.base}`}>
      <Icon name={t.icon} className="h-3 w-3" />
      {t.label}
    </span>
  );
}
function NormalBalancePill({ nb }: { nb: "debit" | "credit" }) {
  return nb === "debit" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300">Dr · Debit</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300">Cr · Credit</span>
  );
}
function AccountCell({ a, onFav, query = "" }: { a: EnrichedGLAccount; onFav: () => void; query?: string }) {
  const t = classify(a);
  const tone = TYPE_TONE[t.key];
  return (
    <div className="flex items-center gap-3">
      <button onClick={(e) => { e.stopPropagation(); onFav(); }} className="flex-none rounded-md p-0.5 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10" title={a.meta.favorite ? "Unfavourite" : "Favourite"} aria-label="Toggle favourite">
        <Icon name={a.meta.favorite ? "star-filled" : "star"} className={`h-4 w-4 ${a.meta.favorite ? "text-amber-400" : "text-slate-300 hover:text-slate-400"}`} />
      </button>
      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${tone.soft} ${tone.text}`}>
        <Icon name={t.icon} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-slate-900 dark:text-white">{highlight(a.name, query)}</span>
          {a.meta.pinned && <Icon name="pin-filled" className="h-3 w-3 flex-none text-amber-400" />}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="font-mono">{highlight(a.code, query)}</span>
          {a.meta.description && <span className="max-w-[160px] truncate">· {a.meta.description}</span>}
        </div>
      </div>
    </div>
  );
}

function HeaderSort({ label, info, align, onClick }: { label: string; info: { dir: "asc" | "desc"; order: number } | null; align?: "right"; onClick: (shift: boolean) => void }) {
  return (
    <button onClick={(e) => onClick(e.shiftKey)} title="Click to sort · Shift-click to add" className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white ${align === "right" ? "flex-row-reverse" : ""} ${info ? "text-slate-900 dark:text-white" : ""}`}>
      {label}
      {info ? <Icon name={info.dir === "asc" ? "arrow-up" : "arrow-down"} className="h-3.5 w-3.5 text-brand" /> : <Icon name="sort" className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
      {info && info.order > 0 && <span className="rounded bg-brand/15 px-1 text-[9px] font-bold text-brand">{info.order}</span>}
    </button>
  );
}

function RowActions({ a, api }: { a: EnrichedGLAccount; api: RowApi }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={() => api.copyCode(a.code)} title="Copy code" aria-label="Copy code" className="hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 group-hover:inline-flex dark:hover:bg-slate-700"><Icon name="copy" className="h-4 w-4" /></button>
      <button onClick={() => api.openDuplicate(a)} title="Duplicate" aria-label="Duplicate" className="hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 group-hover:inline-flex dark:hover:bg-slate-700"><Icon name="duplicate" className="h-4 w-4" /></button>
      <button onClick={() => api.openEdit(a)} title="Edit" aria-label="Edit" className="hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-brand group-hover:inline-flex dark:hover:bg-slate-700"><Icon name="edit" className="h-4 w-4" /></button>
      <Popover align="right" panelClass="w-48" button={() => <button title="More actions" aria-label="More actions" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"><Icon name="dots-vertical" className="h-4 w-4" /></button>}>
        {(close) => (
          <div>
            <MenuItem icon="eye" label="View details" onClick={() => { api.openDetails(a); close(); }} />
            <MenuItem icon="edit" label="Edit" onClick={() => { api.openEdit(a); close(); }} />
            <MenuItem icon="duplicate" label="Duplicate" onClick={() => { api.openDuplicate(a); close(); }} />
            <MenuItem icon="copy" label="Copy code" onClick={() => { api.copyCode(a.code); close(); }} />
            <MenuItem icon={a.meta.pinned ? "pin-filled" : "pin"} label={a.meta.pinned ? "Unpin" : "Pin"} onClick={() => { api.togglePin(a); close(); }} />
            <MenuItem icon={a.meta.favorite ? "star-filled" : "star"} label={a.meta.favorite ? "Unfavourite" : "Favourite"} onClick={() => { api.toggleFavorite(a); close(); }} />
            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
            <MenuItem icon="alert" label="Deactivate" onClick={() => { api.deactivate(a); close(); }} />
            <MenuItem icon="trash" label="Delete" danger onClick={() => { api.askDelete(a); close(); }} />
          </div>
        )}
      </Popover>
    </div>
  );
}

function Pagination({ page, totalPages, pageSize, setPageSize, setPage, total }: { page: number; totalPages: number; pageSize: number; setPageSize: (n: number) => void; setPage: React.Dispatch<React.SetStateAction<number>>; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
      <div className="flex items-center gap-2">
        <span>Rows</span>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="hidden sm:inline">· {total} accounts</span>
      </div>
      <div className="flex items-center gap-1">
        <Pager disabled={page === 1} onClick={() => setPage(1)} label="First page" icon="chevrons-left" />
        <Pager disabled={page === 1} onClick={() => setPage((p) => p - 1)} label="Previous page" icon="chevron-left" />
        <span className="px-2 font-medium text-slate-700 dark:text-slate-200">{page} / {totalPages}</span>
        <Pager disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} label="Next page" icon="chevron-right" />
        <Pager disabled={page === totalPages} onClick={() => setPage(totalPages)} label="Last page" icon="chevrons-right" />
      </div>
    </div>
  );
}
function Pager({ disabled, onClick, label, icon }: { disabled: boolean; onClick: () => void; label: string; icon: string }) {
  return <button disabled={disabled} onClick={onClick} aria-label={label} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Icon name={icon} className="h-4 w-4" /></button>;
}

/* ---- ribbon ---- */
function RibbonButton({ icon, label, shortcut, onClick, disabled, primary, spinning }: { icon: string; label: string; shortcut?: string; onClick: () => void; disabled?: boolean; primary?: boolean; spinning?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={shortcut ? `${label} · ${shortcut}` : label} aria-label={label} className={`inline-flex flex-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "bg-brand text-white hover:bg-brand-dark shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
      <Icon name={icon} className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
function RibbonDivider() { return <span className="mx-1 h-5 w-px flex-none bg-slate-200 dark:bg-slate-700" />; }
function BulkBtn({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 font-medium transition-colors dark:bg-slate-800 ${danger ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"}`}><Icon name={icon} className="h-3.5 w-3.5" /> {label}</button>;
}
function ChipBtn({ open, icon, label }: { open: boolean; icon: string; label: string }) {
  return <button className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${open ? "border-brand/40 bg-blue-50 text-brand dark:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Icon name={icon} className="h-3.5 w-3.5" /> {label}</button>;
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
      {(["grid", "tree"] as ViewMode[]).map((v) => (
        <button key={v} onClick={() => setView(v)} title={v === "grid" ? "Grid view" : "Hierarchy view"} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${view === v ? "bg-brand text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>
          <Icon name={v === "grid" ? "columns" : "layers"} className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{v === "grid" ? "Grid" : "Tree"}</span>
        </button>
      ))}
    </div>
  );
}
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("gl_theme", next ? "dark" : "light");
  };
  return <button onClick={toggle} aria-label="Toggle theme" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Icon name={dark ? "sun" : "moon"} className="h-[18px] w-[18px]" /></button>;
}

/* ---- summary card w/ sparkline ---- */
function SummaryCard({ label, value, icon, hex, idx }: { label: string; value: number; icon: string; hex: string; idx: number }) {
  const series = useMemo(() => pseudoSeries(label, 9, Math.max(3, value)), [label, value]);
  const change = useMemo(() => {
    const prev = series[series.length - 2] || 1;
    const last = series[series.length - 1] || 1;
    return ((last - prev) / prev) * 100;
  }, [series]);
  const up = change >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04, type: "spring", stiffness: 240, damping: 22 }} whileHover={{ y: -3 }} className="glass rounded-2xl p-4 shadow-card ring-1 ring-slate-200/60 dark:ring-slate-700/60">
      <div className="flex items-start justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${hex}1a`, color: hex }}><Icon name={icon} className="h-4 w-4" /></span>
        <Sparkline points={series} color={hex} />
      </div>
      <AnimatedCounter value={value} className="mt-2 block text-2xl font-bold tabular-nums text-slate-900 dark:text-white" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
          <Icon name={up ? "trending-up" : "trending-down"} className="h-3 w-3" />
          {Math.abs(change).toFixed(1)}%
        </span>
      </div>
    </motion.div>
  );
}

function AnalyticsTile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}
function NetLine({ label, value }: { label: string; value: number }) {
  const pos = value >= 0;
  return (
    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`font-semibold tabular-nums ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>{compactMoney(value)}</span>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${danger ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"}`}><Icon name={icon} className="h-4 w-4 flex-none text-slate-400" /> {label}</button>;
}

/* ---- filter chip ---- */
function FilterChip({ icon, label, value, options, onSelect }: { icon: string; label: string; value: string; options: { value: string; label: string }[]; onSelect: (v: string) => void }) {
  const active = value !== "";
  return (
    <Popover panelClass="w-52" button={() => (
      <button className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? "border-brand/40 bg-blue-50 text-brand dark:border-brand/40 dark:bg-brand/10 dark:text-blue-300" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
        <Icon name={icon} className="h-3.5 w-3.5" /> {label}{active && <span className="max-w-[110px] truncate font-semibold">: {value}</span>}<Icon name="chevron-down" className="h-3 w-3 opacity-60" />
      </button>
    )}>
      {(close) => (
        <div className="max-h-64 overflow-y-auto scroll-thin">
          {options.map((o) => (
            <button key={o.value || "all"} onClick={() => { onSelect(o.value); close(); }} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${value === o.value ? "font-semibold text-brand" : "text-slate-700 dark:text-slate-200"}`}>
              <span className="truncate">{o.label}</span>{value === o.value && <Icon name="check" className="h-4 w-4 flex-none" />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function SavedViewsPanel({ views, onApply, onDelete, onSave }: { views: SavedView[]; onApply: (v: SavedView) => void; onDelete: (id: string) => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Saved views</p>
      {views.length === 0 ? <p className="px-1 py-2 text-xs text-slate-400">No saved views yet. Save your current filters below.</p> : (
        <div className="max-h-48 space-y-0.5 overflow-y-auto scroll-thin">
          {views.map((v) => (
            <div key={v.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
              <button onClick={() => onApply(v)} className="flex flex-1 items-center gap-2 truncate text-left text-slate-700 dark:text-slate-200"><Icon name="eye" className="h-3.5 w-3.5 flex-none text-slate-400" /><span className="truncate">{v.name}</span></button>
              <button onClick={() => onDelete(v.id)} aria-label="Delete view" className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"><Icon name="trash" className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-700">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" className={`${inputClass} h-8 flex-1 text-xs`} />
        <button onClick={() => { onSave(name); setName(""); }} disabled={!name.trim()} className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Save</button>
      </div>
    </div>
  );
}

function ColumnsPanel({ order, setOrder, visible, setVisible, onReset }: { order: ColKey[]; setOrder: (o: ColKey[]) => void; visible: Record<ColKey, boolean>; setVisible: React.Dispatch<React.SetStateAction<Record<ColKey, boolean>>>; onReset: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon name="grip" className="h-3 w-3" /> Drag to reorder</p>
        <button onClick={onReset} className="text-[11px] font-medium text-brand hover:underline">Reset</button>
      </div>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-0.5">
        {order.map((key) => (
          <Reorder.Item key={key} value={key} className="flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 active:cursor-grabbing dark:text-slate-200 dark:hover:bg-slate-700">
            <Icon name="grip" className="h-3.5 w-3.5 flex-none text-slate-300" />
            <span className="flex-1">{COLDEF[key].label}</span>
            <input type="checkbox" checked={visible[key]} onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}

/* ---- skeleton ---- */
function SkeletonGrid({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100 dark:border-slate-800/70">
          <td className="px-4 py-3.5"><div className="h-4 w-4 rounded shimmer" /></td>
          <td className="px-2 py-3"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-xl shimmer" /><div className="space-y-1.5"><div className="h-3.5 w-40 rounded shimmer" /><div className="h-2.5 w-24 rounded shimmer" /></div></div></td>
          {Array.from({ length: cols }).map((__, c) => <td key={c} className="px-4 py-3.5"><div className="h-3.5 rounded shimmer" style={{ width: `${50 + ((r + c) % 4) * 12}%` }} /></td>)}
          <td className="px-4 py-3.5"><div className="ml-auto h-4 w-6 rounded shimmer" /></td>
        </tr>
      ))}
    </>
  );
}

/* ---- empty state ---- */
function EmptyState({ variant, title, body, actionLabel, onAction }: { variant: "empty" | "search" | "error"; title: string; body: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 text-center">
      <LedgerArt variant={variant} />
      <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</p>
      <button onClick={onAction} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-dark hover:shadow-md">
        {variant === "empty" && <Icon name="plus" className="h-4 w-4" />}{actionLabel}
      </button>
    </div>
  );
}
function LedgerArt({ variant }: { variant: "empty" | "search" | "error" }) {
  const accent = variant === "error" ? "#f43f5e" : variant === "search" ? "#f59e0b" : "#2f6bff";
  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 mx-auto h-24 w-24 rounded-full blur-2xl" style={{ background: `${accent}22` }} />
      <svg width="120" height="96" viewBox="0 0 120 96" fill="none">
        <rect x="20" y="14" width="80" height="68" rx="8" className="fill-white stroke-slate-200 dark:fill-slate-800 dark:stroke-slate-700" strokeWidth="2" />
        <rect x="20" y="14" width="80" height="18" rx="8" fill={accent} opacity="0.14" />
        <rect x="32" y="42" width="26" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
        <rect x="32" y="54" width="46" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
        <rect x="32" y="66" width="36" height="5" rx="2.5" className="fill-slate-200 dark:fill-slate-600" />
        <circle cx="86" cy="70" r="16" fill={accent} opacity="0.12" />
        <path d={variant === "error" ? "M86 64v6m0 4h.01" : variant === "search" ? "M92 76l-4-4m1-3a5 5 0 10-10 0 5 5 0 0010 0z" : "M80 70l4 4 8-8"} stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

/* =============================================================== *
 * Tree / hierarchy view
 * =============================================================== */
function TreeView({ accounts, expanded, setExpanded, loading, query, onOpen, api, onCreate, onClear, hasAny }: {
  accounts: EnrichedGLAccount[];
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  loading: boolean;
  query: string;
  onOpen: (a: EnrichedGLAccount) => void;
  api: RowApi;
  onCreate: () => void;
  onClear: () => void;
  hasAny: boolean;
}) {
  const tree = useMemo(() => {
    return TYPE_ORDER.map((type) => {
      const rows = accounts.filter((a) => a.type === type);
      const groupMap = new Map<string, EnrichedGLAccount[]>();
      rows.forEach((a) => {
        const g = a.parent_group ?? "Ungrouped";
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g)!.push(a);
      });
      const groups = Array.from(groupMap.entries()).map(([name, list]) => ({ name, list, total: list.reduce((s, a) => s + a.meta.opening_balance, 0) }));
      groups.sort((a, b) => a.name.localeCompare(b.name));
      return { type, rows, groups, total: rows.reduce((s, a) => s + a.meta.opening_balance, 0) };
    }).filter((n) => n.rows.length > 0);
  }, [accounts]);

  const toggle = (key: string) => setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allKeys = useMemo(() => { const k: string[] = []; tree.forEach((t) => { k.push(`type:${t.type}`); t.groups.forEach((g) => k.push(`grp:${t.type}|${g.name}`)); }); return k; }, [tree]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Chart of Accounts</span>
        <div className="flex gap-2 text-xs">
          <button onClick={() => setExpanded(new Set(allKeys))} className="font-medium text-brand hover:underline">Expand all</button>
          <span className="text-slate-300">·</span>
          <button onClick={() => setExpanded(new Set())} className="font-medium text-slate-500 hover:underline dark:text-slate-400">Collapse all</button>
        </div>
      </div>
      <div className="max-h-[calc(100vh-220px)] overflow-auto scroll-thin p-2">
        {loading ? (
          <div className="space-y-2 p-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded-lg shimmer" />)}</div>
        ) : tree.length === 0 ? (
          <div className="py-16"><EmptyState variant={hasAny ? "search" : "empty"} title={hasAny ? "No matching accounts" : "No GL Accounts Found"} body={hasAny ? "No accounts match your filters." : "Create your first ledger account."} actionLabel={hasAny ? "Clear filters" : "Create Account"} onAction={hasAny ? onClear : onCreate} /></div>
        ) : (
          tree.map((node) => {
            const tKey = `type:${node.type}`;
            const tOpen = expanded.has(tKey);
            return (
              <div key={node.type} className="mb-1">
                <button onClick={() => toggle(tKey)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Icon name={tOpen ? "chevron-down" : "chevron-right"} className="h-4 w-4 flex-none text-slate-400" />
                  <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${TYPE_TONE[node.type === "asset" ? "asset" : node.type === "liability" ? "liability" : node.type === "income" ? "income" : "expense"].soft}`}>
                    <Icon name={BASE_TYPES.find((b) => b.value === node.type)!.icon} className={`h-4 w-4 ${TYPE_TONE[node.type === "asset" ? "asset" : node.type === "liability" ? "liability" : node.type === "income" ? "income" : "expense"].text}`} />
                  </span>
                  <span className="flex-1 font-semibold text-slate-800 dark:text-slate-100">{TYPE_LABEL[node.type]}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{node.rows.length}</span>
                  <span className="hidden w-32 text-right font-mono text-xs text-slate-500 sm:block dark:text-slate-400">{formatMoney(node.total)}</span>
                </button>
                <AnimatePresence initial={false}>
                  {tOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="ml-4 border-l border-slate-200 pl-2 dark:border-slate-700">
                        {node.groups.map((g) => {
                          const gKey = `grp:${node.type}|${g.name}`;
                          const gOpen = expanded.has(gKey);
                          return (
                            <div key={g.name} className="my-0.5">
                              <button onClick={() => toggle(gKey)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                                <Icon name={gOpen ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5 flex-none text-slate-400" />
                                <Icon name="layers" className="h-3.5 w-3.5 flex-none text-slate-400" />
                                <span className="flex-1 text-sm font-medium text-slate-600 dark:text-slate-300">{g.name}</span>
                                <span className="text-[11px] text-slate-400">{g.list.length}</span>
                              </button>
                              <AnimatePresence initial={false}>
                                {gOpen && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                                    <div className="ml-4 border-l border-slate-200 pl-1 dark:border-slate-700">
                                      {g.list.map((a) => <TreeRow key={a.id} a={a} query={query} onOpen={onOpen} api={api} />)}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TreeRow({ a, query, onOpen, api }: { a: EnrichedGLAccount; query: string; onOpen: (a: EnrichedGLAccount) => void; api: RowApi }) {
  const s = STATUS_META[a.meta.status];
  return (
    <div onClick={() => onOpen(a)} onContextMenu={(e) => { e.preventDefault(); api.setCtx(e.clientX, e.clientY, a.id); }} className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70">
      <button onClick={(e) => { e.stopPropagation(); api.toggleFavorite(a); }} className="flex-none rounded p-0.5" aria-label="Favourite"><Icon name={a.meta.favorite ? "star-filled" : "star"} className={`h-3.5 w-3.5 ${a.meta.favorite ? "text-amber-400" : "text-slate-300"}`} /></button>
      <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{highlight(a.code, query)}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{highlight(a.name, query)}</span>
      <NormalBalancePill nb={a.meta.normal_balance} />
      <span className="hidden items-center gap-1.5 md:inline-flex"><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /><span className="text-xs text-slate-500">{s.label}</span></span>
      <span className="hidden w-28 text-right font-mono text-xs text-slate-600 sm:block dark:text-slate-300">{formatMoney(a.meta.opening_balance, a.meta.currency)}</span>
      <div onClick={(e) => e.stopPropagation()}><RowActions a={a} api={api} /></div>
    </div>
  );
}

/* =============================================================== *
 * Settings + shortcuts
 * =============================================================== */
function SettingsModal({ open, onClose, density, setDensity, showAnalytics, setShowAnalytics, pageSize, setPageSize, onResetColumns }: {
  open: boolean; onClose: () => void; density: Density; setDensity: (d: Density) => void; showAnalytics: boolean; setShowAnalytics: (b: boolean) => void; pageSize: number; setPageSize: (n: number) => void; onResetColumns: () => void;
}) {
  return (
    <Modal isOpen={open} title="Grid settings" description="Personalise how the accounts grid behaves." size="md" onClose={onClose} icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800"><Icon name="save" className="h-5 w-5" /></span>}>
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Row density</p>
          <div className="flex gap-2">
            {(["comfortable", "compact"] as Density[]).map((d) => (
              <button key={d} onClick={() => setDensity(d)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${density === d ? "border-brand bg-blue-50 text-brand dark:bg-brand/10" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Show analytics</p>
          <button onClick={() => setShowAnalytics(!showAnalytics)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showAnalytics ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"}`}><span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showAnalytics ? "translate-x-4" : "translate-x-0.5"}`} /></button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Default rows per page</p>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={`${inputClass}`}>{PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </div>
        <button onClick={onResetColumns} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Icon name="reset" className="h-4 w-4" /> Reset column layout</button>
      </div>
    </Modal>
  );
}
function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = [["Ctrl / ⌘ + K", "Focus search"], ["Ctrl / ⌘ + N", "New account"], ["Ctrl / ⌘ + E", "Edit selected"], ["↑ / ↓", "Move between rows"], ["Enter", "Open selected row"], ["X / Space", "Select row"], ["Shift + click", "Range select / multi-sort"], ["Esc", "Close panel"]];
  return (
    <Modal isOpen={open} title="Keyboard shortcuts" size="md" onClose={onClose}>
      <div className="grid grid-cols-1 gap-2">
        {items.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <span className="text-sm text-slate-600 dark:text-slate-300">{d}</span>
            <kbd className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">{k}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* =============================================================== *
 * Add / Edit slide-over
 * =============================================================== */
function AddEditPanel({ form, setForm, errors, editing, initialForm, dirty, saving, onCancel, onSave }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; errors: Partial<Record<keyof FormState, string>>; editing: boolean; initialForm: FormState; dirty: boolean; saving: boolean; onCancel: () => void; onSave: () => void;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const changed = (k: keyof FormState) => editing && form[k] !== initialForm[k];
  const applyType = (t: GLAccount["type"]) => setForm((f) => ({ ...f, type: t, normal_balance: normalBalanceOf(t) }));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? "Edit GL Account" : "New GL Account"}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{editing ? "Update ledger account details" : "Add a ledger to the chart of accounts"}</p>
        </div>
        <button onClick={onCancel} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon name="x" className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto scroll-thin px-6 py-5">
        <Section title="General" icon="ledger">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Account Code" required error={errors.code} changed={changed("code")}><input autoFocus={!editing} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="1000" className={`${inputClass} w-full font-mono ${errors.code ? "border-red-400 ring-red-200" : ""}`} /></Field>
            <Field label="Status" changed={changed("status")}><select value={form.status} onChange={(e) => set("status", e.target.value as GLStatus)} className={`${inputClass} w-full`}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></Field>
          </div>
          <Field label="Account Name" required error={errors.name} changed={changed("name")}><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Cash in Hand" className={`${inputClass} w-full ${errors.name ? "border-red-400 ring-red-200" : ""}`} /></Field>
          <Field label="Description" changed={changed("description")}><textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What is this account used for?" className={`${inputClass} w-full resize-none`} /></Field>
        </Section>
        <Section title="Classification" icon="tag">
          <Field label="Account Type" required changed={changed("type")}>
            <div className="grid grid-cols-2 gap-2">
              {BASE_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => applyType(t.value)} className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all ${form.type === t.value ? "border-brand bg-blue-50 ring-1 ring-brand/30 dark:bg-brand/10" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
                  <Icon name={t.icon} className={`mt-0.5 h-4 w-4 flex-none ${form.type === t.value ? "text-brand" : "text-slate-400"}`} />
                  <span><span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{t.label}</span><span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{t.help}</span></span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Parent Group" changed={changed("parent_group")}><input value={form.parent_group} onChange={(e) => set("parent_group", e.target.value)} placeholder="Current Assets" list="pg-opts" className={`${inputClass} w-full`} /></Field>
            <Field label="Normal Balance" changed={changed("normal_balance")}><select value={form.normal_balance} onChange={(e) => set("normal_balance", e.target.value as "debit" | "credit")} className={`${inputClass} w-full`}><option value="debit">Debit (Dr)</option><option value="credit">Credit (Cr)</option></select></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cash Flow Category" changed={changed("cashflow_category")}><select value={form.cashflow_category} onChange={(e) => set("cashflow_category", e.target.value)} className={`${inputClass} w-full`}>{["Operating", "Investing", "Financing", "Not Applicable"].map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="GST Category" changed={changed("gst_category")}><select value={form.gst_category} onChange={(e) => set("gst_category", e.target.value)} className={`${inputClass} w-full`}>{["Taxable", "Exempt", "Nil Rated", "Not Applicable"].map((o) => <option key={o}>{o}</option>)}</select></Field>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">Financial statement mapping: <span className="font-semibold text-slate-700 dark:text-slate-200">{fsMappingOf(form.type)}</span></div>
        </Section>
        <Section title="Opening Balance" icon="wallet">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Opening Balance" error={errors.opening_balance} changed={changed("opening_balance")}><input value={form.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} inputMode="decimal" className={`${inputClass} w-full text-right font-mono ${errors.opening_balance ? "border-red-400 ring-red-200" : ""}`} /></Field>
            <Field label="Currency" changed={changed("currency")}><select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={`${inputClass} w-full`}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
        </Section>
        <Section title="Controls" icon="lock">
          <div className="space-y-1">
            <Toggle label="Posting allowed" desc="Users can post journals to this account" checked={form.posting_allowed} onChange={(v) => set("posting_allowed", v)} />
            <Toggle label="Control account" desc="Sub-ledger controlled (AR / AP / tax)" checked={form.control_account} onChange={(v) => set("control_account", v)} />
            <Toggle label="Reconciliation required" desc="Requires periodic bank reconciliation" checked={form.bank_reconciliation} onChange={(v) => set("bank_reconciliation", v)} />
            <Toggle label="System account" desc="Protected — cannot be deleted" checked={form.is_system} onChange={(v) => set("is_system", v)} />
          </div>
        </Section>
        <Section title="Dimensions" icon="briefcase">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Department" changed={changed("department")}><input value={form.department} onChange={(e) => set("department", e.target.value)} className={`${inputClass} w-full`} /></Field>
            <Field label="Location" changed={changed("location")}><input value={form.location} onChange={(e) => set("location", e.target.value)} className={`${inputClass} w-full`} /></Field>
            <Field label="Cost Center" changed={changed("cost_center")}><input value={form.cost_center} onChange={(e) => set("cost_center", e.target.value)} className={`${inputClass} w-full`} /></Field>
          </div>
        </Section>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-400 dark:bg-slate-800">Code, name, type &amp; parent group save to the ledger. All other attributes are kept on this device for the demo.</p>
        <datalist id="pg-opts">{["Current Assets", "Fixed Assets", "Current Liabilities", "Equity", "Revenue", "Direct Expenses", "Indirect Expenses"].map((g) => <option key={g} value={g} />)}</datalist>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <span className="text-xs text-slate-400">{dirty ? "Unsaved changes" : ""}</span>
        <div className="flex gap-3">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark disabled:opacity-60">{saving && <Icon name="refresh" className="h-4 w-4 animate-spin" />}{editing ? "Save Changes" : "Create Account"}</button>
        </div>
      </div>
    </div>
  );
}
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Icon name={icon} className="h-3.5 w-3.5" /> {title}</h3>{children}</section>;
}
function Field({ label, required, error, changed, children }: { label: string; required?: boolean; error?: string; changed?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{label}{required && <span className="text-red-500">*</span>}{changed && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Changed</span>}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}
function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-4 rounded-lg px-1 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
      <span><span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span><span className="mt-0.5 block text-xs text-slate-400">{desc}</span></span>
      <span className={`relative mt-0.5 inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors ${checked ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"}`}><motion.span layout className={`inline-block h-4 w-4 rounded-full bg-white shadow ${checked ? "translate-x-4" : "translate-x-0.5"}`} transition={{ type: "spring", stiffness: 500, damping: 30 }} /></span>
    </button>
  );
}

/* =============================================================== *
 * Details slide-over (8 tabs)
 * =============================================================== */
function DetailsPanel({ a, tab, setTab, onClose, onEdit, onCopy, onSaveNotes }: {
  a: EnrichedGLAccount; tab: DetailTab; setTab: (t: DetailTab) => void; onClose: () => void; onEdit: () => void; onCopy: () => void; onSaveNotes: (t: string) => void;
}) {
  const t = classify(a);
  const tone = TYPE_TONE[t.key];
  const s = STATUS_META[a.meta.status];
  const tabs: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" }, { key: "opening", label: "Opening Balance" }, { key: "journal", label: "Journal Entries" },
    { key: "audit", label: "Audit Trail" }, { key: "linked", label: "Linked Transactions" }, { key: "attachments", label: "Attachments" },
    { key: "notes", label: "Notes" }, { key: "activity", label: "Activity" },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="relative border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-800">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon name="x" className="h-5 w-5" /></button>
        <div className="flex items-center gap-3 pr-10">
          <span className={`flex h-12 w-12 flex-none items-center justify-center rounded-2xl ring-1 ring-inset ${tone.pill}`}><Icon name={t.icon} className="h-6 w-6" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{a.name}</h2>{a.meta.pinned && <Icon name="pin-filled" className="h-4 w-4 flex-none text-amber-400" />}</div>
            <p className="font-mono text-sm text-slate-500 dark:text-slate-400">{a.code}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><TypePill acc={a} /><NormalBalancePill nb={a.meta.normal_balance} /><Badge variant={s.variant} size="sm">{s.label}</Badge>{a.meta.is_system && <Badge variant="info" size="sm">System</Badge>}</div>
      </div>
      <div className="flex gap-1 overflow-x-auto scroll-thin border-b border-slate-200 px-3 dark:border-slate-800">
        {tabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)} className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${tab === tb.key ? "text-brand" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>{tb.label}{tab === tb.key && <motion.span layoutId="detailtab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-6 py-5">
        {tab === "overview" && <OverviewTab a={a} />}
        {tab === "opening" && <OpeningTab a={a} />}
        {tab === "audit" && <AuditTab a={a} />}
        {tab === "journal" && <ModuleEmpty icon="book" title="No journal entries" body="Manual journals and system postings referencing this account will be listed here." />}
        {tab === "linked" && <ModuleEmpty icon="receipt" title="No linked transactions" body="Invoices, receipts and bills that hit this account will appear here once those modules are live." />}
        {tab === "attachments" && <AttachmentsTab />}
        {tab === "notes" && <NotesTab a={a} onSave={onSaveNotes} />}
        {tab === "activity" && <ActivityTab a={a} />}
      </div>
      <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"><Icon name="edit" className="h-4 w-4" /> Edit</button>
        <button onClick={onCopy} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Icon name="copy" className="h-4 w-4" /> Copy Code</button>
      </div>
    </div>
  );
}
function OverviewTab({ a }: { a: EnrichedGLAccount }) {
  const t = classify(a);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3"><Stat label="Opening Balance" value={formatMoney(a.meta.opening_balance, a.meta.currency)} big /><Stat label="Currency" value={a.meta.currency} /></div>
      <dl className="space-y-2.5">
        <DRow label="Display Type" value={t.label} /><DRow label="Base Type" value={a.type} capitalize /><DRow label="Financial Statement" value={a.meta.fs_mapping} />
        <DRow label="Cash Flow Category" value={a.meta.cashflow_category} /><DRow label="GST Category" value={a.meta.gst_category} /><DRow label="Parent Group" value={a.parent_group ?? "—"} />
        <DRow label="Normal Balance" value={a.meta.normal_balance === "debit" ? "Debit (Dr)" : "Credit (Cr)"} />
      </dl>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Controls</p>
        <div className="grid grid-cols-2 gap-2"><Flag on={a.meta.posting_allowed} label="Posting allowed" /><Flag on={a.meta.control_account} label="Control account" /><Flag on={a.meta.bank_reconciliation} label="Reconciliation" /><Flag on={a.meta.is_system} label="System account" /></div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Dimensions</p>
        <div className="grid grid-cols-3 gap-2"><Stat label="Department" value={a.meta.department} sm /><Stat label="Location" value={a.meta.location} sm /><Stat label="Cost Center" value={a.meta.cost_center} sm /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <Stat label="Created By" value={`${a.meta.created_by}`} sm /><Stat label="Created" value={formatDate(a.meta.created_at)} sm />
        <Stat label="Updated By" value={`${a.meta.updated_by}`} sm /><Stat label="Updated" value={formatDate(a.meta.updated_at)} sm />
      </div>
    </div>
  );
}
function OpeningTab({ a }: { a: EnrichedGLAccount }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand/5 to-transparent p-5 dark:border-slate-800">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Opening Balance ({a.meta.normal_balance === "debit" ? "Dr" : "Cr"})</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(a.meta.opening_balance, a.meta.currency)}</p>
        <p className="mt-1 text-xs text-slate-400">As of {formatDate(a.meta.created_at)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3"><Stat label="Currency" value={a.meta.currency} /><Stat label="Normal Balance" value={a.meta.normal_balance === "debit" ? "Debit" : "Credit"} /></div>
      <p className="text-xs text-slate-400">Posted balances are computed from journals once transaction modules are live.</p>
    </div>
  );
}
function AuditTab({ a }: { a: EnrichedGLAccount }) {
  return <ol className="space-y-4"><AuditItem icon="edit" title="Last updated" by={a.meta.updated_by} at={a.meta.updated_at} /><AuditItem icon="plus" title="Created" by={a.meta.created_by} at={a.meta.created_at} last /></ol>;
}
function AttachmentsTab() {
  const [files, setFiles] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <input ref={ref} type="file" multiple className="hidden" onChange={(e) => { const names = Array.from(e.target.files ?? []).map((f) => f.name); setFiles((p) => [...p, ...names]); e.target.value = ""; }} />
      <button onClick={() => ref.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-8 text-center transition-colors hover:border-brand hover:bg-blue-50/40 dark:border-slate-700 dark:hover:bg-slate-800">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Icon name="upload" className="h-5 w-5" /></span>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Attach supporting documents</span>
        <span className="text-xs text-slate-400">Statements, approvals, policies (demo — kept in this session)</span>
      </button>
      {files.length > 0 && <ul className="space-y-1.5">{files.map((f, i) => (
        <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
          <Icon name="file-text" className="h-4 w-4 flex-none text-slate-400" /><span className="flex-1 truncate text-slate-700 dark:text-slate-200">{f}</span>
          <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label="Remove" className="rounded p-1 text-slate-400 hover:text-rose-500"><Icon name="x" className="h-3.5 w-3.5" /></button>
        </li>
      ))}</ul>}
    </div>
  );
}
function NotesTab({ a, onSave }: { a: EnrichedGLAccount; onSave: (t: string) => void }) {
  const [text, setText] = useState(a.meta.description);
  useEffect(() => setText(a.meta.description), [a.id, a.meta.description]);
  return (
    <div className="space-y-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Add internal notes about this account…" className={`${inputClass} w-full resize-none`} />
      <button onClick={() => onSave(text)} disabled={text === a.meta.description} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"><Icon name="save" className="h-4 w-4" /> Save Notes</button>
    </div>
  );
}
const AVATAR_HUES = ["#2f6bff", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4"];
function initialsOf(name: string) { return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"; }
function hueOf(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AVATAR_HUES[h % AVATAR_HUES.length]; }
function bucketOf(iso: string): string {
  const d = new Date(iso).getTime();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (d >= today) return "Today";
  if (d >= today - 86400000) return "Yesterday";
  if (d >= today - 7 * 86400000) return "Last week";
  return "Earlier";
}
function ActivityTab({ a }: { a: EnrichedGLAccount }) {
  const events = [
    { title: "viewed this account", by: "You", at: new Date().toISOString() },
    { title: "updated account details", by: a.meta.updated_by || "System", at: a.meta.updated_at },
    { title: "created this account", by: a.meta.created_by || "System", at: a.meta.created_at },
  ];
  const order = ["Today", "Yesterday", "Last week", "Earlier"];
  const groups = order
    .map((label) => ({ label, items: events.filter((e) => bucketOf(e.at) === label) }))
    .filter((g) => g.items.length);
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
          <ol className="space-y-3">
            {g.items.map((it, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm" style={{ background: hueOf(it.by) }}>{initialsOf(it.by)}</span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200"><span className="font-semibold text-slate-900 dark:text-white">{it.by}</span> {it.title}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(it.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
function ModuleEmpty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Icon name={icon} className="h-6 w-6" /></span><p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p><p className="mt-1 max-w-[240px] text-xs text-slate-400">{body}</p></div>;
}
function Stat({ label, value, big, sm }: { label: string; value: string; big?: boolean; sm?: boolean }) {
  return <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className={`mt-1 font-semibold text-slate-900 dark:text-white ${big ? "text-xl tabular-nums" : sm ? "text-sm" : "text-base"}`}>{value}</p></div>;
}
function DRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5 dark:border-slate-800"><dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt><dd className={`text-right text-sm font-medium text-slate-800 dark:text-slate-100 ${capitalize ? "capitalize" : ""}`}>{value}</dd></div>;
}
function Flag({ on, label }: { on: boolean; label: string }) {
  return <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-800"><span className={`flex h-4 w-4 items-center justify-center rounded-full ${on ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-slate-100 text-slate-300 dark:bg-slate-800"}`}><Icon name={on ? "check" : "x"} className="h-2.5 w-2.5" /></span><span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span></div>;
}
function AuditItem({ icon, title, by, at, last }: { icon: string; title: string; by: string; at: string; last?: boolean }) {
  return <li className="relative flex gap-3 pl-1"><div className="flex flex-col items-center"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Icon name={icon} className="h-3.5 w-3.5" /></span>{!last && <span className="mt-1 w-px flex-1 bg-slate-200 dark:bg-slate-700" />}</div><div className="pb-2"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p><p className="text-xs text-slate-500 dark:text-slate-400">by {by} · {formatDateTime(at)}</p></div></li>;
}

/* =============================================================== *
 * utils
 * =============================================================== */
function nextCodeFrom(code: string): string {
  const m = code.match(/^(\D*)(\d+)$/);
  if (!m) return `${code}-COPY`;
  const [, prefix, digits] = m;
  return `${prefix}${(parseInt(digits, 10) + 1).toString().padStart(digits.length, "0")}`;
}
