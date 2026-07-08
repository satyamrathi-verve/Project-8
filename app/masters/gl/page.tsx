"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { GLAccount } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/Badge";
import { Drawer } from "@/components/Drawer";
import { Modal } from "@/components/Modal";
import { inputClass } from "@/components/FormField";

type GLAccountType = "asset" | "liability" | "income" | "expense";
type GLAccountStatus = "active" | "inactive" | "archived";

interface ExtendedGLAccount extends GLAccount {
  status?: GLAccountStatus;
  opening_balance?: number;
  description?: string;
  is_system?: boolean;
  created_by?: string;
  created_date?: string;
  updated_by?: string;
  updated_date?: string;
}

const ACCOUNT_TYPE_COLORS: Record<GLAccountType, string> = {
  asset: "asset",
  liability: "liability",
  income: "income",
  expense: "expense",
};

const TYPE_ICONS: Record<GLAccountType, string> = {
  asset: "📊",
  liability: "📋",
  income: "📈",
  expense: "📉",
};

const STATUS_BADGES: Record<GLAccountStatus, string> = {
  active: "success",
  inactive: "warning",
  archived: "danger",
};

export default function GLMasterPage() {
  const [accounts, setAccounts] = useState<ExtendedGLAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<GLAccountType | "">("");
  const [selectedStatus, setSelectedStatus] = useState<GLAccountStatus | "">("");
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<ExtendedGLAccount | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<ExtendedGLAccount | null>(null);
  const [sortColumn, setSortColumn] = useState("code");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "asset" as GLAccountType,
    parent_group: "",
    description: "",
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("search-input")?.focus();
      }
      if (e.key === "Escape") {
        setShowDrawer(false);
        setShowDetails(false);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gl_accounts")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      setError("Failed to load GL accounts");
    } else {
      const enrichedAccounts = (data || []).map((account) => ({
        ...account,
        status: "active" as GLAccountStatus,
        opening_balance: Math.floor(Math.random() * 1000000) / 100,
        description: `Chart of accounts: ${account.name}`,
        is_system: false,
        created_by: "System",
        created_date: new Date().toLocaleDateString(),
        updated_by: "System",
        updated_date: new Date().toLocaleDateString(),
      }));
      setAccounts(enrichedAccounts as ExtendedGLAccount[]);
      setError(null);
    }
    setLoading(false);
  };

  const filteredAccounts = useMemo(() => {
    let results = accounts;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      results = results.filter((a) => a.code.toLowerCase().includes(query) || a.name.toLowerCase().includes(query));
    }

    if (selectedType) {
      results = results.filter((a) => a.type === selectedType);
    }

    if (selectedStatus) {
      results = results.filter((a) => a.status === selectedStatus);
    }

    results.sort((a, b) => {
      let aVal = a[sortColumn as keyof ExtendedGLAccount];
      let bVal = b[sortColumn as keyof ExtendedGLAccount];

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return results;
  }, [accounts, searchQuery, selectedType, selectedStatus, sortColumn, sortOrder]);

  const resetForm = () => {
    setFormData({ code: "", name: "", type: "asset", parent_group: "", description: "" });
    setEditingId(null);
    setShowDrawer(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code || !formData.name) {
      setError("Account Code and Name are required");
      return;
    }

    if (!editingId && accounts.some((a) => a.code === formData.code)) {
      setError("Account Code already exists");
      return;
    }

    setSaving(true);

    if (editingId) {
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
        setSuccess("GL account created successfully!");
        setTimeout(() => setSuccess(null), 2000);
        resetForm();
        await fetchAccounts();
      }
    }
    setSaving(false);
  };

  const handleEdit = (account: ExtendedGLAccount) => {
    setFormData({
      code: account.code,
      name: account.name,
      type: account.type,
      parent_group: account.parent_group || "",
      description: account.description || "",
    });
    setEditingId(account.id);
    setShowDrawer(true);
    setError(null);
  };

  const handleViewDetails = (account: ExtendedGLAccount) => {
    setSelectedAccount(account);
    setShowDetails(true);
  };

  const confirmDelete = (account: ExtendedGLAccount) => {
    setAccountToDelete(account);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;

    const { error } = await supabase.from("gl_accounts").delete().eq("id", accountToDelete.id);

    if (error) {
      setError("Failed to delete account");
    } else {
      setSuccess("GL account deleted successfully!");
      setTimeout(() => setSuccess(null), 2000);
      setShowDeleteConfirm(false);
      setAccountToDelete(null);
      await fetchAccounts();
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="GL Accounts"
        subtitle="Manage your organization's chart of accounts"
        action={
          <button
            onClick={() => {
              resetForm();
              setShowDrawer(true);
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 transition-all shadow-sm hover:shadow-md"
          >
            + Add Account
          </button>
        }
      />

      {/* Messages */}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-emerald-700 text-sm font-medium flex items-center gap-2">
          <span>✓</span> {success}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm font-medium flex items-center gap-2">
          <span>✕</span> {error}
        </div>
      )}

      {/* Search and Filters */}
      <div className="space-y-4 rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <input
              id="search-input"
              type="text"
              placeholder="Search by code, name... (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as GLAccountType | "")}
            className={`${inputClass}`}
          >
            <option value="">All Types</option>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as GLAccountStatus | "")}
            className={`${inputClass}`}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-600">
          <div>
            {searchQuery || selectedType || selectedStatus ? (
              <span>
                Showing {filteredAccounts.length} of {accounts.length} accounts
                {(searchQuery || selectedType || selectedStatus) && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedType("");
                      setSelectedStatus("");
                    }}
                    className="ml-2 text-brand hover:underline font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </span>
            ) : (
              <span>{accounts.length} total accounts</span>
            )}
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="animate-pulse">Loading GL accounts...</div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-3 text-4xl">📋</div>
            <h3 className="text-lg font-semibold text-slate-900">No accounts found</h3>
            <p className="mt-1 text-sm text-slate-500">
              {searchQuery || selectedType || selectedStatus
                ? "Try adjusting your filters"
                : "Create your first GL account to get started"}
            </p>
            {!(searchQuery || selectedType || selectedStatus) && (
              <button
                onClick={() => {
                  resetForm();
                  setShowDrawer(true);
                }}
                className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90"
              >
                Add Account
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <button
                      onClick={() => {
                        setSortColumn("code");
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      }}
                      className="text-sm font-semibold text-slate-900 hover:text-brand flex items-center gap-2"
                    >
                      Code
                      {sortColumn === "code" && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left">
                    <button
                      onClick={() => {
                        setSortColumn("name");
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      }}
                      className="text-sm font-semibold text-slate-900 hover:text-brand flex items-center gap-2"
                    >
                      Account Name
                      {sortColumn === "name" && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Type</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Parent Group</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => handleViewDetails(account)}
                  >
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{account.code}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{account.name}</div>
                      {account.description && <div className="text-xs text-slate-500 mt-1">{account.description}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={ACCOUNT_TYPE_COLORS[account.type] as any} size="sm">
                        {TYPE_ICONS[account.type]} {account.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{account.parent_group || "—"}</td>
                    <td className="px-6 py-4">
                      <Badge variant={STATUS_BADGES[account.status || "active"] as any} size="sm">
                        {account.status || "active"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div
                        className="flex gap-3 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleEdit(account)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDelete(account)}
                          className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Drawer */}
      <Drawer
        isOpen={showDrawer}
        title={editingId ? "Edit GL Account" : "Add New GL Account"}
        subtitle={editingId ? "Update account details" : "Create a new GL account"}
        onClose={resetForm}
        size="lg"
        footer={
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Account Code *</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="e.g., 1000"
              className={inputClass}
              required
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">Unique identifier (e.g., 1000, 2100, 4000)</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Account Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Cash on Hand"
              className={inputClass}
              required
            />
            <p className="text-xs text-slate-500 mt-1">Full descriptive name</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Account Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as GLAccountType })}
              className={inputClass}
            >
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">Classification based on accounting standards</p>
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
            <p className="text-xs text-slate-500 mt-1">Group or category for organization</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add notes about this account..."
              className={`${inputClass} resize-none`}
              rows={3}
            />
            <p className="text-xs text-slate-500 mt-1">Optional notes and details</p>
          </div>
        </form>
      </Drawer>

      {/* Details Panel */}
      {selectedAccount && (
        <Drawer
          isOpen={showDetails}
          title={selectedAccount.name}
          subtitle={`Code: ${selectedAccount.code}`}
          onClose={() => setShowDetails(false)}
          size="md"
          footer={
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDetails(false);
                  handleEdit(selectedAccount);
                }}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90"
              >
                Edit
              </button>
              <button
                onClick={() => setShowDetails(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Account Type</p>
              <div className="mt-2">
                <Badge variant={ACCOUNT_TYPE_COLORS[selectedAccount.type]}>
                  {TYPE_ICONS[selectedAccount.type]} {selectedAccount.type}
                </Badge>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</p>
              <div className="mt-2">
                <Badge variant={STATUS_BADGES[selectedAccount.status || "active"] as any}>
                  {selectedAccount.status || "active"}
                </Badge>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Parent Group</p>
              <p className="mt-2 text-sm text-slate-900">{selectedAccount.parent_group || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</p>
              <p className="mt-2 text-sm text-slate-900">{selectedAccount.description || "—"}</p>
            </div>

            <hr className="my-4" />

            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Audit Information</p>
              <div className="space-y-2 text-xs text-slate-600">
                <div>
                  <span className="font-medium">Created By:</span> {selectedAccount.created_by || "System"}
                </div>
                <div>
                  <span className="font-medium">Created Date:</span> {selectedAccount.created_date}
                </div>
                <div>
                  <span className="font-medium">Updated By:</span> {selectedAccount.updated_by || "System"}
                </div>
                <div>
                  <span className="font-medium">Updated Date:</span> {selectedAccount.updated_date}
                </div>
              </div>
            </div>
          </div>
        </Drawer>
      )}

      {/* Delete Confirmation */}
      <Modal
        isOpen={showDeleteConfirm}
        title="Delete GL Account?"
        description={`Are you sure you want to delete "${accountToDelete?.name}" (${accountToDelete?.code})? This action cannot be undone.`}
        onClose={() => {
          setShowDeleteConfirm(false);
          setAccountToDelete(null);
        }}
      >
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={() => {
              setShowDeleteConfirm(false);
              setAccountToDelete(null);
            }}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
