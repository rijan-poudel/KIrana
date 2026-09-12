"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, HandCoins, Loader2, UserPlus, X } from "lucide-react";
import type { CheckoutLine } from "./billing-client";
import type { CheckoutResult, CustomerOption, PriceMode } from "@/lib/types";
import { formatNPR, round2 } from "@/lib/format";
import { checkout } from "@/actions/shop-actions";

type PaymentChoice = "CASH" | "PARTIAL" | "UDHARO";
type CustomerChoice = "existing" | "new";

export default function CheckoutModal({
  open,
  mode,
  total,
  lines,
  customers,
  onClose,
  onSuccess,
}: {
  open: boolean;
  mode: PriceMode;
  total: number;
  lines: CheckoutLine[];
  customers: CustomerOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [choice, setChoice] = useState<PaymentChoice>("CASH");
  const [paidText, setPaidText] = useState(String(total));
  const [customerChoice, setCustomerChoice] = useState<CustomerChoice>(customers.length > 0 ? "existing" : "new");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  // State is initialized from props because the parent remounts this modal with
  // a new `key` every time it opens — no reset effect needed (and crucially, a
  // router.refresh() after a completed sale cannot wipe the success receipt).

  const paidAmount = useMemo(() => {
    if (choice === "CASH") return total;
    if (choice === "UDHARO") return 0;
    const value = Number.parseFloat(paidText);
    if (Number.isNaN(value) || value < 0) return 0;
    return Math.min(value, total);
  }, [choice, paidText, total]);

  const dueAmount = round2(total - paidAmount);
  const needsCustomer = choice === "UDHARO" || (choice === "PARTIAL" && dueAmount > 0);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const customerLabel =
    customerChoice === "new" ? newName.trim() || "new customer" : selectedCustomer?.name ?? "customer";

  if (!open) return null;

  function handleClose() {
    if (result) onSuccess();
    else onClose();
  }

  async function submit() {
    setError(null);
    if (choice === "PARTIAL" && (paidAmount <= 0 || paidAmount >= total)) {
      setError("For a partial payment, enter the cash received now (less than the total bill).");
      return;
    }
    if (needsCustomer && customerChoice === "existing" && !customerId) {
      setError("Select a customer for the udharo amount, or create a new one.");
      return;
    }
    if (needsCustomer && customerChoice === "new" && !newName.trim()) {
      setError("Enter the new customer's name.");
      return;
    }

    setSubmitting(true);
    const response = await checkout({
      type: mode === "wholesale" ? "WHOLESALE" : "RETAIL",
      customerId: needsCustomer && customerChoice === "existing" ? customerId : null,
      newCustomer:
        needsCustomer && customerChoice === "new"
          ? { name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() }
          : null,
      items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      paidAmount,
    });
    setSubmitting(false);

    if (response.ok) setResult(response.data);
    else setError(response.error);
  }

  return (
    <div className="modal-overlay" onClick={handleClose} role="dialog" aria-modal="true" aria-label="Checkout">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <div className="text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Sale Complete!</h2>
            <p className="mt-1 text-sm text-slate-500">Receipt #{result.transactionId.slice(-8).toUpperCase()}</p>

            <div className="mt-4 rounded-xl border border-slate-200 p-4 text-left">
              {lines.map((line) => (
                <div key={line.productId} className="flex items-baseline justify-between py-1 text-sm">
                  <span className="text-slate-700">
                    {formatNPR(line.unitPrice)} × {line.quantity} {line.unit} — {line.name}
                  </span>
                  <span className="ml-2 shrink-0 font-semibold text-slate-900">{formatNPR(line.subtotal)}</span>
                </div>
              ))}
              <div className="mt-2 space-y-1 border-t border-dashed border-slate-200 pt-2 text-sm">
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{formatNPR(result.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Paid now ({mode === "wholesale" ? "Wholesale" : "Retail"})</span>
                  <span>{formatNPR(result.paidAmount)}</span>
                </div>
                {result.dueAmount > 0 && (
                  <div className="flex justify-between font-semibold text-red-600">
                    <span>Added to {customerLabel}&apos;s khata</span>
                    <span>{formatNPR(result.dueAmount)}</span>
                  </div>
                )}
              </div>
            </div>

            <button type="button" onClick={() => onSuccess()} className="btn-primary mt-5 w-full py-3.5 text-lg">
              Start New Sale
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Checkout</h2>
                <p className="text-sm text-slate-500">
                  {lines.length} item{lines.length === 1 ? "" : "s"} • {mode === "wholesale" ? "Wholesale" : "Retail"} prices
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close checkout"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-900 p-4 text-white">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-300">Bill Total</span>
                <span className="text-3xl font-bold">{formatNPR(total)}</span>
              </div>
            </div>

            <div className="mt-4">
              <span className="label">Payment</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setChoice("CASH")}
                  className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors ${
                    choice === "CASH" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Banknote size={18} /> Nagad / Cash
                </button>
                <button
                  type="button"
                  onClick={() => setChoice("PARTIAL")}
                  className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors ${
                    choice === "PARTIAL" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <HandCoins size={18} /> Partial
                </button>
                <button
                  type="button"
                  onClick={() => setChoice("UDHARO")}
                  className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors ${
                    choice === "UDHARO" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <AlertTriangle size={18} /> Udharo
                </button>
              </div>
            </div>

            {choice === "CASH" && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Collect <strong>{formatNPR(total)}</strong> cash at the counter and hand over the goods.
              </p>
            )}

            {choice === "PARTIAL" && (
              <div className="mt-3">
                <label className="label" htmlFor="paid-now">
                  Cash received now (rest goes on khata)
                </label>
                <input
                  id="paid-now"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={total}
                  step="0.01"
                  value={paidText}
                  onChange={(e) => setPaidText(e.target.value)}
                  className="input text-lg"
                />
                <p className="mt-1 text-sm text-slate-500">
                  Due after this payment: <strong className="text-amber-700">{formatNPR(dueAmount)}</strong>
                </p>
              </div>
            )}

            {needsCustomer && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3">
                <span className="label">Khata Customer ({formatNPR(dueAmount)} on credit)</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerChoice("existing")}
                    disabled={customers.length === 0}
                    className={`h-11 rounded-lg border text-sm font-bold transition-colors disabled:opacity-40 ${
                      customerChoice === "existing"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerChoice("new")}
                    className={`flex h-11 items-center justify-center gap-1 rounded-lg border text-sm font-bold transition-colors ${
                      customerChoice === "new"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    <UserPlus size={15} /> New Customer
                  </button>
                </div>

                {customerChoice === "existing" ? (
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="input mt-3"
                    aria-label="Select customer"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — owes {formatNPR(c.currentBalance)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-3 space-y-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Customer name *"
                      className="input"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="Phone (optional)"
                        inputMode="tel"
                        className="input"
                      />
                      <input
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        placeholder="Ward / area"
                        className="input"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <button type="button" onClick={submit} disabled={submitting} className="btn-primary mt-5 h-14 w-full text-lg">
              {submitting ? <Loader2 size={20} className="animate-spin" /> : null}
              {submitting
                ? "Saving…"
                : dueAmount > 0
                  ? `Complete Sale — ${formatNPR(total)} (${formatNPR(dueAmount)} udharo)`
                  : `Complete Sale — ${formatNPR(total)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
