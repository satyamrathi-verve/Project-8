"use client";

import { useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Company, Customer, Invoice, InvoiceItem } from "@/lib/types";
import { NotConfigured } from "@/components/NotConfigured";
import { deriveDiscountAndShipping, formatCurrency, formatDate } from "@/lib/format";

/*
  Printable invoice (screen 7). Browser "Print → Save as PDF" on this page
  should produce a clean invoice — no nav, no app chrome (see print:hidden
  on Nav and print:p-0 on the main layout).

  Discount and Shipping come from invoices.calc_meta — see
  lib/format.ts:deriveDiscountAndShipping.
*/

export default function InvoicePrintPage({ params }: { params: { id: string } }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
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

      const [{ data: cust }, { data: invItems }, { data: companyRow }] = await Promise.all([
        supabase.from("customers").select("*").eq("id", inv.customer_id).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", params.id).order("id"),
        supabase.from("company").select("*").limit(1).single(),
      ]);

      setCustomer((cust as Customer) ?? null);
      setItems((invItems as InvoiceItem[]) ?? []);
      setCompany((companyRow as Company) ?? null);
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (!isConfigured) return <NotConfigured />;

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 shadow-sm">
        Loading…
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
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Print
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-10 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="flex justify-between border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{company?.name ?? "Company"}</h1>
            <p className="text-sm text-slate-500">{company?.address}</p>
            <p className="text-sm text-slate-500">
              {company?.email} {company?.phone && `· ${company.phone}`}
            </p>
            {company?.gstin && <p className="text-sm text-slate-500">GSTIN: {company.gstin}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-semibold text-slate-900">TAX INVOICE</h2>
            <p className="mt-1 text-sm text-slate-600">No. {invoice.invoice_no}</p>
            <p className="text-sm text-slate-600">Date: {formatDate(invoice.invoice_date)}</p>
            <p className="text-sm text-slate-600">Due: {formatDate(invoice.due_date)}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bill To</p>
          <p className="mt-1 font-medium text-slate-900">{customer?.name}</p>
          <p className="text-sm text-slate-500">{customer?.address}</p>
          {customer?.gstin && <p className="text-sm text-slate-500">GSTIN: {customer.gstin}</p>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th className="py-2 font-semibold text-slate-600">Description</th>
              <th className="py-2 font-semibold text-slate-600">Qty</th>
              <th className="py-2 font-semibold text-slate-600">Rate</th>
              <th className="py-2 text-right font-semibold text-slate-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-2 text-slate-700">{it.description}</td>
                <td className="py-2 text-slate-700">{it.qty}</td>
                <td className="py-2 text-slate-700">{formatCurrency(it.rate)}</td>
                <td className="py-2 text-right text-slate-700">{formatCurrency(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
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
            <div className="flex justify-between border-t border-slate-300 pt-1.5 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatCurrency(invoice.total)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && <p className="mt-8 text-sm text-slate-500">{invoice.notes}</p>}

        <div className="mt-10 flex items-end justify-between border-t border-slate-200 pt-6">
          <div className="max-w-sm text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Terms &amp; Conditions</p>
            <p className="mt-1">
              Payment is due by the date shown above. Please quote the invoice number with any payment.
            </p>
            <p className="mt-3 font-medium text-slate-700">Thank you for your business!</p>
          </div>
          <div className="text-right">
            <div className="mb-1 h-10 w-40 border-b border-slate-300" />
            <p className="text-xs text-slate-500">Authorised Signature</p>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          {company?.name} {company?.address && `· ${company.address}`} {company?.email && `· ${company.email}`}{" "}
          {company?.phone && `· ${company.phone}`}
        </div>
      </div>
    </div>
  );
}
