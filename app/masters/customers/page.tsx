"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Customer } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";

const EMPTY_FORM = {
  code: "",
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  credit_days: "30",
  credit_limit: "0",
};

export default function CustomerMasterPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadCustomers() {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else setCustomers(data as Customer[]);
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      code: customer.code,
      name: customer.name,
      contact_person: customer.contact_person ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      credit_days: String(customer.credit_days ?? 30),
      credit_limit: String(customer.credit_limit ?? 0),
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Code and name are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      credit_days: Number(form.credit_days) || 0,
      credit_limit: Number(form.credit_limit) || 0,
    };

    const { error } = editingId
      ? await supabase.from("customers").update(payload).eq("id", editingId)
      : await supabase.from("customers").insert(payload);

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setShowForm(false);
    await loadCustomers();
  }

  const columns: Column<Customer>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "contact_person", header: "Contact" },
    { key: "credit_days", header: "Credit Days" },
    {
      key: "credit_limit",
      header: "Credit Limit",
      render: (c) => `₹${Number(c.credit_limit).toLocaleString("en-IN")}`,
    },
    {
      key: "edit",
      header: "",
      render: (c) => (
        <button
          onClick={() => openEditForm(c)}
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
        title="Customer Master"
        subtitle="Every customer your team bills. Add one or edit an existing entry."
        action={
          isConfigured && (
            <button
              onClick={openAddForm}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              Add Customer
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
          className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2"
        >
          <h3 className="col-span-full text-sm font-semibold uppercase tracking-wide text-slate-500">
            {editingId ? "Edit customer" : "New customer"}
          </h3>

          <FormField label="Code">
            <input
              className={inputClass}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </FormField>

          <FormField label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>

          <FormField label="Contact Person">
            <input
              className={inputClass}
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            />
          </FormField>

          <FormField label="Email">
            <input
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </FormField>

          <FormField label="Phone">
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </FormField>

          <FormField label="Credit Days">
            <input
              type="number"
              className={inputClass}
              value={form.credit_days}
              onChange={(e) => setForm({ ...form, credit_days: e.target.value })}
            />
          </FormField>

          <FormField label="Credit Limit">
            <input
              type="number"
              className={inputClass}
              value={form.credit_limit}
              onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
            />
          </FormField>

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
          rows={loading ? [] : customers}
          empty={loading ? "Loading customers…" : "No customers yet."}
        />
      )}
    </div>
  );
}
