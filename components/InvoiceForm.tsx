"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Customer, InvoiceStatus } from "@/lib/types";
import { FormField, inputClass } from "@/components/FormField";
import { formatCurrency, TAX_RATE_OPTIONS } from "@/lib/format";

/*
  Shared punch/edit form for invoices (screen 6). Used by both
  app/invoices/new/page.tsx (create) and app/invoices/[id]/edit/page.tsx (edit)
  so the two stay identical instead of drifting apart.

  Discount type/value, the tax-rate preset, the override-tax flag + manual
  amount, shipping charges, and the taxable toggle are all persisted in
  invoices.calc_meta (one jsonb column) alongside the authoritative
  subtotal / tax_amount / total columns, so reopening an invoice restores
  every control exactly as it was left. Older invoices saved before this
  column existed have `calc_meta = {}` and fall back to sensible defaults.
*/

interface LineItem {
  description: string;
  qty: string;
  rate: string;
}

const emptyItem: LineItem = { description: "", qty: "1", rate: "" };

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Looks at every existing invoice_no, finds the highest numeric suffix, and
// returns that prefix/padding incremented by one (e.g. "INV-0007" after the
// highest existing "INV-0006"). Falls back to "INV-0001" when there's
// nothing to go on yet.
async function getNextInvoiceNo(): Promise<string> {
  if (!supabase) return "INV-0001";
  const { data } = await supabase.from("invoices").select("invoice_no");

  let maxNum = 0;
  let prefix = "INV-";
  let padLength = 4;

  (data ?? []).forEach((row) => {
    const match = row.invoice_no.match(/^(\D*)(\d+)$/);
    if (!match) return;
    const num = parseInt(match[2], 10);
    if (num > maxNum) {
      maxNum = num;
      prefix = match[1];
      padLength = match[2].length;
    }
  });

  return `${prefix}${String(maxNum + 1).padStart(padLength, "0")}`;
}

interface Snapshot {
  customerId: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
  items: LineItem[];
  discountType: "percentage" | "fixed";
  discountValue: string;
  taxRatePreset: number | "custom";
  customTaxRatePct: string;
  overrideTax: boolean;
  manualTaxAmount: string;
  shippingCharges: string;
  isTaxable: boolean;
}

