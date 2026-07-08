"use client";

import { useCallback, useState } from "react";

/*
  Lightweight toast notifications. Self-contained: <Toaster/> renders its own
  fixed stack, so any screen can drop it in without touching the app shell.

    const toast = useToast();
    toast.success("Saved");
    ...
    <Toaster toasts={toast.toasts} onDismiss={toast.dismiss} />
*/

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

let seq = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++seq;
      setToasts((t) => [...t, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );

  return {
    toasts,
    dismiss,
    success: (m: string) => push("success", m),
    error: (m: string) => push("error", m),
    info: (m: string) => push("info", m),
  };
}

const TONE_STYLES: Record<ToastTone, { ring: string; icon: string; iconPath: string }> = {
  success: {
    ring: "ring-emerald-500/20",
    icon: "text-emerald-600 bg-emerald-50",
    iconPath: "M5 13l4 4L19 7",
  },
  error: {
    ring: "ring-red-500/20",
    icon: "text-red-600 bg-red-50",
    iconPath: "M6 18L18 6M6 6l12 12",
  },
  info: {
    ring: "ring-blue-500/20",
    icon: "text-blue-600 bg-blue-50",
    iconPath: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((t) => {
        const s = TONE_STYLES[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 dark:bg-slate-800 ${s.ring} animate-[toastIn_.25s_ease-out]`}
          >
            <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full ${s.icon}`}>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={s.iconPath} />
              </svg>
            </span>
            <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              className="flex-none rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
