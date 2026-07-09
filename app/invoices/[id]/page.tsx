"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Customer, Invoice, InvoiceItem } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { StatusBadge } from "@/components/StatusBadge";
import { deriveDiscountAndShipping, formatCurrency, formatDate, formatDateTime } from "@/lib/format";

/*
  Read-only invoice detail (screen 5). Edit and Print jump to the punch/edit
  form (screen 6) and the printable preview (screen 7).

  Discount and Shipping come from invoices.calc_meta (see
  lib/format.ts:deriveDiscountAndShipping) — the exact settings saved by the
  punch/edit form, with a fallback for invoices saved before that column
  existed.

  The Invoice Timeline only shows events we can actually prove happened from
  real rows (invoice created, reminders logged in reminder_log, payments
  logged in receipts/receipt_allocations) — there's no "sent"/"viewed"
  tracking in the schema, so those steps aren't fabricated here.
*/

interface TimelineEvent {
  date: string;
  label: string;
  detail?: string;
}

export default function InvoiceViewPage({ params }: { params: { id: string } }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!supabase) return;
      setLoading(true);

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", params.id)
        .single();

      if (invErr || !inv) {
        setError(invErr?.message ?? "Invoice not found.");
        setLoading(false);
        return;
      }
      setInvoice(inv as Invoice);

      const [{ data: cust }, { data: invItems }, { data: allocations }, { data: reminders }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", inv.customer_id).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", params.id).order("id"),
        supabase
          .from("receipt_allocations")
          .select("amount, receipts(receipt_date, receipt_no)")
          .eq("invoice_id", params.id),
        supabase.from("reminder_log").select("*").eq("invoice_id", params.id).order("sent_at"),
      ]);

      setCustomer((cust as Customer) ?? null);
      setItems((invItems as InvoiceItem[]) ?? []);

      const allocRows = (allocations ?? []) as unknown as {
        amount: number;
        receipts: { receipt_date: string; receipt_no: string } | null;
      }[];
      const allocated = allocRows.reduce((sum, a) => sum + a.amount, 0);
      setOutstanding(inv.total - allocated);

      const events: TimelineEvent[] = [
        { date: inv.created_at, label: "Invoice Created" },
        ...(reminders ?? []).map((r) => ({
          date: r.sent_at,
          label: "Payment Reminder Sent",
          detail: r.to_email ?? undefined,
        })),
        ...allocRows.map((a) => ({
          date: a.receipts?.receipt_date ?? inv.created_at,
          label: "Payment Received",
          detail: `${formatCurrency(a.amount)}${a.receipts?.receipt_no ? ` · ${a.receipts.receipt_no}` : ""}`,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setTimeline(events);

      setLoading(false);
    }
    load();
  }, [params.id]);

  if (!isConfigured) return <NotConfigured />;

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 shadow-sm">
        Loading invoice…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error ?? "Invoice not found."}
      </div>
    );
  }

  const { discount, shipping } = deriveDiscountAndShipping(invoice);
  const taxableAmount = invoice.subtotal - discount + shipping;

  return (
    <>
      <PageHeader
        title={`Invoice ${invoice.invoice_no}`}
        subtitle="Read-only view of this invoice."
        action={
          <div className="flex gap-3">
            <Link
              href={`/invoices/${invoice.id}/print`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Print
            </Link>
            <Link
              href={`/invoices/${invoice.id}/edit`}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Edit
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap justify-between gap-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Customer</p>
                <p className="mt-1 font-medium text-slate-900">{customer?.name ?? "—"}</p>
                {customer?.contact_person && <p className="text-sm text-slate-500">{customer.contact_person}</p>}
                <p className="text-sm text-slate-500">{customer?.address}</p>
                <p className="text-sm text-slate-500">{customer?.email}</p>
                <p className="text-sm text-slate-500">{customer?.phone}</p>
                {customer?.gstin && <p className="text-sm text-slate-500">GSTIN: {customer.gstin}</p>}
                {customer?.pan && <p className="text-sm text-slate-500">PAN: {customer.pan}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                <div className="mt-1">
                  <StatusBadge status={invoice.status} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice Date</p>
                <p className="mt-1 font-medium text-slate-900">{formatDate(invoice.invoice_date)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Due Date</p>
                <p className="mt-1 font-medium text-slate-900">{formatDate(invoice.due_date)}</p>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-2 font-semibold text-slate-600">Description</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">Qty</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">Rate</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                        No line items.
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-700">{it.description}</td>
                        <td className="px-4 py-2 text-slate-700">{it.qty}</td>
                        <td className="px-4 py-2 text-slate-700">{formatCurrency(it.rate)}</td>
                        <td className="px-4 py-2 text-slate-700">{formatCurrency(it.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-6">
              <div className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span>− {formatCurrency(discount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Shipping Charges</span>
                  <span>{formatCurrency(shipping)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Taxable Amount</span>
                  <span>{formatCurrency(taxableAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <span>{formatCurrency(invoice.tax_amount)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
                  <span>Grand Total</span>
                  <span>{formatCurrency(invoice.total)}</span>
                </div>
                <div className="flex justify-between font-semibold text-brand">
                  <span>Amount Outstanding</span>
                  <span>{formatCurrency(Math.max(outstanding, 0))}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
                <span className="font-medium text-slate-700">Notes: </span>
                {invoice.notes}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Invoice Timeline</h3>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ol className="space-y-5">
              {timeline.map((ev, i) => (
                <li key={i} className="relative pl-5">
                  <span className="absolute left-0 top-1 h-2 w-2 rounded-full bg-brand" />
                  {i < timeline.length - 1 && (
                    <span className="absolute left-[3px] top-3 h-full w-px bg-slate-200" />
                  )}
                  <p className="text-sm font-medium text-slate-900">{ev.label}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(ev.date)}</p>
                  {ev.detail && <p className="text-xs text-slate-500">{ev.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
