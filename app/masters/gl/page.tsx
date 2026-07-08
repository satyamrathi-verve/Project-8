"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { GLAccount } from "@/lib/types";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { FormField } from "@/components/FormField";

export default function GLMasterPage() {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "asset" as const,
    parent_group: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gl_accounts")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.error("Error fetching GL accounts:", error);
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase.from("gl_accounts").insert([
      {
        code: formData.code,
        name: formData.name,
        type: formData.type,
        parent_group: formData.parent_group || null,
      },
    ]);

    if (error) {
      console.error("Error saving GL account:", error);
    } else {
      setFormData({ code: "", name: "", type: "asset", parent_group: "" });
      setShowForm(false);
      await fetchAccounts();
    }
    setSaving(false);
  };

  const columns: Column<GLAccount>[] = [
    { key: "code", header: "Code", className: "w-20" },
    { key: "name", header: "Name" },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <span className="inline-block rounded bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">
          {row.type}
        </span>
      ),
    },
    { key: "parent_group", header: "Parent Group", render: (row) => row.parent_group || "—" },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="GL Accounts"
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Add Account
          </button>
        }
      />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="e.g., 1000"
              required
            />
            <FormField
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Cash"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <FormField
              label="Parent Group"
              value={formData.parent_group}
              onChange={(e) => setFormData({ ...formData, parent_group: e.target.value })}
              placeholder="Optional"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center text-slate-400 py-10">Loading…</div>
      ) : (
        <DataTable<GLAccount>
          columns={columns}
          rows={accounts}
          empty="No GL accounts yet. Create one to get started."
        />
      )}
    </div>
  );
}
