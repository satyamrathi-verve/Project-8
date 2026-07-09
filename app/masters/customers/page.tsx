"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Customer } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { DataTable, type Column } from "@/components/DataTable";
import { FormField, inputClass } from "@/components/FormField";

<<<<<<< HEAD
const EMPTY_FORM = {
=======
type CustomerForm = {
  code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  credit_days: string;
  credit_limit: string;
};

const EMPTY_FORM: CustomerForm = {
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
  code: "",
  name: "",
  contact_person: "",
  email: "",
  phone: "",
<<<<<<< HEAD
  credit_days: "30",
=======
  credit_days: "0",
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
  credit_limit: "0",
};

export default function CustomerMasterPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
<<<<<<< HEAD

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
=======
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function loadCustomers() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
<<<<<<< HEAD
    else setCustomers(data as Customer[]);
=======
    else setCustomers(data ?? []);
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
<<<<<<< HEAD
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
=======
    setShowForm(true);
  }

  function openEditForm(c: Customer) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      name: c.name,
      contact_person: c.contact_person ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      credit_days: String(c.credit_days),
      credit_limit: String(c.credit_limit),
    });
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
<<<<<<< HEAD

    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Code and name are required.");
      return;
    }

    setSaving(true);
    setFormError(null);
=======
    setSaving(true);
    setError(null);
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252

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
<<<<<<< HEAD
      setFormError(error.message);
=======
      setError(error.message);
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
      return;
    }

    setShowForm(false);
    await loadCustomers();
  }

  const columns: Column<Customer>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
<<<<<<< HEAD
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
=======
    { key: "contact_person", header: "Contact", render: (c) => c.contact_person || "—" },
    { key: "credit_days", header: "Credit Days", className: "text-right" },
    {
      key: "credit_limit",
      header: "Credit Limit",
      className: "text-right",
      render: (c) =>
        c.credit_limit.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (c) => (
        <button onClick={() => openEditForm(c)} className="font-medium text-brand hover:underline">
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
          Edit
        </button>
      ),
    },
  ];

  return (
<<<<<<< HEAD
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
=======
    <div className="p-6">
      <PageHeader
        title="Customer Master"
        subtitle="The reference list of customers every other screen leans on."
        action={
          isConfigured ? (
            <button
              onClick={openAddForm}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Add Customer
            </button>
          ) : undefined
        }
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <>
          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2 md:grid-cols-3"
            >
              <FormField label="Code">
                <input
                  required
                  className={inputClass}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </FormField>
              <FormField label="Name">
                <input
                  required
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
                  type="email"
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
                  min={0}
                  className={inputClass}
                  value={form.credit_days}
                  onChange={(e) => setForm({ ...form, credit_days: e.target.value })}
                />
              </FormField>
              <FormField label="Credit Limit">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={form.credit_limit}
                  onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                />
              </FormField>

              <div className="flex items-end gap-3 md:col-span-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add customer"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-sm text-slate-500">Loading customers…</p>
          ) : (
            <DataTable columns={columns} rows={customers} empty="No customers yet. Add the first one above." />
          )}
        </>
>>>>>>> 18f878aab18e469e4ff7f534efdc9e6186267252
      )}
    </div>
  );
}
