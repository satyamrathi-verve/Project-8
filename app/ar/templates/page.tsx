"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Breadcrumb } from "@/components/ar-templates/Breadcrumb";
import { DarkModeToggle } from "@/components/ar-templates/DarkModeToggle";
import { DeleteTemplateDialog } from "@/components/ar-templates/DeleteTemplateDialog";
import { Skeleton } from "@/components/ar-templates/Skeleton";
import type { ReminderTemplateRecord } from "@/lib/ar-templates/types";
import * as templatesApi from "@/lib/ar-templates/api";

export default function ReminderTemplatesListPage() {
  const router = useRouter();
  const { push: toast } = useToast();

  const [templates, setTemplates] = useState<ReminderTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await templatesApi.listTemplates());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.templateName.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q)
    );
  }, [templates, query]);

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await templatesApi.deleteTemplate(pendingDeleteId);
      toast("Template deleted.", "success");
      setTemplates((t) => t.filter((x) => x.id !== pendingDeleteId));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete template.", "error");
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: "AR Followup" }, { label: "Reminder Templates" }]} />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            AR Followup — Reminder Templates
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            The chaser emails your team sends to overdue customers.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DarkModeToggle />
          <Button onClick={() => router.push("/ar/templates/new")}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Template
          </Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          className="pl-8"
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Mail className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 font-medium text-slate-600 dark:text-slate-300">
            {query ? "No templates match your search." : "No reminder templates yet."}
          </p>
          {!query && (
            <Button className="mt-4" onClick={() => router.push("/ar/templates/new")}>
              Create your first template
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-800">
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Subject</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    <Link href={`/ar/templates/${t.id}`} className="hover:text-brand hover:underline">
                      {t.templateName}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-500 dark:text-slate-400">
                    {t.subject}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        t.status
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      }
                    >
                      {t.status ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/ar/templates/${t.id}`}
                        className="text-slate-400 hover:text-brand"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => setPendingDeleteId(t.id)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DeleteTemplateDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        onConfirm={confirmDelete}
        deleting={deleting}
      />
    </div>
  );
}
