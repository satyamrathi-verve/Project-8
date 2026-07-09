"use client";

import { renderWithSampleData, SAMPLE_DATA } from "@/lib/ar-templates/placeholders";

export function EmailPreview({ subject, body }: { subject: string; body: string }) {
  const previewSubject = renderWithSampleData(subject);
  const previewBody = renderWithSampleData(body);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          To: <span className="text-slate-700 dark:text-slate-200">{SAMPLE_DATA["{customer}"]}</span>
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {previewSubject || <span className="italic text-slate-400">(no subject)</span>}
        </p>
      </div>
      <div
        className="prose prose-sm max-w-none px-5 py-4 dark:prose-invert"
        dangerouslySetInnerHTML={{
          __html: previewBody || '<p class="italic text-slate-400">(empty body)</p>',
        }}
      />
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800 dark:bg-slate-800">
        Preview uses sample data — real emails substitute the actual invoice values.
      </div>
    </div>
  );
}
