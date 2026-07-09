"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, RotateCcw, Trash2, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { Breadcrumb } from "@/components/ar-templates/Breadcrumb";
import { DarkModeToggle } from "@/components/ar-templates/DarkModeToggle";
import { PlaceholderPanel } from "@/components/ar-templates/PlaceholderPanel";
import { EmailPreview } from "@/components/ar-templates/EmailPreview";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ar-templates/RichTextEditor";
import { DeleteTemplateDialog } from "@/components/ar-templates/DeleteTemplateDialog";
import { TemplateFormSkeleton } from "@/components/ar-templates/Skeleton";
import { useAutosaveDraft, readDraft, clearDraft } from "@/hooks/useAutosaveDraft";
import {
  reminderTemplateSchema,
  type ReminderTemplateFormValues,
} from "@/lib/ar-templates/schema";
import { DEFAULT_BODY_HTML, DEFAULT_SUBJECT } from "@/lib/ar-templates/placeholders";
import * as templatesApi from "@/lib/ar-templates/api";

const DEFAULT_VALUES: ReminderTemplateFormValues = {
  templateName: "",
  status: true,
  subject: DEFAULT_SUBJECT,
  body: DEFAULT_BODY_HTML,
};

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "");
}

export default function ReminderTemplateFormPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push: toast } = useToast();
  const isNew = params.id === "new";
  const draftKey = `ar-template-draft-${params.id}`;

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [focusTarget, setFocusTarget] = useState<"subject" | "body">("body");

  const subjectRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<ReminderTemplateFormValues>({
    resolver: zodResolver(reminderTemplateSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const values = watch();

  // Load existing template (edit mode) or restore a draft (create mode).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isNew) {
        setLoading(true);
        try {
          const record = await templatesApi.getTemplate(params.id);
          if (cancelled) return;
          reset({
            templateName: record.templateName,
            status: record.status,
            subject: record.subject,
            body: record.body,
          });
        } catch (e) {
          if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load template");
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      const draft = readDraft<ReminderTemplateFormValues>(draftKey);
      if (draft && !cancelled) {
        reset(draft);
        toast("Restored your unsaved draft.", "success");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useAutosaveDraft(draftKey, values, isDirty && !loading);

  function insertPlaceholder(placeholder: string) {
    if (focusTarget === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = values.subject.slice(0, start) + placeholder + values.subject.slice(end);
      el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      requestAnimationFrame(() => {
        const pos = start + placeholder.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    } else {
      editorRef.current?.insertPlaceholder(placeholder);
    }
  }

  async function onSubmit(data: ReminderTemplateFormValues) {
    setSaving(true);
    try {
      if (isNew) {
        const created = await templatesApi.createTemplate(data);
        clearDraft(draftKey);
        toast("Template created successfully.", "success");
        router.push(`/ar/templates/${created.id}`);
      } else {
        await templatesApi.updateTemplate(params.id, data);
        clearDraft(draftKey);
        toast("Template saved successfully.", "success");
        reset(data);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save template.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const created = await templatesApi.createTemplate({
        ...values,
        templateName: `${values.templateName || "Untitled"} (Copy)`,
      });
      toast("Template duplicated.", "success");
      router.push(`/ar/templates/${created.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to duplicate template.", "error");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await templatesApi.deleteTemplate(params.id);
      clearDraft(draftKey);
      toast("Template deleted.", "success");
      router.push("/ar/templates");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete template.", "error");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  function handleReset() {
    clearDraft(draftKey);
    reset();
    toast("Changes reset.", "success");
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
        <p className="font-semibold text-red-700 dark:text-red-300">Couldn&apos;t load this template</p>
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{loadError}</p>
        <Button className="mt-4" variant="outline" onClick={() => router.push("/ar/templates")}>
          Back to templates
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "AR Followup", href: "/ar/templates" },
              { label: "Reminder Templates", href: "/ar/templates" },
              { label: isNew ? "New Template" : "Edit Template" },
            ]}
          />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            {isNew ? "New Reminder Template" : "Edit Reminder Template"}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create and personalize the automated email sent to chase overdue invoices.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DarkModeToggle />
          <Button variant="outline" onClick={() => router.push("/ar/templates")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {loading ? (
        <TemplateFormSkeleton />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            {/* 1. Template information */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Template Information
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Template Name
                  </label>
                  <Input {...register("templateName")} placeholder="e.g. Standard Overdue Reminder" />
                  {errors.templateName && (
                    <p className="mt-1 text-xs text-red-600">{errors.templateName.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 sm:justify-end sm:pt-5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {values.status ? "Active" : "Inactive"}
                  </span>
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
              </div>
            </section>

            {/* 2. Email subject */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Email Subject
              </h2>
              <p className="mb-3 text-xs text-slate-400">
                Use placeholders to personalize your email subject.
              </p>
              <Controller
                control={control}
                name="subject"
                render={({ field }) => (
                  <Input
                    {...field}
                    ref={(el) => {
                      field.ref(el);
                      subjectRef.current = el;
                    }}
                    onFocus={() => setFocusTarget("subject")}
                    className="h-12 text-base"
                    placeholder={DEFAULT_SUBJECT}
                  />
                )}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                {errors.subject ? (
                  <span className="text-red-600">{errors.subject.message}</span>
                ) : (
                  <span />
                )}
                <span>{values.subject?.length ?? 0} characters</span>
              </div>
            </section>

            {/* 3. Email body */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Email Body
                </h2>
                <span className="text-xs text-slate-400">
                  {stripHtml(values.body ?? "").length} characters
                </span>
              </div>
              <div onFocus={() => setFocusTarget("body")}>
                <Controller
                  control={control}
                  name="body"
                  render={({ field }) => (
                    <RichTextEditor ref={editorRef} value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
              {errors.body && <p className="mt-1 text-xs text-red-600">{errors.body.message}</p>}
            </section>
          </div>

          {/* Side column: placeholders + preview */}
          <div className="flex flex-col gap-6">
            <PlaceholderPanel onInsert={insertPlaceholder} />

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Live Preview
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand"
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPreview ? "Hide" : "Show"}
              </button>
            </div>
            {showPreview && <EmailPreview subject={values.subject} body={values.body} />}
          </div>
        </form>
      )}

      {/* Sticky action bar */}
      {!loading && (
        <div className="sticky bottom-0 left-0 right-0 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset changes
            </Button>
            {!isNew && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={handleDuplicate} disabled={duplicating}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {duplicating ? "Duplicating…" : "Duplicate"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/ar/templates")}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      <DeleteTemplateDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
