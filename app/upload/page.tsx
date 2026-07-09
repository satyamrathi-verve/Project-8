"use client";

import { useEffect, useMemo, useState } from "react";
import { isConfigured, supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
import { inputClass } from "@/components/FormField";
import type { Customer } from "@/lib/types";

/*
  Data Entry — Upload Report. Bulk-punch customers or invoices from a CSV
  instead of one-by-one: pick a type, upload a file, fix obvious issues right
  in the preview grid, then insert everything that's valid in one go.
*/

type ImportKind = "invoices" | "customers";

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (ch === "," && !inQ) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out.map((c) => c.trim());
    });
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildColumnMap<T extends string>(headers: string[], aliases: Record<T, string[]>): Partial<Record<T, number>> {
  const normalized = headers.map(normalizeHeader);
  const map: Partial<Record<T, number>> = {};
  (Object.keys(aliases) as T[]).forEach((field) => {
    const idx = normalized.findIndex((h) => aliases[field].includes(h));
    if (idx >= 0) map[field] = idx;
  });
  return map;
}

function toValidIsoDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toValidIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return toValidIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- Customers ---------------- */

type CustomerField =
  | "code" | "name" | "gstin" | "pan" | "contact_person" | "email" | "phone" | "address"
  | "credit_limit" | "credit_days" | "opening_balance";

const CUSTOMER_ALIASES: Record<CustomerField, string[]> = {
  code: ["code", "customer_code", "cust_code"],
  name: ["name", "customer_name"],
  gstin: ["gstin", "gst_no", "gst"],
  pan: ["pan"],
  contact_person: ["contact_person", "contact", "contact_name"],
  email: ["email", "email_id"],
  phone: ["phone", "mobile", "phone_no"],
  address: ["address"],
  credit_limit: ["credit_limit"],
  credit_days: ["credit_days"],
  opening_balance: ["opening_balance", "opening_bal"],
};
const CUSTOMER_REQUIRED: CustomerField[] = ["code", "name"];

type CustomerDraftRow = { id: string } & Record<CustomerField, string>;

type ValidatedCustomerRow = CustomerDraftRow & { errors: string[]; warnings: string[]; ok: boolean };

/* ---------------- Invoices ---------------- */

type InvoiceField =
  | "invoice_no" | "invoice_date" | "customer_code" | "due_date" | "description" | "subtotal" | "tax_amount" | "notes";

const INVOICE_ALIASES: Record<InvoiceField, string[]> = {
  invoice_no: ["invoice_no", "invoice_number", "inv_no"],
  invoice_date: ["invoice_date", "date"],
  customer_code: ["customer_code", "customer", "cust_code"],
  due_date: ["due_date"],
  description: ["description", "item", "item_description"],
  subtotal: ["subtotal", "amount"],
  tax_amount: ["tax_amount", "tax", "gst_amount"],
  notes: ["notes", "remarks"],
};
const INVOICE_REQUIRED: InvoiceField[] = ["invoice_no", "invoice_date", "customer_code", "subtotal"];

type InvoiceDraftRow = { id: string } & Record<InvoiceField, string>;

type ValidatedInvoiceRow = InvoiceDraftRow & {
  errors: string[];
  warnings: string[];
  ok: boolean;
  resolvedCustomer?: Customer;
  normalizedInvoiceDate?: string;
  normalizedDueDate?: string;
  parsedSubtotal: number;
  parsedTax: number;
  total: number;
};

