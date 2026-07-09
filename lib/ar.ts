import type { Invoice, InvoiceStatus, ReceiptAllocation } from "@/lib/types";

/*
  Small AR calculations shared across screens (Dashboard, Cashflow Projection, and
  later Invoice List / Ageing / Statement). Keep this the single source of truth
  for "outstanding", "overdue", currency formatting, and status styling.
*/

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function outstandingAmount(invoice: Invoice, allocations: ReceiptAllocation[]): number {
  const allocated = allocations
    .filter((a) => a.invoice_id === invoice.id)
    .reduce((sum, a) => sum + a.amount, 0);
  return invoice.total - allocated;
}

export function isOverdue(invoice: Invoice, today = todayStr()): boolean {
  return (invoice.status === "open" || invoice.status === "partial" || invoice.status === "overdue") &&
    invoice.due_date < today;
}

const UNPAID_STATUSES: InvoiceStatus[] = ["open", "partial", "overdue"];

export function isUnpaid(invoice: Invoice): boolean {
  return UNPAID_STATUSES.includes(invoice.status);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function statusStyle(status: InvoiceStatus): { label: string; className: string } {
  switch (status) {
    case "paid":
      return { label: "Paid", className: "bg-emerald-100 text-emerald-700" };
    case "overdue":
      return { label: "Overdue", className: "bg-red-100 text-red-700" };
    case "partial":
      return { label: "Partial", className: "bg-amber-100 text-amber-700" };
    default:
      return { label: "Open", className: "bg-slate-100 text-slate-600" };
  }
}
