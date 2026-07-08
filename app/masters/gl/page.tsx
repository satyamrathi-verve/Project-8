"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { GLAccount } from "@/lib/types";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { inputClass } from "@/components/FormField";

export default function GLMasterPage() {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "asset" as const,
    parent_group: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setError("Failed to load GL accounts");
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({ code: "", name: "", type: "asset", parent_group: "" });
    setEditingId(null);
    setShowForm(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code || !formData.name) {
      setError("Code and Name are required");
      return;
    }

    setSaving(true);

    if (editingId) {
      // Update existing
      const { error } = await supabase
        .from("gl_accounts")
        .update({
          code: formData.code,
          name: formData.name,
          type: formData.type,
          parent_group: formData.parent_group || null,
        })
        .eq("id", editingId);

      if (error) {
        setError(error.message);
      } else {
        setSuccess("GL account updated successfully!");
        setTimeout(() => setSuccess(null), 2000);
        resetForm();
        await fetchAccounts();
      }
    } else {
      // Create new
      const { error } = await supabase.from("gl_accounts").insert([
        {
          code: formData.code,
          name: formData.name,
          type: formData.type,
          parent_group: formData.parent_group || null,
        },
      ]);

      if (error) {
        setError(error.message);
      } else {
        setSuccess("GL account added successfully!");
        setTimeout(() => setSuccess(null), 2000);
        resetForm();
        await fetchAccounts();
      }
    }
    setSaving(false);
  };

  const handleEdit = (account: GLAccount) => {
    setFormData({
      code: account.code,
      name: account.name,
      type: account.type,
      parent_group: account.parent_group || "",
    });
    setEditingId(account.id);
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this GL account?")) {
      const { error } = await supabase.from("gl_accounts").delete().eq("id", id);

      if (error) {
        setError("Failed to delete account");
      } else {
        setSuccess("GL account deleted successfully!");
        setTimeout(() => setSuccess(null), 2000);
        await fetchAccounts();
      }
    }
  };

  const columns: Column<GLAccount>[] = [
    { key: "code", header: "Code", className: "font-semibold text-slate-900 w-20" },
    { key: "name", header: "Name", className: "text-slate-900" },
    {
      key: "type",
      header: "Type",
      className: "w-32",
      render: (row) => {
        const colorMap: Record<string, string> = {
          asset: "bg-blue-100 text-blue-800",
          liability: "bg-red-100 text-red-800",
          income: "bg-green-100 text-green-800",
          expense: "bg-orange-100 text-orange-800",
        };
        return (
          <span className={`inline-block rounded px-2.5 py-1 text-xs font-semibold ${colorMap[row.type]}`}>
            {row.type}
          </span>
        );
      },
    },
    { key: "parent_group", header: "Parent Group", render: (row) => row.parent_group || "—" },
    {
      key: "actions",
      header: "Actions",
      className: "w-24 text-center",
      render: (row) => (
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => handleEdit(row)}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="GL Accounts"
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 transition-all"
          >
            {showForm ? "Cancel" : "+ Add Account"}
          </button>
        }
      />

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-700 text-sm font-medium">
          ✓ {success}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm font-medium">
          ✕ {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingId ? "Edit GL Account" : "Add New GL Account"}
            </h3>
            <p className="text-sm text-slate-500 mt-1">Fill in the details below to {editingId ? "update" : "create"} a GL account</p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Account Code *</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., 1100"
                className={inputClass}
                required
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1">Unique identifier for this account</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Account Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Bank Account"
                className={inputClass}
                required
              />
              <p className="text-xs text-slate-500 mt-1">Full name of the account</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Account Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className={inputClass}
              >
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Classification of the account</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Parent Group</label>
              <input
                type="text"
                value={formData.parent_group}
                onChange={(e) => setFormData({ ...formData, parent_group: e.target.value })}
                placeholder="e.g., Current Assets"
                className={inputClass}
              />
              <p className="text-xs text-slate-500 mt-1">Optional: broader category</p>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
            >
              {saving ? "Saving…" : editingId ? "Update Account" : "Add Account"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-2 text-sm">Loading GL accounts…</div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <DataTable<GLAccount>
            columns={columns}
            rows={accounts}
            empty="No GL accounts yet. Click 'Add Account' to get started."
          />
        </div>
      )}
    </div>
  );
}
