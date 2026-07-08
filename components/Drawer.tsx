import { ReactNode } from "react";

export function Drawer({
  isOpen,
  title,
  subtitle,
  children,
  footer,
  onClose,
  size = "md",
}: {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-96",
    md: "w-[500px]",
    lg: "w-[600px]",
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="animate-overlay fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`animate-drawer fixed right-0 top-0 z-50 flex h-screen max-w-[95vw] flex-col bg-white shadow-2xl ${sizeClasses[size]}`}>
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>}
      </div>
    </>
  );
}
