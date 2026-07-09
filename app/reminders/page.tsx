"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Customer, Invoice, ReminderTemplate } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";
import { Badge } from "@/components/Badge";

const AUTO_SEND_KEY = "ar-manager-auto-reminder-enabled";
const AUTO_SEND_LAST_RUN_KEY = "ar-manager-auto-reminder-last-run";

type OverdueRow = {
  id: string;
  invoice: Invoice;
  customer: Customer | null;
  outstanding: number;
  daysOverdue: number;
  lastSentAt: string | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fillTemplate(
  text: string,
  vars: { customer: string; invoice_no: string; amount: string; days_overdue: string }
) {
  return text
    .replaceAll("{customer}", vars.customer)
    .replaceAll("{invoice_no}", vars.invoice_no)
    .replaceAll("{amount}", vars.amount)
    .replaceAll("{days_overdue}", vars.days_overdue);
}

const EMPTY_FORM = {
  name: "",
  subject: "Payment reminder: invoice {invoice_no}",
  body:
    "Dear {customer},\n\n" +
    "Our records show invoice {invoice_no} for ₹{amount} is now {days_overdue} days overdue. " +
    "We would appreciate payment at your earliest convenience.\n\n" +
    "Warm regards,\nAccounts Team",
};

const PLACEHOLDERS = ["{customer}", "{invoice_no}", "{amount}", "{days_overdue}"];

export default function ReminderTemplatesPage() {
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [overdueRows, setOverdueRows] = useState<OverdueRow[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(true);
  const [overdueError, setOverdueError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [autoSendNotice, setAutoSendNotice] = useState<string | null>(null);

  async function loadTemplates() {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("reminder_templates")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else {
      const list = data as ReminderTemplate[];
      setTemplates(list);
      setSelectedTemplateId((current) => current || list[0]?.id || "");
    }
    setLoading(false);
  }

  async function loadOverdue() {
    if (!supabase) {
      setOverdueLoading(false);
      return;
    }
    setOverdueLoading(true);
    setOverdueError(null);

    const today = todayISO();

    const { data: invoiceData, error: invoiceErr } = await supabase
      .from("invoices")
      .select("*")
      .in("status", ["open", "partial"])
      .lt("due_date", today)
      .order("due_date", { ascending: true });

    if (invoiceErr) {
      setOverdueError(invoiceErr.message);
      setOverdueLoading(false);
      return;
    }

    const invoices = (invoiceData ?? []) as Invoice[];
    const invoiceIds = invoices.map((inv) => inv.id);
    const customerIds = Array.from(new Set(invoices.map((inv) => inv.customer_id)));

    const [customersRes, allocationsRes, logRes] = await Promise.all([
      customerIds.length
        ? supabase.from("customers").select("*").in("id", customerIds)
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length
        ? supabase.from("receipt_allocations").select("invoice_id, amount").in("invoice_id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length
        ? supabase
            .from("reminder_log")
            .select("invoice_id, sent_at")
            .in("invoice_id", invoiceIds)
            .order("sent_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (customersRes.error || allocationsRes.error || logRes.error) {
      setOverdueError(
        customersRes.error?.message || allocationsRes.error?.message || logRes.error?.message || "Failed to load."
      );
      setOverdueLoading(false);
      return;
    }

    const customersById = new Map((customersRes.data as Customer[]).map((c) => [c.id, c]));

    const allocatedByInvoice = new Map<string, number>();
    for (const row of allocationsRes.data as { invoice_id: string; amount: number }[]) {
      allocatedByInvoice.set(row.invoice_id, (allocatedByInvoice.get(row.invoice_id) ?? 0) + row.amount);
    }

    const lastSentByInvoice = new Map<string, string>();
    for (const row of logRes.data as { invoice_id: string | null; sent_at: string }[]) {
      if (row.invoice_id && !lastSentByInvoice.has(row.invoice_id)) {
        lastSentByInvoice.set(row.invoice_id, row.sent_at);
      }
    }

    const rows: OverdueRow[] = invoices.map((inv) => {
      const outstanding = inv.total - (allocatedByInvoice.get(inv.id) ?? 0);
      const daysOverdue = Math.max(
        0,
        Math.floor((Date.parse(today) - Date.parse(inv.due_date)) / 86400000)
      );
      return {
        id: inv.id,
        invoice: inv,
        customer: customersById.get(inv.customer_id) ?? null,
        outstanding,
        daysOverdue,
        lastSentAt: lastSentByInvoice.get(inv.id) ?? null,
      };
    });

    setOverdueRows(rows);
    setOverdueLoading(false);
    return rows;
  }

  useEffect(() => {
    loadTemplates();
    loadOverdue();
    setAutoSendEnabled(localStorage.getItem(AUTO_SEND_KEY) === "true");
  }, []);

  function toggleAutoSend(next: boolean) {
    setAutoSendEnabled(next);
    localStorage.setItem(AUTO_SEND_KEY, String(next));
  }

  async function sendReminder(row: OverdueRow, template: ReminderTemplate) {
    if (!supabase || !row.customer) return;

    const vars = {
      customer: row.customer.name,
      invoice_no: row.invoice.invoice_no,
      amount: row.outstanding.toLocaleString("en-IN"),
      days_overdue: String(row.daysOverdue),
    };

    await supabase.from("reminder_log").insert({
      invoice_id: row.invoice.id,
      to_email: row.customer.email,
      subject: fillTemplate(template.subject, vars),
      body: fillTemplate(template.body, vars),
      status: "sent",
      sent_at: new Date().toISOString(),
    });
  }

  async function handleSendOne(row: OverdueRow) {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    setSendingId(row.invoice.id);
    await sendReminder(row, template);
    await loadOverdue();
    setSendingId(null);
  }

  async function handleSendAll(rows: OverdueRow[]) {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template || rows.length === 0) return;
    setSendingAll(true);
    for (const row of rows) {
      if (row.customer?.email) await sendReminder(row, template);
    }
    await loadOverdue();
    setSendingAll(false);
  }

  // Simulated monthly auto-send: this is a front-end-only demo (no backend
  // scheduler), so we check on page load whether it's the 1st of the month
  // and this browser hasn't already run it this month.
  useEffect(() => {
    if (!autoSendEnabled || overdueLoading || loading) return;
    const now = new Date();
    if (now.getDate() !== 1) return;
    const monthKey = now.toISOString().slice(0, 7);
    if (localStorage.getItem(AUTO_SEND_LAST_RUN_KEY) === monthKey) return;

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    (async () => {
      await handleSendAll(overdueRows);
      localStorage.setItem(AUTO_SEND_LAST_RUN_KEY, monthKey);
      setAutoSendNotice(`Auto-sent reminders to ${overdueRows.length} overdue customer(s) today.`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendEnabled, overdueLoading, loading, templates, selectedTemplateId]);

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(t: ReminderTemplate) {
    setEditingId(t.id);
    setForm({ name: t.name, subject: t.subject, body: t.body });
    setFormError(null);
    setShowForm(true);
  }

  function insertPlaceholder(placeholder: string) {
    const el = bodyRef.current;
    if (!el) {
      setForm((f) => ({ ...f, body: f.body + placeholder }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = form.body.slice(0, start) + placeholder + form.body.slice(end);
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + placeholder.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setFormError("Name, subject and body are all required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      subject: form.subject.trim(),
      body: form.body,
    };

    const { error } = editingId
      ? await supabase.from("reminder_templates").update(payload).eq("id", editingId)
      : await supabase.from("reminder_templates").insert(payload);

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setShowForm(false);
    await loadTemplates();
  }

  const columns: Column<ReminderTemplate>[] = [
    { key: "name", header: "Template Name" },
    {
      key: "subject",
      header: "Subject",
      render: (t) => <span className="text-slate-500">{t.subject}</span>,
    },
    {
      key: "edit",
      header: "",
      render: (t) => (
        <button
          onClick={() => openEditForm(t)}
          className="text-sm font-medium text-brand hover:text-brand-dark"
        >
          Edit
        </button>
      ),
    },
  ];

  const overdueColumns: Column<OverdueRow>[] = [
    { key: "invoice_no", header: "Invoice No", render: (r) => r.invoice.invoice_no },
    { key: "customer", header: "Customer", render: (r) => r.customer?.name ?? "—" },
    { key: "due_date", header: "Due Date", render: (r) => r.invoice.due_date },
    {
      key: "days_overdue",
      header: "Days Overdue",
      render: (r) => <Badge variant="danger">{r.daysOverdue}d</Badge>,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      render: (r) => `₹${r.outstanding.toLocaleString("en-IN")}`,
    },
    {
      key: "last_sent",
      header: "Last Followup Sent",
      render: (r) =>
        r.lastSentAt ? (
          new Date(r.lastSentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        ) : (
          <span className="text-slate-400">Never</span>
        ),
    },
    {
      key: "action",
      header: "",
      render: (r) => (
        <button
          onClick={() => handleSendOne(r)}
          disabled={!r.customer?.email || sendingId === r.invoice.id || sendingAll}
          className="text-sm font-medium text-brand hover:text-brand-dark disabled:opacity-40"
        >
          {sendingId === r.invoice.id ? "Sending…" : "Send"}
        </button>
      ),
    },
  ];

  return (
    <div className="p-8">
      <PageHeader
        title="AR Followup — Reminder Template"
        subtitle="The chaser email you send overdue customers. Save it once, use it for every reminder."
        action={
          isConfigured && (
            <button
              onClick={openAddForm}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              New Template
            </button>
          )
        }
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      {isConfigured && showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-6 lg:grid-cols-3"
        >
          <h3 className="col-span-full text-sm font-semibold uppercase tracking-wide text-slate-500">
            {editingId ? "Edit template" : "New template"}
          </h3>

          <div className="flex flex-col gap-4 lg:col-span-2">
            <FormField label="Template Name">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>

            <FormField label="Subject">
              <input
                className={inputClass}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </FormField>

            <FormField label="Body">
              <textarea
                ref={bodyRef}
                className={`${inputClass} min-h-[220px] resize-y font-mono text-xs`}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </FormField>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Placeholders
            </p>
            <p className="text-xs text-slate-500">
              Click to insert into the body at your cursor.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertPlaceholder(p)}
                  className="rounded-full border border-brand/30 bg-white px-3 py-1 text-xs font-medium text-brand hover:bg-brand/10"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <p className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="col-span-full flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isConfigured && error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {isConfigured && (
        <DataTable
          columns={columns}
          rows={loading ? [] : templates}
          empty={loading ? "Loading templates…" : "No reminder templates yet."}
        />
      )}

      {isConfigured && (
        <div className="mt-10">
          <PageHeader
            title="Overdue Invoices"
            subtitle="Every unpaid invoice past its due date, and when it was last chased."
          />

          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <FormField label="Send using template">
              <select
                className={inputClass}
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {templates.length === 0 && <option value="">No templates yet</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={autoSendEnabled}
                onChange={(e) => toggleAutoSend(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              Auto-send this template to every overdue customer on the 1st of each month
            </label>

            <button
              onClick={() => handleSendAll(overdueRows)}
              disabled={sendingAll || overdueRows.length === 0 || !selectedTemplateId}
              className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {sendingAll ? "Sending…" : "Send to All Overdue Now"}
            </button>
          </div>

          {autoSendNotice && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {autoSendNotice}
            </p>
          )}

          {overdueError && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{overdueError}</p>
          )}

          <DataTable
            columns={overdueColumns}
            rows={overdueLoading ? [] : overdueRows}
            empty={overdueLoading ? "Loading overdue invoices…" : "No overdue invoices right now."}
          />
        </div>
      )}
    </div>
  );
}
