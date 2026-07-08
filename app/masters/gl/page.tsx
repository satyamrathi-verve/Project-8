"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  cashflowOf,
  gstOf,
  formatMoney,
  compactMoney,
  formatDate,
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

/* =============================================================== *
 * Config
 * =============================================================== */

const BASE_TYPES: { value: GLAccount["type"]; label: string; help: string; icon: string }[] = [
  { value: "asset", label: "Asset", help: "Cash, bank, receivables, inventory", icon: "coins" },
  { value: "liability", label: "Liability", help: "Payables, tax, loans, equity", icon: "book" },
  { value: "income", label: "Income", help: "Sales, service & other revenue", icon: "trending-up" },
  { value: "expense", label: "Expense", help: "Cost of goods sold & opex", icon: "trending-down" },
];

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
const DEFAULT_VISIBLE: Record<ColKey, boolean> = {
  type: true,
  parent: true,
  normal: true,
  status: true,
  balance: true,
  currency: false,
  system: true,
  created: false,
  updated: true,
};

const PAGE_SIZES = [10, 25, 50];

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
  code: "",
  name: "",
  type: "asset",
  parent_group: "",
  status: "active",
  description: "",
  opening_balance: "0",
  currency: "INR",
  normal_balance: "debit",
  cashflow_category: "Operating",
  gst_category: "Not Applicable",
  posting_allowed: true,
  control_account: false,
  bank_reconciliation: false,
  is_system: false,
  department: "Finance",
  location: "Head Office",
  cost_center: "Corporate",
};

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
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fGroup, setFGroup] = useState("");
  const [fCurrency, setFCurrency] = useState("");
  const [fCreated, setFCreated] = useState("");
  const [fUpdated, setFUpdated] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);

  // sort + paging
  const [sortCol, setSortCol] = useState<string>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // columns
  const [order, setOrder] = useState<ColKey[]>(DEFAULT_ORDER);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(DEFAULT_VISIBLE);
  const [widths, setWidths] = useState<Record<ColKey, number>>(
    () => Object.fromEntries(DEFAULT_ORDER.map((k) => [k, COLDEF[k].width])) as Record<ColKey, number>,
  );

  // selection + kbd
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<number>(-1);

  // panels
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [recentIds, setRecentIds] = useState<string[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- shortcuts ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && k === "n") {
        e.preventDefault();
        openAdd();
      } else if (e.key === "?" && e.shiftKey) {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- derived ---------------- */

  const parentGroups = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.parent_group).filter(Boolean) as string[])).sort(),
    [accounts],
  );
  const currencies = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.meta.currency))).sort(),
    [accounts],
  );

  const withinDays = (iso: string, days: string) => {
    if (!days) return true;
    const ts = new Date(iso).getTime();
    return Date.now() - ts <= Number(days) * 86400000;
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
          a.meta.description.toLowerCase().includes(q)
        );
      });
    if (fType) rows = rows.filter((a) => a.type === fType);
    if (fStatus) rows = rows.filter((a) => a.meta.status === fStatus);
    if (fGroup) rows = rows.filter((a) => a.parent_group === fGroup);
    if (fCurrency) rows = rows.filter((a) => a.meta.currency === fCurrency);
    if (fCreated) rows = rows.filter((a) => withinDays(a.meta.created_at, fCreated));
    if (fUpdated) rows = rows.filter((a) => withinDays(a.meta.updated_at, fUpdated));
    if (favOnly) rows = rows.filter((a) => a.meta.favorite);

    const dir = sortDir === "asc" ? 1 : -1;
    const val = (a: EnrichedGLAccount): string | number => {
      switch (sortCol) {
        case "code":
          return a.code;
        case "name":
          return a.name;
        case "type":
          return classify(a).label;
        case "parent":
          return a.parent_group ?? "";
        case "normal":
          return a.meta.normal_balance;
        case "status":
          return a.meta.status;
        case "balance":
          return a.meta.opening_balance;
        case "currency":
          return a.meta.currency;
        case "system":
          return a.meta.is_system ? 1 : 0;
        case "created":
          return a.meta.created_at;
        case "updated":
          return a.meta.updated_at;
        default:
          return a.code;
      }
    };
    return [...rows].sort((a, b) => {
      if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [accounts, search, fType, fStatus, fGroup, fCurrency, fCreated, fUpdated, favOnly, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  useEffect(() => {
    setPage(1);
    setActiveRow(-1);
  }, [search, fType, fStatus, fGroup, fCurrency, fCreated, fUpdated, favOnly, pageSize]);

  const visibleCols = order.filter((k) => visible[k]);

  /* ---------------- money + counts ---------------- */

  const money = useMemo(() => {
    const sum = { asset: 0, liability: 0, income: 0, expense: 0 } as Record<GLAccount["type"], number>;
    accounts.forEach((a) => (sum[a.type] += a.meta.opening_balance));
    return { ...sum, net: sum.asset - sum.liability };
  }, [accounts]);

  const counts = useMemo(() => {
    const c = { total: accounts.length, asset: 0, liability: 0, income: 0, expense: 0, inactive: 0, system: 0 };
    accounts.forEach((a) => {
      c[a.type] += 1;
      if (a.meta.status !== "active") c.inactive += 1;
      if (a.meta.is_system) c.system += 1;
    });
    return c;
  }, [accounts]);

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
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  /* ---------------- sorting ---------------- */

  const applySort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  /* ---------------- column resize ---------------- */

  const startResize = (key: ColKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const move = (ev: PointerEvent) =>
      setWidths((w) => ({ ...w, [key]: Math.max(COLDEF[key].minWidth, startW + ev.clientX - startX) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------------- keyboard nav on grid ---------------- */

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
    code: a.code,
    name: a.name,
    type: a.type,
    parent_group: a.parent_group ?? "",
    status: a.meta.status,
    description: a.meta.description,
    opening_balance: String(a.meta.opening_balance),
    currency: a.meta.currency,
    normal_balance: a.meta.normal_balance,
    cashflow_category: a.meta.cashflow_category,
    gst_category: a.meta.gst_category,
    posting_allowed: a.meta.posting_allowed,
    control_account: a.meta.control_account,
    bank_reconciliation: a.meta.bank_reconciliation,
    is_system: a.meta.is_system,
    department: a.meta.department,
    location: a.meta.location,
    cost_center: a.meta.cost_center,
  });
  const openEdit = (a: EnrichedGLAccount) => {
    const f = toForm(a);
    setEditingId(a.id);
    setForm(f);
    setInitialForm(f);
    setErrors({});
    setFormOpen(true);
  };
  const openDuplicate = (a: EnrichedGLAccount) => {
    const f = { ...toForm(a), code: nextCodeFrom(a.code), name: `${a.name} (Copy)`, is_system: false, status: "active" as GLStatus };
    setEditingId(null);
    setForm(f);
    setInitialForm(emptyForm);
    setErrors({});
    setFormOpen(true);
    toast.info("Duplicated — review the new code before saving");
  };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const requestCloseForm = () => (dirty ? setConfirmDiscard(true) : setFormOpen(false));

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) e.code = "Account code is required";
    if (!name) e.name = "Account name is required";
    if (code && accounts.some((a) => a.id !== editingId && a.code.toLowerCase() === code.toLowerCase()))
      e.code = "This account code already exists";
    if (name && accounts.some((a) => a.id !== editingId && a.name.toLowerCase() === name.toLowerCase()))
      e.name = "An account with this name already exists";
    if (form.opening_balance && Number.isNaN(Number(form.opening_balance))) e.opening_balance = "Enter a valid number";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!supabase || !validate()) return;
    setSaving(true);
    const real = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      parent_group: form.parent_group.trim() || null,
    };
    const meta = {
      status: form.status,
      description: form.description.trim(),
      opening_balance: Number(form.opening_balance) || 0,
      currency: form.currency,
      normal_balance: form.normal_balance,
      fs_mapping: fsMappingOf(form.type),
      cashflow_category: form.cashflow_category as EnrichedGLAccount["meta"]["cashflow_category"],
      gst_category: form.gst_category as EnrichedGLAccount["meta"]["gst_category"],
      posting_allowed: form.posting_allowed,
      control_account: form.control_account,
      bank_reconciliation: form.bank_reconciliation,
      is_system: form.is_system,
      department: form.department,
      location: form.location,
      cost_center: form.cost_center,
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
  const deactivate = (a: EnrichedGLAccount) => {
    saveMeta(a.id, { status: "inactive" });
    setDeleteTarget(null);
    toast.success(`${a.code} marked inactive`);
    fetchAccounts();
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
    if (error) {
      toast.error("Some accounts are referenced by transactions and were kept");
    } else {
      ids.forEach(removeMeta);
      toast.success(`${ids.length} account${ids.length > 1 ? "s" : ""} deleted`);
    }
    setSelected(new Set());
    setBulkDeleteOpen(false);
    await fetchAccounts();
  };

  /* ---------------- personalisation ---------------- */

  const patchLocal = (id: string, patch: Partial<EnrichedGLAccount["meta"]>) =>
    setAccounts((prev) => prev.map((x) => (x.id === id ? { ...x, meta: { ...x.meta, ...patch } } : x)));

  const toggleFavorite = (a: EnrichedGLAccount) => {
    const v = !a.meta.favorite;
    saveMeta(a.id, { favorite: v });
    patchLocal(a.id, { favorite: v });
  };
  const togglePin = (a: EnrichedGLAccount) => {
    const v = !a.meta.pinned;
    saveMeta(a.id, { pinned: v });
    patchLocal(a.id, { pinned: v });
    toast.info(v ? `Pinned ${a.code}` : `Unpinned ${a.code}`);
  };
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Copied "${code}"`);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  const openDetails = (a: EnrichedGLAccount) => {
    setDetailsId(a.id);
    setDetailTab("overview");
    pushRecent(a.id);
    setRecentIds(readRecent());
  };

  /* ---------------- saved views ---------------- */

  const currentViewPayload = (name: string): SavedView => ({
    id: makeId(),
    name,
    search,
    filterType: fType,
    filterStatus: fStatus,
    filterGroup: fGroup,
    filterSystem: "",
    favOnly,
  });
  const saveView = (name: string) => {
    if (!name.trim()) return;
    const next = [...views, currentViewPayload(name.trim())];
    setViews(next);
    writeViews(next);
    toast.success(`View "${name.trim()}" saved`);
  };
  const applyView = (v: SavedView) => {
    setSearch(v.search);
    setFType(v.filterType);
    setFStatus(v.filterStatus);
    setFGroup(v.filterGroup);
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
    setFCreated("");
    setFUpdated("");
    setFavOnly(false);
  };
  const activeFilterCount =
    (fType ? 1 : 0) + (fStatus ? 1 : 0) + (fGroup ? 1 : 0) + (fCurrency ? 1 : 0) + (fCreated ? 1 : 0) + (fUpdated ? 1 : 0) + (favOnly ? 1 : 0);

  /* ---------------- export / import / print ---------------- */

  const rowsToRecords = (rows: EnrichedGLAccount[]) =>
    rows.map((a) => ({
      Code: a.code,
      Name: a.name,
      "Base Type": a.type,
      "Display Type": classify(a).label,
      "Parent Group": a.parent_group ?? "",
      "Normal Balance": a.meta.normal_balance === "debit" ? "Debit" : "Credit",
      "Opening Balance": a.meta.opening_balance,
      Currency: a.meta.currency,
      Status: a.meta.status,
      System: a.meta.is_system ? "Yes" : "No",
      "FS Mapping": a.meta.fs_mapping,
      "Cash Flow": a.meta.cashflow_category,
      GST: a.meta.gst_category,
      Department: a.meta.department,
      Location: a.meta.location,
      "Cost Center": a.meta.cost_center,
      Created: formatDate(a.meta.created_at),
      Updated: formatDate(a.meta.updated_at),
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
    const th = headers.map((h) => `<th>${h}</th>`).join("");
    const trs = recs
      .map((r) => `<tr>${headers.map((h) => `<td>${String((r as Record<string, unknown>)[h])}</td>`).join("")}</tr>`)
      .join("");
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">${`<tr>${th}</tr>`}${trs}</table></body></html>`;
    download(html, "gl-accounts.xls", "application/vnd.ms-excel");
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

  const detailAccount = accounts.find((a) => a.id === detailsId) ?? null;

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
      {/* ============ Sticky header ============ */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
        <div className="px-6 pt-4">
          <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
            <span>Masters</span>
            <Icon name="chevron-right" className="h-3 w-3" />
            <span className="text-slate-600 dark:text-slate-300">GL Accounts</span>
          </nav>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow">
              <Icon name="bank" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">GL Accounts</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage your chart of accounts</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <HeaderButton icon="upload" label="Import" onClick={() => importRef.current?.click()} />
            <HeaderButton icon="download" label="Export" onClick={() => exportCsv(filtered)} />
            <HeaderButton icon="refresh" label="Refresh" spinning={loading} onClick={() => fetchAccounts(true)} />
            <Popover
              align="right"
              panelClass="w-52"
              button={(o) => (
                <button
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border text-slate-600 transition-colors dark:text-slate-300 ${
                    o ? "border-brand/40 bg-blue-50 dark:bg-slate-800" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                  aria-label="More"
                >
                  <Icon name="more" className="h-4.5 w-4.5" />
                </button>
              )}
            >
              {(close) => (
                <div className="text-sm">
                  <MenuItem icon="chart-bar" label="Export to Excel" onClick={() => { exportExcel(filtered); close(); }} />
                  <MenuItem icon="printer" label="Print" onClick={() => { window.print(); close(); }} />
                  <MenuItem icon="reset" label="Reset filters" onClick={() => { clearFilters(); close(); }} />
                  <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                  <MenuItem icon="hash" label="Keyboard shortcuts" onClick={() => { setShortcutsOpen(true); close(); }} />
                </div>
              )}
            </Popover>
            <button
              onClick={openAdd}
              className="ml-1 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-dark hover:shadow-md active:translate-y-0"
            >
              <Icon name="plus" className="h-4 w-4" />
              New Account
            </button>
          </div>
        </div>
      </header>

      <input
        ref={importRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.target.value = "";
        }}
      />

      <div className="space-y-5 p-6">
        {/* ============ Dashboard strip ============ */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MoneyTile label="Assets" value={money.asset} icon="coins" tone="blue" />
          <MoneyTile label="Liabilities" value={money.liability} icon="book" tone="rose" />
          <MoneyTile label="Income" value={money.income} icon="trending-up" tone="emerald" />
          <MoneyTile label="Expenses" value={money.expense} icon="trending-down" tone="fuchsia" />
          <MoneyTile label="Net Worth" value={money.net} icon="scale" tone="brand" emphasize />
        </div>

        {/* ============ Summary cards ============ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
          <SummaryCard label="Total Accounts" value={counts.total} icon="ledger" tone="slate" idx={0} />
          <SummaryCard label="Assets" value={counts.asset} icon="coins" tone="blue" idx={1} />
          <SummaryCard label="Liabilities" value={counts.liability} icon="book" tone="rose" idx={2} />
          <SummaryCard label="Income" value={counts.income} icon="trending-up" tone="emerald" idx={3} />
          <SummaryCard label="Expense" value={counts.expense} icon="trending-down" tone="fuchsia" idx={4} />
          <SummaryCard label="Inactive" value={counts.inactive} icon="alert" tone="amber" idx={5} />
          <SummaryCard label="System" value={counts.system} icon="lock" tone="violet" idx={6} />
        </div>

        {/* ============ Search + filter toolbar ============ */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts by code, name, group or type…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-24 text-sm outline-none transition-colors focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-900">
              Ctrl K
            </kbd>
          </div>

          {/* chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FilterChip
              icon="tag"
              label="Type"
              value={fType ? BASE_TYPES.find((t) => t.value === fType)?.label ?? "" : ""}
              options={[{ value: "", label: "All types" }, ...BASE_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
              onSelect={setFType}
            />
            <FilterChip
              icon="layers"
              label="Group"
              value={fGroup}
              options={[{ value: "", label: "All groups" }, ...parentGroups.map((g) => ({ value: g, label: g }))]}
              onSelect={setFGroup}
            />
            <FilterChip
              icon="activity"
              label="Status"
              value={fStatus ? STATUS_META[fStatus as GLStatus].label : ""}
              options={[
                { value: "", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "archived", label: "Archived" },
              ]}
              onSelect={setFStatus}
            />
            <FilterChip
              icon="coins"
              label="Currency"
              value={fCurrency}
              options={[{ value: "", label: "All currencies" }, ...currencies.map((c) => ({ value: c, label: c }))]}
              onSelect={setFCurrency}
            />
            <FilterChip icon="calendar" label="Created" value={DATE_PRESETS.find((d) => d.value === fCreated && d.value)?.label ?? ""} options={DATE_PRESETS} onSelect={setFCreated} />
            <FilterChip icon="calendar" label="Updated" value={DATE_PRESETS.find((d) => d.value === fUpdated && d.value)?.label ?? ""} options={DATE_PRESETS} onSelect={setFUpdated} />

            <button
              onClick={() => setFavOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                favOnly
                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon name={favOnly ? "star-filled" : "star"} className="h-3.5 w-3.5" />
              Favourites
            </button>

            <div className="ml-auto flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400">
                  <Icon name="x" className="h-3.5 w-3.5" /> Reset ({activeFilterCount})
                </button>
              )}
              {/* Saved views */}
              <Popover
                align="right"
                panelClass="w-64"
                button={(o) => (
                  <button className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${o ? "border-brand/40 bg-blue-50 text-brand dark:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                    <Icon name="save" className="h-3.5 w-3.5" /> Views
                  </button>
                )}
              >
                {() => <SavedViewsPanel views={views} onApply={applyView} onDelete={deleteView} onSave={saveView} />}
              </Popover>

              {/* Columns */}
              <Popover
                align="right"
                panelClass="w-64"
                button={(o) => (
                  <button className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${o ? "border-brand/40 bg-blue-50 text-brand dark:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                    <Icon name="columns" className="h-3.5 w-3.5" /> Columns
                  </button>
                )}
              >
                {() => <ColumnsPanel order={order} setOrder={setOrder} visible={visible} setVisible={setVisible} />}
              </Popover>
            </div>
          </div>
        </div>

        {/* ============ Bulk bar ============ */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-blue-50/70 px-4 py-2.5 text-sm dark:border-brand/30 dark:bg-brand/10"
            >
              <span className="font-semibold text-brand">{selected.size} selected</span>
              <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400">
                Clear
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => exportCsv(selectedAccounts)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Icon name="download" className="h-3.5 w-3.5" /> Export
                </button>
                <button onClick={() => setBulkDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-800 dark:text-red-400">
                  <Icon name="trash" className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ Data grid ============ */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div
            ref={gridRef}
            tabIndex={0}
            onKeyDown={onGridKey}
            className="max-h-[calc(100vh-220px)] overflow-auto scroll-thin outline-none"
          >
            <table className="w-full border-collapse text-sm" style={{ minWidth: 720 }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-50/95 text-left shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur dark:bg-slate-800/95">
                  {/* frozen: select + account */}
                  <th className="sticky left-0 z-10 w-10 bg-slate-50/95 px-4 py-3 backdrop-blur dark:bg-slate-800/95">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageSelected && !allPageSelected;
                      }}
                      onChange={toggleSelectAllPage}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                  </th>
                  <th className="sticky left-10 z-10 min-w-[280px] bg-slate-50/95 px-2 py-3 font-semibold text-slate-600 backdrop-blur freeze-shadow dark:bg-slate-800/95 dark:text-slate-300">
                    <button onClick={() => applySort("code")} className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white ${sortCol === "code" || sortCol === "name" ? "text-slate-900 dark:text-white" : ""}`}>
                      Account
                      <SortGlyph active={sortCol === "code"} dir={sortDir} />
                    </button>
                  </th>
                  {visibleCols.map((key) => {
                    const def = COLDEF[key];
                    return (
                      <th key={key} style={{ width: widths[key] }} className={`group/col relative whitespace-nowrap px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 ${def.align === "right" ? "text-right" : "text-left"}`}>
                        {def.sortable ? (
                          <button onClick={() => applySort(key)} className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white ${def.align === "right" ? "flex-row-reverse" : ""} ${sortCol === key ? "text-slate-900 dark:text-white" : ""}`}>
                            {def.label}
                            <SortGlyph active={sortCol === key} dir={sortDir} />
                          </button>
                        ) : (
                          def.label
                        )}
                        <span
                          onPointerDown={(e) => startResize(key, e)}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 transition-opacity hover:bg-brand/40 group-hover/col:opacity-100"
                        />
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-10 w-16 bg-slate-50/95 px-4 py-3 text-right font-semibold text-slate-600 backdrop-blur dark:bg-slate-800/95 dark:text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonGrid cols={visibleCols.length} />
                ) : loadError ? (
                  <tr>
                    <td colSpan={visibleCols.length + 3} className="py-20">
                      <EmptyState variant="error" title="Couldn't load accounts" body={loadError} actionLabel="Retry" onAction={() => fetchAccounts(true)} />
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCols.length + 3} className="py-16">
                      {accounts.length === 0 ? (
                        <EmptyState variant="empty" title="Your chart of accounts is empty" body="Create your first ledger account to start recording transactions." actionLabel="Create Account" onAction={openAdd} />
                      ) : (
                        <EmptyState variant="search" title="No matching accounts" body="No accounts match your search and filters." actionLabel="Clear filters" onAction={clearFilters} />
                      )}
                    </td>
                  </tr>
                ) : (
                  paged.map((a, i) => {
                    const isSel = selected.has(a.id);
                    const isActive = i === activeRow;
                    const zebra = i % 2 === 1;
                    return (
                      <tr
                        key={a.id}
                        onClick={() => openDetails(a)}
                        style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
                        className={`group animate-fade-up cursor-pointer border-b border-slate-100 transition-colors last:border-0 dark:border-slate-800/70 ${
                          isSel ? "bg-blue-50/70 dark:bg-brand/10" : isActive ? "bg-slate-100/70 dark:bg-slate-800/60" : zebra ? "bg-slate-50/40 dark:bg-slate-900/40" : ""
                        } hover:bg-slate-50 dark:hover:bg-slate-800/60`}
                      >
                        <td className={`sticky left-0 z-10 px-4 py-3 ${cellBg(isSel, isActive, zebra)}`} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${a.code}`}
                            checked={isSel}
                            onChange={() => toggleRow(a.id)}
                            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                          />
                        </td>
                        <td className={`sticky left-10 z-10 px-2 py-2.5 freeze-shadow ${cellBg(isSel, isActive, zebra)}`}>
                          <AccountCell a={a} onFav={() => toggleFavorite(a)} />
                        </td>
                        {visibleCols.map((key) => (
                          <td key={key} style={{ width: widths[key] }} className={`whitespace-nowrap px-4 py-2.5 ${COLDEF[key].align === "right" ? "text-right" : ""}`}>
                            {renderCell(a, key)}
                          </td>
                        ))}
                        <td className={`sticky right-0 z-10 px-4 py-2.5 ${cellBg(isSel, isActive, zebra)}`} onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            a={a}
                            onView={() => openDetails(a)}
                            onEdit={() => openEdit(a)}
                            onDuplicate={() => openDuplicate(a)}
                            onCopy={() => copyCode(a.code)}
                            onPin={() => togglePin(a)}
                            onFav={() => toggleFavorite(a)}
                            onDeactivate={() => deactivate(a)}
                            onDelete={() => setDeleteTarget(a)}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          {!loading && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span>Rows</span>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand dark:border-slate-700 dark:bg-slate-800">
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="hidden sm:inline">· {filtered.length} accounts</span>
              </div>
              <div className="flex items-center gap-1">
                <Pager disabled={currentPage === 1} onClick={() => setPage(1)} label="First" icon="chevrons-left" />
                <Pager disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)} label="Prev" icon="chevron-left" />
                <span className="px-2 font-medium text-slate-700 dark:text-slate-200">
                  {currentPage} / {totalPages}
                </span>
                <Pager disabled={currentPage === totalPages} onClick={() => setPage((p) => p + 1)} label="Next" icon="chevron-right" />
                <Pager disabled={currentPage === totalPages} onClick={() => setPage(totalPages)} label="Last" icon="chevrons-right" />
              </div>
            </div>
          )}
        </div>

        {/* recent chips */}
        {recentIds.length > 0 && !loading && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-500 dark:text-slate-400">Recently viewed</span>
            {recentIds
              .map((id) => accounts.find((a) => a.id === id))
              .filter(Boolean)
              .slice(0, 6)
              .map((a) => (
                <button key={a!.id} onClick={() => openDetails(a!)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand/40 hover:text-brand dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <span className="font-mono">{a!.code}</span>
                  <span className="max-w-[120px] truncate">{a!.name}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* ============ Add / Edit slide-over ============ */}
      <MotionDrawer open={formOpen} onClose={requestCloseForm} widthClass="w-[620px]" ariaLabel="Account form">
        <AddEditPanel
          form={form}
          setForm={setForm}
          errors={errors}
          editing={editingId != null}
          initialForm={initialForm}
          dirty={dirty}
          saving={saving}
          onCancel={requestCloseForm}
          onSave={handleSave}
        />
      </MotionDrawer>

      {/* ============ Details slide-over ============ */}
      <MotionDrawer open={detailAccount != null} onClose={() => setDetailsId(null)} widthClass="w-[560px]" ariaLabel="Account details">
        {detailAccount && (
          <DetailsPanel
            a={detailAccount}
            tab={detailTab}
            setTab={setDetailTab}
            onClose={() => setDetailsId(null)}
            onEdit={() => {
              const a = detailAccount;
              setDetailsId(null);
              openEdit(a);
            }}
            onCopy={() => copyCode(detailAccount.code)}
            onSaveNotes={(text) => {
              saveMeta(detailAccount.id, { description: text });
              patchLocal(detailAccount.id, { description: text });
              toast.success("Notes saved");
            }}
          />
        )}
      </MotionDrawer>

      {/* ============ Confirms ============ */}
      <Modal
        isOpen={deleteTarget != null}
        title={`Delete ${deleteTarget?.code}?`}
        description={
          deleteTarget?.meta.is_system
            ? "This is a system account and cannot be deleted. You can mark it inactive instead."
            : `"${deleteTarget?.name}" will be permanently removed. If it's used by transactions, deletion is blocked — deactivate it instead.`
        }
        size="md"
        icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15"><Icon name="alert" className="h-5 w-5" /></span>}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            {deleteTarget && <button onClick={() => deactivate(deleteTarget)} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">Deactivate</button>}
            {deleteTarget && !deleteTarget.meta.is_system && <button onClick={() => doDelete(deleteTarget)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete</button>}
          </>
        }
      />
      <Modal
        isOpen={bulkDeleteOpen}
        title={`Delete ${selectedAccounts.filter((a) => !a.meta.is_system).length} accounts?`}
        description="System accounts are skipped. Accounts referenced by transactions can't be deleted and will be kept."
        size="md"
        icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15"><Icon name="trash" className="h-5 w-5" /></span>}
        onClose={() => setBulkDeleteOpen(false)}
        footer={
          <>
            <button onClick={() => setBulkDeleteOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            <button onClick={doBulkDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete selected</button>
          </>
        }
      />
      <Modal
        isOpen={confirmDiscard}
        title="Discard changes?"
        description="You have unsaved changes. Closing now will lose them."
        size="sm"
        icon={<span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/15"><Icon name="alert" className="h-5 w-5" /></span>}
        onClose={() => setConfirmDiscard(false)}
        footer={
          <>
            <button onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Keep editing</button>
            <button onClick={() => { setConfirmDiscard(false); setFormOpen(false); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Discard</button>
          </>
        }
      />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );

  /* ---------------- cell renderer (closure) ---------------- */
  function renderCell(a: EnrichedGLAccount, key: ColKey) {
    switch (key) {
      case "type":
        return <TypePill acc={a} />;
      case "parent":
        return a.parent_group ? <span className="text-slate-600 dark:text-slate-300">{a.parent_group}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>;
      case "normal":
        return <NormalBalancePill nb={a.meta.normal_balance} />;
      case "status": {
        const s = STATUS_META[a.meta.status];
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            <span className="text-slate-600 dark:text-slate-300">{s.label}</span>
          </span>
        );
      }
      case "balance":
        return <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(a.meta.opening_balance, a.meta.currency)}</span>;
      case "currency":
        return <span className="text-slate-600 dark:text-slate-300">{a.meta.currency}</span>;
      case "system":
        return a.meta.is_system ? <Badge variant="info" size="sm">System</Badge> : <span className="text-xs text-slate-400">User</span>;
      case "created":
        return <span className="text-slate-500 dark:text-slate-400">{formatDate(a.meta.created_at)}</span>;
      case "updated":
        return <span className="text-slate-500 dark:text-slate-400">{formatDate(a.meta.updated_at)}</span>;
    }
  }
}

/* =============================================================== *
 * Presentational helpers
 * =============================================================== */

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

function AccountCell({ a, onFav }: { a: EnrichedGLAccount; onFav: () => void }) {
  const t = classify(a);
  const tone = TYPE_TONE[t.key];
  return (
    <div className="flex items-center gap-3">
      <button onClick={(e) => { e.stopPropagation(); onFav(); }} className="flex-none rounded-md p-0.5 transition-colors hover:bg-amber-50 dark:hover:bg-amber-500/10" title={a.meta.favorite ? "Unfavourite" : "Favourite"}>
        <Icon name={a.meta.favorite ? "star-filled" : "star"} className={`h-4 w-4 ${a.meta.favorite ? "text-amber-400" : "text-slate-300 hover:text-slate-400"}`} />
      </button>
      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${tone.soft} ${tone.text}`}>
        <Icon name={t.icon} className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-slate-900 dark:text-white">{a.name}</span>
          {a.meta.pinned && <Icon name="pin-filled" className="h-3 w-3 flex-none text-amber-400" />}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="font-mono">{a.code}</span>
          {a.meta.description && <span className="max-w-[160px] truncate">· {a.meta.description}</span>}
        </div>
      </div>
    </div>
  );
}

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <Icon name="sort" className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />;
  return <Icon name={dir === "asc" ? "arrow-up" : "arrow-down"} className="h-3.5 w-3.5 text-brand" />;
}

function HeaderButton({ icon, label, onClick, spinning }: { icon: string; label: string; onClick: () => void; spinning?: boolean }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
      <Icon name={icon} className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${danger ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"}`}>
      <Icon name={icon} className="h-4 w-4 flex-none text-slate-400" />
      {label}
    </button>
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
  return (
    <button onClick={toggle} aria-label="Toggle theme" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
      <Icon name={dark ? "sun" : "moon"} className="h-4.5 w-4.5" />
    </button>
  );
}

/* ---- money tile (dashboard strip) ---- */
function MoneyTile({ label, value, icon, tone, emphasize }: { label: string; value: number; icon: string; tone: string; emphasize?: boolean }) {
  const tones: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-500/0 text-blue-600 dark:text-blue-400",
    rose: "from-rose-500/10 to-rose-500/0 text-rose-600 dark:text-rose-400",
    emerald: "from-emerald-500/10 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
    fuchsia: "from-fuchsia-500/10 to-fuchsia-500/0 text-fuchsia-600 dark:text-fuchsia-400",
    brand: "from-brand/15 to-brand/0 text-brand",
  };
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-card ${tones[tone]} ${
        emphasize ? "border-brand/30 bg-white dark:border-brand/30 dark:bg-slate-900" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className="opacity-70">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <AnimatedCounter value={value} format={(v) => formatMoney(v)} className={`mt-2 block text-xl font-bold tabular-nums ${emphasize ? "text-brand" : "text-slate-900 dark:text-white"}`} />
      <p className="mt-0.5 text-[11px] text-slate-400">{compactMoney(value)}</p>
    </motion.div>
  );
}

/* ---- summary card ---- */
function SummaryCard({ label, value, icon, tone, idx }: { label: string; value: number; icon: string; tone: string; idx: number }) {
  const tones: Record<string, { ring: string; text: string; soft: string }> = {
    slate: { ring: "ring-slate-200 dark:ring-slate-700", text: "text-slate-600 dark:text-slate-300", soft: "bg-slate-100 dark:bg-slate-800" },
    blue: { ring: "ring-blue-200 dark:ring-blue-500/20", text: "text-blue-600 dark:text-blue-400", soft: "bg-blue-50 dark:bg-blue-500/10" },
    rose: { ring: "ring-rose-200 dark:ring-rose-500/20", text: "text-rose-600 dark:text-rose-400", soft: "bg-rose-50 dark:bg-rose-500/10" },
    emerald: { ring: "ring-emerald-200 dark:ring-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-50 dark:bg-emerald-500/10" },
    fuchsia: { ring: "ring-fuchsia-200 dark:ring-fuchsia-500/20", text: "text-fuchsia-600 dark:text-fuchsia-400", soft: "bg-fuchsia-50 dark:bg-fuchsia-500/10" },
    amber: { ring: "ring-amber-200 dark:ring-amber-500/20", text: "text-amber-600 dark:text-amber-400", soft: "bg-amber-50 dark:bg-amber-500/10" },
    violet: { ring: "ring-violet-200 dark:ring-violet-500/20", text: "text-violet-600 dark:text-violet-400", soft: "bg-violet-50 dark:bg-violet-500/10" },
  };
  const t = tones[tone];
  const trend = pseudoTrend(label);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04, type: "spring", stiffness: 240, damping: 22 }}
      whileHover={{ y: -3 }}
      className="glass rounded-2xl p-4 shadow-card ring-1 ring-slate-200/60 dark:ring-slate-700/60"
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.soft} ${t.text}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${trend.up ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
          <Icon name={trend.up ? "trending-up" : "trending-down"} className="h-3 w-3" />
          {trend.value}%
        </span>
      </div>
      <AnimatedCounter value={value} className="mt-3 block text-2xl font-bold tabular-nums text-slate-900 dark:text-white" />
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </motion.div>
  );
}

function pseudoTrend(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return { up: h % 3 !== 0, value: ((h % 80) / 10 + 1).toFixed(1) };
}

/* ---- filter chip ---- */
function FilterChip({
  icon,
  label,
  value,
  options,
  onSelect,
}: {
  icon: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
}) {
  const active = value !== "";
  return (
    <Popover
      panelClass="w-52"
      button={() => (
        <button
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            active ? "border-brand/40 bg-blue-50 text-brand dark:border-brand/40 dark:bg-brand/10 dark:text-blue-300" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Icon name={icon} className="h-3.5 w-3.5" />
          {label}
          {active && <span className="max-w-[110px] truncate font-semibold">: {value}</span>}
          <Icon name="chevron-down" className="h-3 w-3 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-64 overflow-y-auto scroll-thin">
          {options.map((o) => (
            <button
              key={o.value || "all"}
              onClick={() => { onSelect(o.value); close(); }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${
                value === o.value ? "font-semibold text-brand" : "text-slate-700 dark:text-slate-200"
              }`}
            >
              <span className="truncate">{o.label}</span>
              {value === o.value && <Icon name="check" className="h-4 w-4 flex-none" />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/* ---- saved views panel ---- */
function SavedViewsPanel({ views, onApply, onDelete, onSave }: { views: SavedView[]; onApply: (v: SavedView) => void; onDelete: (id: string) => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Saved views</p>
      {views.length === 0 ? (
        <p className="px-1 py-2 text-xs text-slate-400">No saved views yet. Save your current filters below.</p>
      ) : (
        <div className="max-h-48 space-y-0.5 overflow-y-auto scroll-thin">
          {views.map((v) => (
            <div key={v.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
              <button onClick={() => onApply(v)} className="flex flex-1 items-center gap-2 truncate text-left text-slate-700 dark:text-slate-200">
                <Icon name="eye" className="h-3.5 w-3.5 flex-none text-slate-400" />
                <span className="truncate">{v.name}</span>
              </button>
              <button onClick={() => onDelete(v.id)} className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100">
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-700">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" className={`${inputClass} h-8 flex-1 text-xs`} />
        <button onClick={() => { onSave(name); setName(""); }} disabled={!name.trim()} className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          Save
        </button>
      </div>
    </div>
  );
}

/* ---- columns panel (drag to reorder + toggle) ---- */
function ColumnsPanel({
  order,
  setOrder,
  visible,
  setVisible,
}: {
  order: ColKey[];
  setOrder: (o: ColKey[]) => void;
  visible: Record<ColKey, boolean>;
  setVisible: React.Dispatch<React.SetStateAction<Record<ColKey, boolean>>>;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon name="grip" className="h-3 w-3" /> Drag to reorder
      </p>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-0.5">
        {order.map((key) => (
          <Reorder.Item key={key} value={key} className="flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 active:cursor-grabbing dark:text-slate-200 dark:hover:bg-slate-700">
            <Icon name="grip" className="h-3.5 w-3.5 flex-none text-slate-300" />
            <span className="flex-1">{COLDEF[key].label}</span>
            <input
              type="checkbox"
              checked={visible[key]}
              onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}

/* ---- row actions (hover quick + three-dot) ---- */
function RowActions({
  a,
  onView,
  onEdit,
  onDuplicate,
  onCopy,
  onPin,
  onFav,
  onDeactivate,
  onDelete,
}: {
  a: EnrichedGLAccount;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPin: () => void;
  onFav: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={onCopy} title="Copy code" className="hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 group-hover:inline-flex dark:hover:bg-slate-700">
        <Icon name="copy" className="h-4 w-4" />
      </button>
      <button onClick={onEdit} title="Edit" className="hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-brand group-hover:inline-flex dark:hover:bg-slate-700">
        <Icon name="edit" className="h-4 w-4" />
      </button>
      <Popover
        align="right"
        panelClass="w-48"
        button={() => (
          <button title="More" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700">
            <Icon name="dots-vertical" className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <div>
            <MenuItem icon="eye" label="View details" onClick={() => { onView(); close(); }} />
            <MenuItem icon="edit" label="Edit" onClick={() => { onEdit(); close(); }} />
            <MenuItem icon="duplicate" label="Duplicate" onClick={() => { onDuplicate(); close(); }} />
            <MenuItem icon="copy" label="Copy code" onClick={() => { onCopy(); close(); }} />
            <MenuItem icon={a.meta.pinned ? "pin-filled" : "pin"} label={a.meta.pinned ? "Unpin" : "Pin"} onClick={() => { onPin(); close(); }} />
            <MenuItem icon={a.meta.favorite ? "star-filled" : "star"} label={a.meta.favorite ? "Unfavourite" : "Favourite"} onClick={() => { onFav(); close(); }} />
            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
            <MenuItem icon="alert" label="Deactivate" onClick={() => { onDeactivate(); close(); }} />
            <MenuItem icon="trash" label="Delete" danger onClick={() => { onDelete(); close(); }} />
          </div>
        )}
      </Popover>
    </div>
  );
}

/* ---- pager ---- */
function Pager({ disabled, onClick, label, icon }: { disabled: boolean; onClick: () => void; label: string; icon: string }) {
  return (
    <button disabled={disabled} onClick={onClick} aria-label={label} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

/* ---- skeleton ---- */
function SkeletonGrid({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100 dark:border-slate-800/70">
          <td className="px-4 py-3.5"><div className="h-4 w-4 rounded shimmer" /></td>
          <td className="px-2 py-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl shimmer" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-40 rounded shimmer" />
                <div className="h-2.5 w-24 rounded shimmer" />
              </div>
            </div>
          </td>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5"><div className="h-3.5 rounded shimmer" style={{ width: `${50 + ((r + c) % 4) * 12}%` }} /></td>
          ))}
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
        {variant === "empty" && <Icon name="plus" className="h-4 w-4" />}
        {actionLabel}
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

/* ---- shortcuts modal ---- */
function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = [
    ["Ctrl / ⌘ + K", "Focus search"],
    ["Ctrl / ⌘ + N", "New account"],
    ["↑ / ↓", "Move between rows"],
    ["Enter", "Open selected row"],
    ["X / Space", "Select row"],
    ["Esc", "Close panel"],
    ["Shift + ?", "This help"],
  ];
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

function AddEditPanel({
  form,
  setForm,
  errors,
  editing,
  initialForm,
  dirty,
  saving,
  onCancel,
  onSave,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  errors: Partial<Record<keyof FormState, string>>;
  editing: boolean;
  initialForm: FormState;
  dirty: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const changed = (k: keyof FormState) => editing && form[k] !== initialForm[k];

  // keep normal balance / mapping in step with type unless user overrides
  const applyType = (t: GLAccount["type"]) => setForm((f) => ({ ...f, type: t, normal_balance: normalBalanceOf(t) }));

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? "Edit GL Account" : "New GL Account"}</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{editing ? "Update ledger account details" : "Add a ledger to the chart of accounts"}</p>
        </div>
        <button onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      {/* body */}
      <div className="flex-1 space-y-6 overflow-y-auto scroll-thin px-6 py-5">
        <Section title="General" icon="ledger">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Account Code" required error={errors.code} changed={changed("code")}>
              <input autoFocus={!editing} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="1000" className={`${inputClass} w-full font-mono ${errors.code ? "border-red-400 ring-red-200" : ""}`} />
            </Field>
            <Field label="Status" changed={changed("status")}>
              <select value={form.status} onChange={(e) => set("status", e.target.value as GLStatus)} className={`${inputClass} w-full`}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </div>
          <Field label="Account Name" required error={errors.name} changed={changed("name")}>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Cash in Hand" className={`${inputClass} w-full ${errors.name ? "border-red-400 ring-red-200" : ""}`} />
          </Field>
          <Field label="Description" changed={changed("description")}>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What is this account used for?" className={`${inputClass} w-full resize-none`} />
          </Field>
        </Section>

        <Section title="Classification" icon="tag">
          <Field label="Account Type" required changed={changed("type")}>
            <div className="grid grid-cols-2 gap-2">
              {BASE_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => applyType(t.value)} className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all ${form.type === t.value ? "border-brand bg-blue-50 ring-1 ring-brand/30 dark:bg-brand/10" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}>
                  <Icon name={t.icon} className={`mt-0.5 h-4 w-4 flex-none ${form.type === t.value ? "text-brand" : "text-slate-400"}`} />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{t.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{t.help}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Parent Group" changed={changed("parent_group")}>
              <input value={form.parent_group} onChange={(e) => set("parent_group", e.target.value)} placeholder="Current Assets" list="pg-opts" className={`${inputClass} w-full`} />
            </Field>
            <Field label="Normal Balance" changed={changed("normal_balance")}>
              <select value={form.normal_balance} onChange={(e) => set("normal_balance", e.target.value as "debit" | "credit")} className={`${inputClass} w-full`}>
                <option value="debit">Debit (Dr)</option>
                <option value="credit">Credit (Cr)</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cash Flow Category" changed={changed("cashflow_category")}>
              <select value={form.cashflow_category} onChange={(e) => set("cashflow_category", e.target.value)} className={`${inputClass} w-full`}>
                {["Operating", "Investing", "Financing", "Not Applicable"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="GST Category" changed={changed("gst_category")}>
              <select value={form.gst_category} onChange={(e) => set("gst_category", e.target.value)} className={`${inputClass} w-full`}>
                {["Taxable", "Exempt", "Nil Rated", "Not Applicable"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Financial statement mapping: <span className="font-semibold text-slate-700 dark:text-slate-200">{fsMappingOf(form.type)}</span>
          </div>
        </Section>

        <Section title="Opening Balance" icon="wallet">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Opening Balance" error={errors.opening_balance} changed={changed("opening_balance")}>
              <input value={form.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} inputMode="decimal" className={`${inputClass} w-full text-right font-mono ${errors.opening_balance ? "border-red-400 ring-red-200" : ""}`} />
            </Field>
            <Field label="Currency" changed={changed("currency")}>
              <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={`${inputClass} w-full`}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Controls" icon="lock">
          <div className="space-y-1">
            <Toggle label="Posting allowed" desc="Users can post journals to this account" checked={form.posting_allowed} onChange={(v) => set("posting_allowed", v)} />
            <Toggle label="Control account" desc="Sub-ledger controlled (AR / AP / tax)" checked={form.control_account} onChange={(v) => set("control_account", v)} />
            <Toggle label="Bank reconciliation" desc="Requires periodic reconciliation" checked={form.bank_reconciliation} onChange={(v) => set("bank_reconciliation", v)} />
            <Toggle label="System account" desc="Protected — cannot be deleted" checked={form.is_system} onChange={(v) => set("is_system", v)} />
          </div>
        </Section>

        <Section title="Dimensions" icon="briefcase">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Department" changed={changed("department")}>
              <input value={form.department} onChange={(e) => set("department", e.target.value)} className={`${inputClass} w-full`} />
            </Field>
            <Field label="Location" changed={changed("location")}>
              <input value={form.location} onChange={(e) => set("location", e.target.value)} className={`${inputClass} w-full`} />
            </Field>
            <Field label="Cost Center" changed={changed("cost_center")}>
              <input value={form.cost_center} onChange={(e) => set("cost_center", e.target.value)} className={`${inputClass} w-full`} />
            </Field>
          </div>
        </Section>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-400 dark:bg-slate-800">
          Code, name, type &amp; parent group save to the ledger. All other attributes are kept on this device for the demo.
        </p>

        <datalist id="pg-opts">
          {["Current Assets", "Fixed Assets", "Current Liabilities", "Equity", "Revenue", "Direct Expenses", "Indirect Expenses"].map((g) => <option key={g} value={g} />)}
        </datalist>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <span className="text-xs text-slate-400">{dirty ? "Unsaved changes" : ""}</span>
        <div className="flex gap-3">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark disabled:opacity-60">
            {saving && <Icon name="refresh" className="h-4 w-4 animate-spin" />}
            {editing ? "Save Changes" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon name={icon} className="h-3.5 w-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, required, error, changed, children }: { label: string; required?: boolean; error?: string; changed?: boolean; children: React.ReactNode }) {
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

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-4 rounded-lg px-1 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
      <span>
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{desc}</span>
      </span>
      <span className={`relative mt-0.5 inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors ${checked ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"}`}>
        <motion.span layout className={`inline-block h-4 w-4 rounded-full bg-white shadow ${checked ? "translate-x-4" : "translate-x-0.5"}`} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
      </span>
    </button>
  );
}

/* =============================================================== *
 * Details slide-over
 * =============================================================== */

type DetailTab = "overview" | "transactions" | "opening" | "audit" | "journal" | "notes";

function DetailsPanel({
  a,
  tab,
  setTab,
  onClose,
  onEdit,
  onCopy,
  onSaveNotes,
}: {
  a: EnrichedGLAccount;
  tab: DetailTab;
  setTab: (t: DetailTab) => void;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onSaveNotes: (t: string) => void;
}) {
  const t = classify(a);
  const tone = TYPE_TONE[t.key];
  const s = STATUS_META[a.meta.status];
  const tabs: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "transactions", label: "Transactions" },
    { key: "opening", label: "Opening Balance" },
    { key: "audit", label: "Audit Trail" },
    { key: "journal", label: "Journal Entries" },
    { key: "notes", label: "Notes" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* hero */}
      <div className="relative border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-800">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Icon name="x" className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 pr-10">
          <span className={`flex h-12 w-12 flex-none items-center justify-center rounded-2xl ring-1 ring-inset ${tone.pill}`}>
            <Icon name={t.icon} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{a.name}</h2>
              {a.meta.pinned && <Icon name="pin-filled" className="h-4 w-4 flex-none text-amber-400" />}
            </div>
            <p className="font-mono text-sm text-slate-500 dark:text-slate-400">{a.code}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TypePill acc={a} />
          <NormalBalancePill nb={a.meta.normal_balance} />
          <Badge variant={s.variant} size="sm">{s.label}</Badge>
          {a.meta.is_system && <Badge variant="info" size="sm">System</Badge>}
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto scroll-thin border-b border-slate-200 px-3 dark:border-slate-800">
        {tabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)} className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${tab === tb.key ? "text-brand" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>
            {tb.label}
            {tab === tb.key && <motion.span layoutId="detailtab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto scroll-thin px-6 py-5">
        {tab === "overview" && <OverviewTab a={a} />}
        {tab === "opening" && <OpeningTab a={a} />}
        {tab === "audit" && <AuditTab a={a} />}
        {tab === "transactions" && <ModuleEmpty icon="receipt" title="No transactions yet" body="Postings to this account will appear here once invoicing & receipts go live." />}
        {tab === "journal" && <ModuleEmpty icon="book" title="No journal entries" body="Manual journals and system postings referencing this account will be listed here." />}
        {tab === "notes" && <NotesTab a={a} onSave={onSaveNotes} />}
      </div>

      {/* footer */}
      <div className="flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          <Icon name="edit" className="h-4 w-4" /> Edit
        </button>
        <button onClick={onCopy} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <Icon name="copy" className="h-4 w-4" /> Copy Code
        </button>
      </div>
    </div>
  );
}

function OverviewTab({ a }: { a: EnrichedGLAccount }) {
  const t = classify(a);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Opening Balance" value={formatMoney(a.meta.opening_balance, a.meta.currency)} big />
        <Stat label="Currency" value={a.meta.currency} />
      </div>
      <dl className="space-y-2.5">
        <DRow label="Display Type" value={t.label} />
        <DRow label="Base Type" value={a.type} capitalize />
        <DRow label="Financial Statement" value={a.meta.fs_mapping} />
        <DRow label="Cash Flow Category" value={a.meta.cashflow_category} />
        <DRow label="GST Category" value={a.meta.gst_category} />
        <DRow label="Parent Group" value={a.parent_group ?? "—"} />
        <DRow label="Normal Balance" value={a.meta.normal_balance === "debit" ? "Debit (Dr)" : "Credit (Cr)"} />
      </dl>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Controls</p>
        <div className="grid grid-cols-2 gap-2">
          <Flag on={a.meta.posting_allowed} label="Posting allowed" />
          <Flag on={a.meta.control_account} label="Control account" />
          <Flag on={a.meta.bank_reconciliation} label="Bank reconciliation" />
          <Flag on={a.meta.is_system} label="System account" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Dimensions</p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Department" value={a.meta.department} sm />
          <Stat label="Location" value={a.meta.location} sm />
          <Stat label="Cost Center" value={a.meta.cost_center} sm />
        </div>
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
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Currency" value={a.meta.currency} />
        <Stat label="Normal Balance" value={a.meta.normal_balance === "debit" ? "Debit" : "Credit"} />
      </div>
      <p className="text-xs text-slate-400">Posted balances are computed from journals once transaction modules are live.</p>
    </div>
  );
}

function AuditTab({ a }: { a: EnrichedGLAccount }) {
  return (
    <ol className="space-y-4">
      <AuditItem icon="edit" title="Last updated" by={a.meta.updated_by} at={a.meta.updated_at} />
      <AuditItem icon="plus" title="Created" by={a.meta.created_by} at={a.meta.created_at} last />
    </ol>
  );
}

function NotesTab({ a, onSave }: { a: EnrichedGLAccount; onSave: (t: string) => void }) {
  const [text, setText] = useState(a.meta.description);
  useEffect(() => setText(a.meta.description), [a.id, a.meta.description]);
  return (
    <div className="space-y-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Add internal notes about this account…" className={`${inputClass} w-full resize-none`} />
      <button onClick={() => onSave(text)} disabled={text === a.meta.description} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40">
        <Icon name="save" className="h-4 w-4" /> Save Notes
      </button>
    </div>
  );
}

function ModuleEmpty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Icon name={icon} className="h-6 w-6" /></span>
      <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      <p className="mt-1 max-w-[240px] text-xs text-slate-400">{body}</p>
    </div>
  );
}

function Stat({ label, value, big, sm }: { label: string; value: string; big?: boolean; sm?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 font-semibold text-slate-900 dark:text-white ${big ? "text-xl tabular-nums" : sm ? "text-sm" : "text-base"}`}>{value}</p>
    </div>
  );
}

function DRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5 dark:border-slate-800">
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`text-right text-sm font-medium text-slate-800 dark:text-slate-100 ${capitalize ? "capitalize" : ""}`}>{value}</dd>
    </div>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-800">
      <span className={`flex h-4 w-4 items-center justify-center rounded-full ${on ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-slate-100 text-slate-300 dark:bg-slate-800"}`}>
        <Icon name={on ? "check" : "x"} className="h-2.5 w-2.5" />
      </span>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  );
}

function AuditItem({ icon, title, by, at, last }: { icon: string; title: string; by: string; at: string; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pl-1">
      <div className="flex flex-col items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Icon name={icon} className="h-3.5 w-3.5" /></span>
        {!last && <span className="mt-1 w-px flex-1 bg-slate-200 dark:bg-slate-700" />}
      </div>
      <div className="pb-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">by {by} · {formatDate(at)}</p>
      </div>
    </li>
  );
}

/* =============================================================== *
 * utils
 * =============================================================== */

function nextCodeFrom(code: string): string {
  const m = code.match(/^(\D*)(\d+)$/);
  if (!m) return `${code}-COPY`;
  const [, prefix, digits] = m;
  const next = (parseInt(digits, 10) + 1).toString().padStart(digits.length, "0");
  return `${prefix}${next}`;
}
