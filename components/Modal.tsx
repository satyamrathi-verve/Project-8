import { ReactNode } from "react";

export function Modal({
  isOpen,
  title,
  description,
  children,
  footer,
  size = "lg",
  icon,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Custom footer (e.g. confirm/cancel). When provided, the default Close button is hidden. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Optional icon badge shown beside the title (e.g. a warning glyph). */
  icon?: ReactNode;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" } as const;

  return (
    <div className="animate-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className={`animate-pop w-full ${sizes[size]} overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900`}>
        <div className="flex items-start gap-4 px-6 pt-6">
          {icon}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
        </div>
        {children && <div className="px-6 pt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/50">
          {footer ?? (
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
