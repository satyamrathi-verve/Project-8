/*
  Shared money/date formatting so every invoice screen (list, view, form,
  print) prints the same ₹ style — two decimals, Indian digit grouping.
*/

export function formatCurrency(amount: number): string {
  return `₹${(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const TAX_RATE_OPTIONS = [0, 5, 12, 18, 28] as const;

/*
  Read-only screens (view, print) need the Discount and Shipping breakdown
  for an invoice without recomputing the punch/edit form's live state.
  invoices.calc_meta carries the exact settings used when it was saved;
  invoices saved before that column existed have `{}` there, so this falls
  back to deriving discount from the identity subtotal + tax - total = 0
  (shipping unknowable for those, so it's reported as 0).
*/
import type { Invoice } from "@/lib/types";

export function deriveDiscountAndShipping(invoice: Invoice): { discount: number; shipping: number } {
  const meta = invoice.calc_meta ?? {};
  if (meta.discountValue !== undefined) {
    const discount =
      meta.discountType === "fixed" ? meta.discountValue : (invoice.subtotal * meta.discountValue) / 100;
    return {
      discount: Math.min(Math.max(discount, 0), invoice.subtotal),
      shipping: Math.max(meta.shippingCharges ?? 0, 0),
    };
  }
  return {
    discount: Math.max(invoice.subtotal + invoice.tax_amount - invoice.total, 0),
    shipping: 0,
  };
}