export function InvoiceForm({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(invoiceId);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [status, setStatus] = useState<InvoiceStatus>("open");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);

  // Discount (invoice-level) — percentage of subtotal, or a fixed ₹ amount.
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("0");

  // Shipping — added to the discounted subtotal before tax.
  const [shippingCharges, setShippingCharges] = useState("0");

  // Customer Tax Status — Tax Exempt forces tax to ₹0 regardless of rate.
  const [isTaxable, setIsTaxable] = useState(true);

  // Tax — a rate preset applied to the taxable amount, or a manual override
  // for the original free-typed ₹ tax amount behaviour.
  const [taxRatePreset, setTaxRatePreset] = useState<number | "custom">(0);
  const [customTaxRatePct, setCustomTaxRatePct] = useState("0");
  const [overrideTax, setOverrideTax] = useState(false);
  const [manualTaxAmount, setManualTaxAmount] = useState("0");

  const initialSnapshot = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!supabase) return;
      setLoading(true);

      const { data: customerData } = await supabase.from("customers").select("*").order("name");
      setCustomers((customerData as Customer[]) ?? []);

      let loadedItems: LineItem[] = [{ ...emptyItem }];
      let snap: Snapshot = {
        customerId: "",
        invoiceNo: "",
        invoiceDate: new Date().toISOString().slice(0, 10),
        dueDate: "",
        status: "open",
        notes: "",
        items: loadedItems,
        discountType: "percentage",
        discountValue: "0",
        taxRatePreset: 0,
        customTaxRatePct: "0",
        overrideTax: false,
        manualTaxAmount: "0",
        shippingCharges: "0",
        isTaxable: true,
      };

      if (invoiceId) {
        const [{ data: invoice }, { data: invoiceItems }] = await Promise.all([
          supabase.from("invoices").select("*").eq("id", invoiceId).single(),
          supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("id"),
        ]);
        if (invoiceItems && invoiceItems.length > 0) {
          loadedItems = invoiceItems.map((it) => ({
            description: it.description,
            qty: String(it.qty),
            rate: String(it.rate),
          }));
        }
        if (invoice) {
          const meta = invoice.calc_meta ?? {};
          const hasMeta = meta.discountValue !== undefined || meta.taxRatePreset !== undefined;

          setCustomerId(invoice.customer_id);
          setInvoiceNo(invoice.invoice_no);
          setInvoiceDate(invoice.invoice_date);
          setDueDate(invoice.due_date);
          setDueDateTouched(true);
          setStatus(invoice.status);
          setNotes(invoice.notes ?? "");

          const nextDiscountType = meta.discountType ?? "percentage";
          const nextDiscountValue = meta.discountValue !== undefined ? String(meta.discountValue) : "0";
          const nextTaxRatePreset = meta.taxRatePreset ?? 0;
          const nextCustomTaxRatePct = meta.customTaxRatePct !== undefined ? String(meta.customTaxRatePct) : "0";
          const nextShipping = meta.shippingCharges !== undefined ? String(meta.shippingCharges) : "0";
          const nextIsTaxable = meta.isTaxable ?? true;
          // Legacy invoices (saved before calc_meta existed) fall back to
          // treating their stored tax_amount as a manual override, so the
          // saved figure is never silently recalculated away.
          const nextOverrideTax = hasMeta ? Boolean(meta.overrideTax) : invoice.tax_amount > 0;
          const nextManualTax = hasMeta
            ? meta.manualTaxAmount !== undefined
              ? String(meta.manualTaxAmount)
              : "0"
            : String(invoice.tax_amount);

          setDiscountType(nextDiscountType);
          setDiscountValue(nextDiscountValue);
          setTaxRatePreset(nextTaxRatePreset);
          setCustomTaxRatePct(nextCustomTaxRatePct);
          setShippingCharges(nextShipping);
          setIsTaxable(nextIsTaxable);
          setOverrideTax(nextOverrideTax);
          setManualTaxAmount(nextManualTax);

          snap = {
            customerId: invoice.customer_id,
            invoiceNo: invoice.invoice_no,
            invoiceDate: invoice.invoice_date,
            dueDate: invoice.due_date,
            status: invoice.status,
            notes: invoice.notes ?? "",
            items: loadedItems,
            discountType: nextDiscountType,
            discountValue: nextDiscountValue,
            taxRatePreset: nextTaxRatePreset,
            customTaxRatePct: nextCustomTaxRatePct,
            overrideTax: nextOverrideTax,
            manualTaxAmount: nextManualTax,
            shippingCharges: nextShipping,
            isTaxable: nextIsTaxable,
          };
        }
        setItems(loadedItems);
      } else {
        const nextInvoiceNo = await getNextInvoiceNo();
        setInvoiceNo(nextInvoiceNo);
        snap = { ...snap, invoiceNo: nextInvoiceNo };
      }

      initialSnapshot.current = JSON.stringify(snap);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  // Due date auto-fills from the customer's credit days, unless the user has
  // already edited it directly.
  useEffect(() => {
    if (dueDateTouched) return;
    const customer = customers.find((c) => c.id === customerId);
    if (customer && invoiceDate) {
      setDueDate(addDays(invoiceDate, customer.credit_days));
    }
  }, [customerId, invoiceDate, customers, dueDateTouched]);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- smart, always-in-sync totals ----------------------------------
  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Math.max(Number(it.qty) || 0, 0) * Math.max(Number(it.rate) || 0, 0), 0),
    [items]
  );

  const rawDiscount =
    discountType === "percentage" ? (subtotal * (Number(discountValue) || 0)) / 100 : Number(discountValue) || 0;
  const discountAmount = Math.min(Math.max(rawDiscount, 0), subtotal);
  const discountClamped = rawDiscount > subtotal;

  const shipping = Math.max(Number(shippingCharges) || 0, 0);
  const shippingInvalid = Number(shippingCharges) < 0;

  // Subtotal − Discount + Shipping = Taxable Amount
  const taxableAmount = subtotal - discountAmount + shipping;

  const effectiveTaxRatePct = taxRatePreset === "custom" ? Number(customTaxRatePct) || 0 : taxRatePreset;
  const computedTax = (taxableAmount * effectiveTaxRatePct) / 100;
  const taxAmount = !isTaxable ? 0 : overrideTax ? Number(manualTaxAmount) || 0 : computedTax;
  const taxExceedsTaxable = isTaxable && taxAmount > taxableAmount + 0.005;

  const total = taxableAmount + taxAmount;

  const dueDateInvalid = Boolean(invoiceDate && dueDate && dueDate < invoiceDate);
  const hasNegativeLine = items.some((it) => Number(it.qty) < 0 || Number(it.rate) < 0);

  function currentSnapshot(): Snapshot {
    return {
      customerId,
      invoiceNo,
      invoiceDate,
      dueDate,
      status,
      notes,
      items,
      discountType,
      discountValue,
      taxRatePreset,
      customTaxRatePct,
      overrideTax,
      manualTaxAmount,
      shippingCharges,
      isTaxable,
    };
  }

  function isDirty(): boolean {
    if (initialSnapshot.current === null) return false;
    return JSON.stringify(currentSnapshot()) !== initialSnapshot.current;
  }

  function handleCancel() {
    if (isDirty()) {
      setShowDiscardConfirm(true);
    } else {
      router.push("/invoices");
    }
  }

  async function handleSave() {
    if (!supabase) return;
    setError(null);
    setValidationError(null);

    if (hasNegativeLine) {
      setValidationError("Quantity and rate can't be negative.");
      return;
    }
    if (shippingInvalid) {
      setValidationError("Shipping charges can't be negative.");
      return;
    }
    if (dueDateInvalid) {
      setValidationError("Due date can't be before the invoice date.");
      return;
    }
    if (taxExceedsTaxable) {
      setValidationError("Tax can't be greater than the taxable amount.");
      return;
    }

    setSaving(true);

    const payload = {
      invoice_no: invoiceNo.trim(),
      invoice_date: invoiceDate,
      customer_id: customerId,
      due_date: dueDate,
      subtotal,
      tax_amount: taxAmount,
      total,
      status,
      notes: notes.trim() || null,
      calc_meta: {
        discountType,
        discountValue: Number(discountValue) || 0,
        taxRatePreset,
        customTaxRatePct: Number(customTaxRatePct) || 0,
        overrideTax,
        manualTaxAmount: Number(manualTaxAmount) || 0,
        shippingCharges: shipping,
        isTaxable,
      },
    };

    let id = invoiceId;

    if (isEdit && id) {
      const { error: updateErr } = await supabase.from("invoices").update(payload).eq("id", id);
      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }
      await supabase.from("invoice_items").delete().eq("invoice_id", id);
    } else {
      const { data, error: insertErr } = await supabase.from("invoices").insert(payload).select("id").single();
      if (insertErr || !data) {
        setError(insertErr?.message ?? "Could not create invoice.");
        setSaving(false);
        return;
      }
      id = data.id;
    }

    const itemRows = items
      .filter((it) => it.description.trim())
      .map((it) => ({
        invoice_id: id,
        description: it.description.trim(),
        qty: Number(it.qty) || 0,
        rate: Number(it.rate) || 0,
        amount: (Number(it.qty) || 0) * (Number(it.rate) || 0),
      }));

    if (itemRows.length > 0) {
      const { error: itemsErr } = await supabase.from("invoice_items").insert(itemRows);
      if (itemsErr) {
        setError(itemsErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push(`/invoices/${id}`);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 shadow-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {validationError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          {validationError}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Invoice Details</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Customer">
            <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Invoice No.">
            <input className={inputClass} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </FormField>
          <FormField label="Invoice Date">
            <input
              type="date"
              className={inputClass}
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </FormField>
          <FormField label="Due Date">
            <input
              type="date"
              className={`${inputClass} ${dueDateInvalid ? "border-red-400 focus:border-red-400 focus:ring-red-400" : ""}`}
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueDateTouched(true);
              }}
            />
          </FormField>
          <FormField label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="void">Void</option>
            </select>
          </FormField>
          <FormField label="Customer Tax Status">
            <label className="flex h-[38px] items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isTaxable}
                onChange={(e) => setIsTaxable(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              {isTaxable ? "Taxable" : "Tax Exempt"}
            </label>
          </FormField>
          <div className="sm:col-span-2 lg:col-span-2">
            <FormField label="Notes">
              <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </div>
        </div>
        {dueDateInvalid && <p className="mt-2 text-xs font-medium text-red-600">Due date can't be before the invoice date.</p>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Line Items</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-2 font-semibold text-slate-600">Description</th>
                <th className="px-4 py-2 font-semibold text-slate-600">Qty</th>
                <th className="px-4 py-2 font-semibold text-slate-600">Rate</th>
                <th className="px-4 py-2 font-semibold text-slate-600">Amount</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const lineInvalid = Number(it.qty) < 0 || Number(it.rate) < 0;
                return (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <input
                        className={inputClass}
                        value={it.description}
                        onChange={(e) => updateItem(i, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 w-24">
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} ${lineInvalid ? "border-red-400" : ""}`}
                        value={it.qty}
                        onChange={(e) => updateItem(i, { qty: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 w-32">
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} ${lineInvalid ? "border-red-400" : ""}`}
                        value={it.rate}
                        onChange={(e) => updateItem(i, { rate: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 w-32 font-medium text-slate-700">
                      {formatCurrency(Math.max(Number(it.qty) || 0, 0) * Math.max(Number(it.rate) || 0, 0))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-xs font-medium text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addItem} className="mt-3 text-sm font-medium text-brand hover:underline">
          + Add line item
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Discount, Shipping &amp; Tax</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Discount Type">
            <select
              className={inputClass}
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </FormField>
          <FormField label={discountType === "percentage" ? "Discount %" : "Discount ₹"}>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </FormField>
          <FormField label="Shipping Charges (₹)">
            <input
              type="number"
              min={0}
              className={`${inputClass} ${shippingInvalid ? "border-red-400" : ""}`}
              value={shippingCharges}
              onChange={(e) => setShippingCharges(e.target.value)}
            />
          </FormField>
          <FormField label="Tax Rate">
            <select
              className={inputClass}
              value={String(taxRatePreset)}
              disabled={overrideTax || !isTaxable}
              onChange={(e) =>
                setTaxRatePreset(e.target.value === "custom" ? "custom" : Number(e.target.value))
              }
            >
              {TAX_RATE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </FormField>
          {taxRatePreset === "custom" && (
            <FormField label="Custom Tax %">
              <input
                type="number"
                min={0}
                className={inputClass}
                disabled={overrideTax || !isTaxable}
                value={customTaxRatePct}
                onChange={(e) => setCustomTaxRatePct(e.target.value)}
              />
            </FormField>
          )}
        </div>

        {discountClamped && (
          <p className="mt-2 text-xs font-medium text-amber-600">Discount can't exceed the subtotal — capped at {formatCurrency(subtotal)}.</p>
        )}
        {shippingInvalid && <p className="mt-2 text-xs font-medium text-red-600">Shipping charges can't be negative.</p>}
        {!isTaxable && (
          <p className="mt-2 text-xs text-slate-500">
            This customer is tax exempt — tax is forced to ₹0 and the rate controls are disabled.
          </p>
        )}

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={overrideTax}
            disabled={!isTaxable}
            onChange={(e) => setOverrideTax(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand disabled:opacity-50"
          />
          Override tax — enter the tax amount manually instead of using a rate
        </label>
        {overrideTax && isTaxable && (
          <div className="mt-3 max-w-xs">
            <FormField label="Tax Amount (₹)">
              <input
                type="number"
                min={0}
                className={`${inputClass} ${taxExceedsTaxable ? "border-red-400" : ""}`}
                value={manualTaxAmount}
                onChange={(e) => setManualTaxAmount(e.target.value)}
              />
            </FormField>
          </div>
        )}
        {taxExceedsTaxable && (
          <p className="mt-2 text-xs font-medium text-red-600">Tax can't be greater than the taxable amount.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Discount</span>
              <span>− {formatCurrency(discountAmount)}</span>
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
              <span>Tax {isTaxable && !overrideTax && `(${effectiveTaxRatePct}%)`}</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
              <span>Grand Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !customerId || !invoiceNo || !invoiceDate || !dueDate}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Invoice"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      {showDiscardConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setShowDiscardConfirm(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="text-base font-semibold text-slate-900">Discard changes?</h3>
            <p className="mt-1 text-sm text-slate-500">You have unsaved changes on this invoice.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Continue Editing
              </button>
              <button
                type="button"
                onClick={() => router.push("/invoices")}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Discard
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
