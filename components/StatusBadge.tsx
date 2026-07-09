import type { InvoiceStatus } from "@/lib/types";

/*
  Shared status pill for invoices. Overdue is always red — reuse this
  wherever an invoice status is shown (list, view, print) instead of
  re-picking colours per screen.
*/
const STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
  open: "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200",
  partial: "bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200",
  paid: "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  overdue: "bg-red-100 text-red-700 ring-1 ring-inset ring-red-200",
  void: "bg-slate-600 text-white ring-1 ring-inset ring-slate-700",
};

const DOT: Record<InvoiceStatus, string> = {
  draft: "bg-slate-400",
  open: "bg-blue-500",
  partial: "bg-orange-500",
  paid: "bg-emerald-500",
  overdue: "bg-red-500",
  void: "bg-slate-300",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {status}
    </span>
  );
}