export default function UploadReportPage() {
  const [kind, setKind] = useState<ImportKind>("invoices");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");

  const [customerRows, setCustomerRows] = useState<CustomerDraftRow[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceDraftRow[]>([]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [existingCustomerCodes, setExistingCustomerCodes] = useState<Set<string>>(new Set());
  const [existingInvoiceNos, setExistingInvoiceNos] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ count: number; skipped: number; error?: string } | null>(null);

  async function loadReferenceData() {
    if (!supabase) return;
    const { data: custs } = await supabase.from("customers").select("*").order("name");
    setCustomers(custs ?? []);
    setExistingCustomerCodes(new Set((custs ?? []).map((c) => c.code.toLowerCase())));

    const { data: invs } = await supabase.from("invoices").select("invoice_no");
    setExistingInvoiceNos(new Set((invs ?? []).map((i) => i.invoice_no.toLowerCase())));
  }

  useEffect(() => {
    loadReferenceData();
  }, []);

  const customersByCode = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.code.toLowerCase(), c));
    return map;
  }, [customers]);

  function resetImport() {
    setFileName("");
    setFileError("");
    setCustomerRows([]);
    setInvoiceRows([]);
    setResult(null);
  }

  function switchKind(next: ImportKind) {
    if (next === kind) return;
    setKind(next);
    resetImport();
  }

  async function handleFile(file: File) {
    setResult(null);
    setFileError("");
    const text = await file.text();
    const grid = parseCsv(text);
    if (grid.length < 2) {
      setFileError("That file has no data rows. It needs a header row plus at least one row of data.");
      return;
    }
    const [header, ...body] = grid;
    setFileName(file.name);

    if (kind === "customers") {
      const map = buildColumnMap<CustomerField>(header, CUSTOMER_ALIASES);
      const missing = CUSTOMER_REQUIRED.filter((f) => map[f] === undefined);
      if (missing.length > 0) {
        setFileError(`Missing required column(s): ${missing.join(", ")}. Download the sample CSV to see the expected headers.`);
        setCustomerRows([]);
        return;
      }
      const rows: CustomerDraftRow[] = body.map((r, i) => {
        const get = (f: CustomerField) => (map[f] !== undefined ? (r[map[f]!] ?? "").trim() : "");
        return {
          id: `${Date.now()}-${i}`,
          code: get("code"),
          name: get("name"),
          gstin: get("gstin"),
          pan: get("pan"),
          contact_person: get("contact_person"),
          email: get("email"),
          phone: get("phone"),
          address: get("address"),
          credit_limit: get("credit_limit"),
          credit_days: get("credit_days"),
          opening_balance: get("opening_balance"),
        };
      });
      setCustomerRows(rows);
    } else {
      const map = buildColumnMap<InvoiceField>(header, INVOICE_ALIASES);
      const missing = INVOICE_REQUIRED.filter((f) => map[f] === undefined);
      if (missing.length > 0) {
        setFileError(`Missing required column(s): ${missing.join(", ")}. Download the sample CSV to see the expected headers.`);
        setInvoiceRows([]);
        return;
      }
      const rows: InvoiceDraftRow[] = body.map((r, i) => {
        const get = (f: InvoiceField) => (map[f] !== undefined ? (r[map[f]!] ?? "").trim() : "");
        return {
          id: `${Date.now()}-${i}`,
          invoice_no: get("invoice_no"),
          invoice_date: get("invoice_date"),
          customer_code: get("customer_code"),
          due_date: get("due_date"),
          description: get("description"),
          subtotal: get("subtotal"),
          tax_amount: get("tax_amount"),
          notes: get("notes"),
        };
      });
      setInvoiceRows(rows);
    }
  }

  function updateCustomerCell(id: string, field: CustomerField, value: string) {
    setCustomerRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function removeCustomerRow(id: string) {
    setCustomerRows((rows) => rows.filter((r) => r.id !== id));
  }
  function updateInvoiceCell(id: string, field: InvoiceField, value: string) {
    setInvoiceRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function removeInvoiceRow(id: string) {
    setInvoiceRows((rows) => rows.filter((r) => r.id !== id));
  }

  const validatedCustomers: ValidatedCustomerRow[] = useMemo(() => {
    const seen = new Set<string>();
    return customerRows.map((row) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const code = row.code.trim();
      const name = row.name.trim();
      if (!code) errors.push("Missing code");
      if (!name) errors.push("Missing name");
      if (code && existingCustomerCodes.has(code.toLowerCase())) errors.push("Code already exists");
      if (code && seen.has(code.toLowerCase())) errors.push("Duplicate in file");
      if (code) seen.add(code.toLowerCase());
      if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) warnings.push("Email looks invalid");
      if (row.credit_limit && Number.isNaN(Number(row.credit_limit))) warnings.push("Credit limit not a number — will use 0");
      if (row.credit_days && Number.isNaN(Number(row.credit_days))) warnings.push("Credit days not a number — will use 0");
      if (row.opening_balance && Number.isNaN(Number(row.opening_balance))) warnings.push("Opening balance not a number — will use 0");
      return { ...row, errors, warnings, ok: errors.length === 0 };
    });
  }, [customerRows, existingCustomerCodes]);

  const validatedInvoices: ValidatedInvoiceRow[] = useMemo(() => {
    const seen = new Set<string>();
    return invoiceRows.map((row) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const invoiceNo = row.invoice_no.trim();
      if (!invoiceNo) errors.push("Missing invoice number");
      if (invoiceNo && existingInvoiceNos.has(invoiceNo.toLowerCase())) errors.push("Invoice number already exists");
      if (invoiceNo && seen.has(invoiceNo.toLowerCase())) errors.push("Duplicate in file");
      if (invoiceNo) seen.add(invoiceNo.toLowerCase());

      const customerCode = row.customer_code.trim();
      const resolvedCustomer = customerCode ? customersByCode.get(customerCode.toLowerCase()) : undefined;
      if (!customerCode) errors.push("Missing customer code");
      else if (!resolvedCustomer) errors.push(`Unknown customer code "${customerCode}"`);

      const normalizedInvoiceDate = normalizeDate(row.invoice_date) ?? undefined;
      if (!row.invoice_date.trim()) errors.push("Missing invoice date");
      else if (!normalizedInvoiceDate) errors.push("Invoice date not recognised (use YYYY-MM-DD)");

      let normalizedDueDate: string | undefined;
      if (row.due_date.trim()) {
        normalizedDueDate = normalizeDate(row.due_date) ?? undefined;
        if (!normalizedDueDate) errors.push("Due date not recognised (use YYYY-MM-DD)");
      } else if (normalizedInvoiceDate && resolvedCustomer) {
        normalizedDueDate = addDays(normalizedInvoiceDate, resolvedCustomer.credit_days);
        warnings.push(`Due date auto-filled from ${resolvedCustomer.credit_days} credit days`);
      }

      const parsedSubtotal = parseFloat(row.subtotal);
      if (!row.subtotal.trim() || Number.isNaN(parsedSubtotal) || parsedSubtotal <= 0) {
        errors.push("Subtotal must be a positive number");
      }
      let parsedTax = 0;
      if (row.tax_amount.trim()) {
        parsedTax = parseFloat(row.tax_amount);
        if (Number.isNaN(parsedTax) || parsedTax < 0) {
          warnings.push("Tax amount not a number — will use 0");
          parsedTax = 0;
        }
      }

      const total = (Number.isNaN(parsedSubtotal) ? 0 : parsedSubtotal) + parsedTax;

      return {
        ...row,
        errors,
        warnings,
        ok: errors.length === 0,
        resolvedCustomer,
        normalizedInvoiceDate,
        normalizedDueDate,
        parsedSubtotal: Number.isNaN(parsedSubtotal) ? 0 : parsedSubtotal,
        parsedTax,
        total,
      };
    });
  }, [invoiceRows, existingInvoiceNos, customersByCode]);

  const rows = kind === "customers" ? validatedCustomers : validatedInvoices;
  const okCount = rows.filter((r) => r.ok).length;
  const errCount = rows.length - okCount;

  async function handleImport() {
    if (!supabase) return;
    setImporting(true);
    setResult(null);
    try {
      if (kind === "customers") {
        const payload = validatedCustomers
          .filter((r) => r.ok)
          .map((r) => ({
            code: r.code.trim(),
            name: r.name.trim(),
            gstin: r.gstin.trim() || null,
            pan: r.pan.trim() || null,
            contact_person: r.contact_person.trim() || null,
            email: r.email.trim() || null,
            phone: r.phone.trim() || null,
            address: r.address.trim() || null,
            credit_limit: Number(r.credit_limit) || 0,
            credit_days: Number(r.credit_days) || 0,
            opening_balance: Number(r.opening_balance) || 0,
          }));
        if (payload.length === 0) {
          setResult({ count: 0, skipped: rows.length, error: "No valid rows to import." });
          return;
        }
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw new Error(error.message);
        setResult({ count: payload.length, skipped: rows.length - payload.length });
        setInvoiceRows([]);
        setCustomerRows([]);
        setFileName("");
        await loadReferenceData();
      } else {
        const okRows = validatedInvoices.filter((r) => r.ok && r.resolvedCustomer && r.normalizedInvoiceDate && r.normalizedDueDate);
        if (okRows.length === 0) {
          setResult({ count: 0, skipped: rows.length, error: "No valid rows to import." });
          return;
        }
        const invoicePayload = okRows.map((r) => ({
          invoice_no: r.invoice_no.trim(),
          invoice_date: r.normalizedInvoiceDate!,
          customer_id: r.resolvedCustomer!.id,
          due_date: r.normalizedDueDate!,
          subtotal: r.parsedSubtotal,
          tax_amount: r.parsedTax,
          total: r.total,
          status: "open",
          notes: r.notes.trim() || null,
        }));
        const { data: inserted, error } = await supabase.from("invoices").insert(invoicePayload).select();
        if (error) throw new Error(error.message);

        const idByInvoiceNo = new Map((inserted ?? []).map((inv) => [inv.invoice_no, inv.id as string]));
        const itemPayload = okRows
          .map((r) => {
            const invoiceId = idByInvoiceNo.get(r.invoice_no.trim());
            if (!invoiceId) return null;
            return {
              invoice_id: invoiceId,
              description: r.description.trim() || "Imported invoice",
              qty: 1,
              rate: r.parsedSubtotal,
              amount: r.parsedSubtotal,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        if (itemPayload.length > 0) {
          const { error: itemErr } = await supabase.from("invoice_items").insert(itemPayload);
          if (itemErr) throw new Error(itemErr.message);
        }

        setResult({ count: okRows.length, skipped: rows.length - okRows.length });
        setInvoiceRows([]);
        setCustomerRows([]);
        setFileName("");
        await loadReferenceData();
      }
    } catch (err) {
      setResult({ count: 0, skipped: 0, error: err instanceof Error ? err.message : "Import failed. Try again." });
    } finally {
      setImporting(false);
    }
  }

  function downloadSample() {
    if (kind === "customers") {
      downloadCsv("sample-customers.csv", [
        ["code", "name", "gstin", "pan", "contact_person", "email", "phone", "address", "credit_limit", "credit_days", "opening_balance"],
        ["CUST-SAMPLE-1", "Sample Trading Co", "", "", "Rahul Mehta", "rahul@sampletrading.in", "+91 90000 00001", "Pune", "200000", "30", "0"],
        ["CUST-SAMPLE-2", "Blue Horizon Traders", "", "", "Sana Iyer", "sana@bluehorizon.in", "+91 90000 00002", "Mumbai", "150000", "15", "5000"],
      ]);
    } else {
      const c1 = customers[0]?.code ?? "CUST001";
      const c2 = customers[1]?.code ?? "CUST002";
      const today = new Date().toISOString().slice(0, 10);
      const stamp = Date.now();
      downloadCsv("sample-invoices.csv", [
        ["invoice_no", "invoice_date", "customer_code", "due_date", "description", "subtotal", "tax_amount", "notes"],
        [`INV-SAMPLE-${stamp}-1`, today, c1, "", "Consulting services", "25000", "4500", ""],
        [`INV-SAMPLE-${stamp}-2`, today, c2, "", "Software licence", "18000", "3240", "Annual renewal"],
      ]);
    }
  }

  const customerColumns: Column<ValidatedCustomerRow>[] = [
    {
      key: "code",
      header: "Code",
      render: (r) => (
        <input className={`${inputClass} w-28 py-1`} value={r.code} onChange={(e) => updateCustomerCell(r.id, "code", e.target.value)} />
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <input className={`${inputClass} w-40 py-1`} value={r.name} onChange={(e) => updateCustomerCell(r.id, "name", e.target.value)} />
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (r) => (
        <input className={`${inputClass} w-44 py-1`} value={r.email} onChange={(e) => updateCustomerCell(r.id, "email", e.target.value)} />
      ),
    },
    {
      key: "credit_days",
      header: "Credit Days",
      render: (r) => (
        <input className={`${inputClass} w-20 py-1`} value={r.credit_days} onChange={(e) => updateCustomerCell(r.id, "credit_days", e.target.value)} />
      ),
    },
    {
      key: "credit_limit",
      header: "Credit Limit",
      render: (r) => (
        <input className={`${inputClass} w-28 py-1`} value={r.credit_limit} onChange={(e) => updateCustomerCell(r.id, "credit_limit", e.target.value)} />
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        r.ok ? (
          <span className="text-xs font-medium text-emerald-600">
            Ready{r.warnings.length > 0 ? ` — ${r.warnings.join("; ")}` : ""}
          </span>
        ) : (
          <span className="text-xs font-medium text-red-600">{r.errors.join("; ")}</span>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <button type="button" onClick={() => removeCustomerRow(r.id)} className="text-xs font-medium text-slate-400 hover:text-red-600">
          Remove
        </button>
      ),
    },
  ];

  const invoiceColumns: Column<ValidatedInvoiceRow>[] = [
    {
      key: "invoice_no",
      header: "Invoice No",
      render: (r) => (
        <input className={`${inputClass} w-32 py-1`} value={r.invoice_no} onChange={(e) => updateInvoiceCell(r.id, "invoice_no", e.target.value)} />
      ),
    },
    {
      key: "invoice_date",
      header: "Date",
      render: (r) => (
        <input className={`${inputClass} w-28 py-1`} value={r.invoice_date} onChange={(e) => updateInvoiceCell(r.id, "invoice_date", e.target.value)} />
      ),
    },
    {
      key: "customer_code",
      header: "Customer Code",
      render: (r) => (
        <input className={`${inputClass} w-28 py-1`} value={r.customer_code} onChange={(e) => updateInvoiceCell(r.id, "customer_code", e.target.value)} />
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      render: (r) => (
        <input
          className={`${inputClass} w-28 py-1`}
          placeholder={r.normalizedDueDate ? `auto: ${r.normalizedDueDate}` : ""}
          value={r.due_date}
          onChange={(e) => updateInvoiceCell(r.id, "due_date", e.target.value)}
        />
      ),
    },
    {
      key: "subtotal",
      header: "Subtotal",
      render: (r) => (
        <input className={`${inputClass} w-24 py-1`} value={r.subtotal} onChange={(e) => updateInvoiceCell(r.id, "subtotal", e.target.value)} />
      ),
    },
    {
      key: "tax_amount",
      header: "Tax",
      render: (r) => (
        <input className={`${inputClass} w-24 py-1`} value={r.tax_amount} onChange={(e) => updateInvoiceCell(r.id, "tax_amount", e.target.value)} />
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        r.ok ? (
          <span className="text-xs font-medium text-emerald-600">
            Ready{r.warnings.length > 0 ? ` — ${r.warnings.join("; ")}` : ""}
          </span>
        ) : (
          <span className="text-xs font-medium text-red-600">{r.errors.join("; ")}</span>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <button type="button" onClick={() => removeInvoiceRow(r.id)} className="text-xs font-medium text-slate-400 hover:text-red-600">
          Remove
        </button>
      ),
    },
  ];

  if (!isConfigured) {
    return (
      <div className="p-6">
        <PageHeader title="Upload Report" subtitle="Bulk-punch invoices or customers from a CSV file." />
        <NotConfigured />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title="Upload Report" subtitle="Bulk-punch invoices or customers from a CSV file — preview it, fix issues, then import." />

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchKind("invoices")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                kind === "invoices" ? "bg-brand text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Invoices
            </button>
            <button
              type="button"
              onClick={() => switchKind("customers")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                kind === "customers" ? "bg-brand text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Customers
            </button>
          </div>
          <button
            type="button"
            onClick={downloadSample}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Download sample CSV
          </button>
        </div>

        <div className="mt-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 transition-colors hover:border-brand hover:bg-blue-50/40">
            <span className="font-medium text-brand">Choose a CSV file</span>
            <span className="text-slate-400">{fileName || "no file selected"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {fileError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fileError}</p>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Preview — {rows.length} row{rows.length !== 1 ? "s" : ""} ({okCount} ready, {errCount} with errors)
            </h3>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || okCount === 0}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {importing ? "Importing…" : `Import ${okCount} ${kind === "customers" ? "customer" : "invoice"}${okCount !== 1 ? "s" : ""}`}
            </button>
          </div>

          {kind === "customers" ? (
            <DataTable columns={customerColumns} rows={validatedCustomers} />
          ) : (
            <DataTable columns={invoiceColumns} rows={validatedInvoices} />
          )}
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            result.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {result.error
            ? result.error
            : `Imported ${result.count} ${kind === "customers" ? "customer" : "invoice"}${result.count !== 1 ? "s" : ""}.${
                result.skipped > 0 ? ` ${result.skipped} row${result.skipped !== 1 ? "s" : ""} skipped.` : ""
              }`}
        </div>
      )}
    </div>
  );
}
