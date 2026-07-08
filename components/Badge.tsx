import type { ReactNode } from "react";

export function Badge({
  variant = "default",
  size = "md",
  children,
}: {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "asset" | "liability" | "income" | "expense";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const variantClasses: Record<string, string> = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
    asset: "bg-blue-100 text-blue-700",
    liability: "bg-red-100 text-red-700",
    income: "bg-emerald-100 text-emerald-700",
    expense: "bg-amber-100 text-amber-700",
  };

  const sizeClasses: Record<string, string> = {
    sm: "px-2 py-1 text-xs",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${variantClasses[variant]} ${sizeClasses[size]}`}>
      {children}
    </span>
  );
}
