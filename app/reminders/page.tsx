"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { ReminderTemplate } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";

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
    else setTemplates(data as ReminderTemplate[]);
    setLoading(false);
  }

  useEffect(() => {
    loadTemplates();
  }, []);

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
    </div>
  );
}
