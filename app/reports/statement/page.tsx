"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import type { Customer, Invoice, Receipt } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";
import { FormField, inputClass } from "@/components/FormField";

type LedgerEntry = {
  date: string;
  particulars: string;
  debit: number;
  credit: number;
};

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function CustomerStatementPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("customers")
      .select("*")
      .order("name")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setCustomers(data ?? []);
      });
  }, []);

  useEffect(() => {
    if (!supabase || !customerId) {
      setInvoices([]);
      setReceipts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      supabase.from("invoices").select("*").eq("customer_id", customerId).order("invoice_date"),
      supabase.from("receipts").select("*").eq("customer_id", customerId).order("receipt_date"),
    ]).then(([invRes, rcptRes]) => {
      if (cancelled) return;
      if (invRes.error) setError(invRes.error.message);
      else if (rcptRes.error) setError(rcptRes.error.message);
      setInvoices(invRes.data ?? []);
      setReceipts(rcptRes.data ?? []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const customer = customers.find((c) => c.id === customerId) ?? null;

  const { rows, closingBalance } = useMemo(() => {
    if (!customer) return { rows: [] as (LedgerEntry & { balance: number })[], closingBalance: 0 };

    const entries: LedgerEntry[] = [
      ...invoices.map((inv) => ({
        date: inv.invoice_date,
        particulars: `Invoice ${inv.invoice_no}`,
        debit: inv.total,
        credit: 0,
      })),
      ...receipts.map((r) => ({
        date: r.receipt_date,
        particulars: `Receipt ${r.receipt_no}`,
        debit: 0,
        credit: r.amount,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let balance = customer.opening_balance;
    const withBalance = entries.map((e) => {
      balance = balance + e.debit - e.credit;
      return { ...e, balance };
    });

    return { rows: withBalance, closingBalance: balance };
  }, [customer, invoices, receipts]);

  return (
    <div className="p-6">
      <PageHeader
        title="Customer Statement"
        subtitle="Every invoice and receipt for one customer, in date order, with a running balance."
        action={
          customer ? (
            <button
              onClick={() => window.print()}
              className="no-print rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Print
            </button>
          ) : undefined
        }
      />

      {!isConfigured && <NotConfigured />}

      {isConfigured && (
        <>
          <div className="no-print mb-6 max-w-sm">
            <FormField label="Customer">
              <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!customer && !error && (
            <p className="text-sm text-slate-500">Pick a customer above to see their statement.</p>
          )}

          {customer && (
            <div id="statement-print" className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{customer.name}</h3>
                  <p className="text-sm text-slate-500">{customer.code}</p>
                  {customer.address && <p className="mt-1 text-sm text-slate-500">{customer.address}</p>}
                </div>
                <div className="text-right text-sm text-slate-500">
                  <p>Credit limit: {formatCurrency(customer.credit_limit)}</p>
                  <p>Credit days: {customer.credit_days}</p>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-slate-500">Loading statement…</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left">
                        <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                        <th className="px-4 py-3 font-semibold text-slate-600">Particulars</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Debit</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Credit</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-500" colSpan={4}>
                          Opening balance
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">
                          {formatCurrency(customer.opening_balance)}
                        </td>
                      </tr>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                            No invoices or receipts for this customer yet.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr key={`${r.date}-${r.particulars}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                            <td className="px-4 py-3 text-slate-700">{r.particulars}</td>
                            <td className="px-4 py-3 text-right text-slate-700">{r.debit ? formatCurrency(r.debit) : "—"}</td>
                            <td className="px-4 py-3 text-right text-slate-700">{r.credit ? formatCurrency(r.credit) : "—"}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(r.balance)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50">
                        <td colSpan={4} className="px-4 py-3 text-right font-semibold text-slate-700">
                          Closing balance (amount owed)
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-brand">{formatCurrency(closingBalance)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
