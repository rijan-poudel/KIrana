"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  History,
  Loader2,
  Phone,
  MapPin,
  Search,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import type { CustomerOption, HistoryEntry } from "@/lib/types";
import { formatDateTime, formatNPR, formatQuantity } from "@/lib/format";
import { createCustomer, getCustomerHistory, recordPayment } from "@/actions/shop-actions";

type Banner = { kind: "success" | "error"; message: string } | null;

export default function KhataClient({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<CustomerOption | null>(null);
  const [paymentFor, setPaymentFor] = useState<CustomerOption | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.phone ?? "").toLowerCase().includes(term) ||
          c.address.toLowerCase().includes(term),
      )
    : customers;

  const totalOutstanding = customers.reduce((sum, c) => sum + Math.max(c.currentBalance, 0), 0);
  const withDues = customers.filter((c) => c.currentBalance > 0).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Udharo Khata</h1>
          <p className="mt-1 text-slate-500">
            {customers.length} customers • {withDues} with outstanding credit
          </p>
        </div>
        <button type="button" onClick={() => setAddOpen(true)} className="btn-primary h-12 text-base">
          <UserPlus size={18} /> Add Customer
        </button>
      </header>

      <div className="card mt-5 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <Wallet size={22} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-500">Total outstanding udharo</p>
            <p className="text-2xl font-bold text-red-600">{formatNPR(totalOutstanding)}</p>
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <span className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {banner.message}
          </span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss message" className="shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="relative mt-4">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="text"
          placeholder="Search by name, phone or address…"
          className="input pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card mt-4 flex flex-col items-center gap-2 p-10 text-center">
          <BookOpen size={32} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-500">
            {customers.length === 0
              ? "No customers on the khata yet. Add one, or record a credit sale from the Billing screen."
              : "No customers match your search."}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((customer) => (
            <div key={customer.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-900">{customer.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <Phone size={12} /> {customer.phone ?? "No phone"}
                  </p>
                  {customer.address && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                      <MapPin size={12} /> {customer.address}
                    </p>
                  )}
                </div>
                <span className={customer.currentBalance > 0 ? "badge-red" : customer.currentBalance < 0 ? "badge-blue" : "badge-emerald"}>
                  {customer.currentBalance > 0
                    ? `Owes ${formatNPR(customer.currentBalance)}`
                    : customer.currentBalance < 0
                      ? `Advance ${formatNPR(-customer.currentBalance)}`
                      : "No dues"}
                </span>
              </div>
              <div className="mt-3 flex gap-2 pt-1">
                <button type="button" onClick={() => setHistoryFor(customer)} className="btn-secondary h-11 flex-1 text-sm">
                  <History size={15} /> History
                </button>
                <button type="button" onClick={() => setPaymentFor(customer)} className="btn-primary h-11 flex-1 text-sm">
                  <Wallet size={15} /> Record Payment
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddCustomerModal onClose={() => setAddOpen(false)} onSaved={(message) => { setAddOpen(false); setBanner({ kind: "success", message }); router.refresh(); }} />}
      {historyFor && <HistoryModal customer={historyFor} onClose={() => setHistoryFor(null)} />}
      {paymentFor && (
        <PaymentModal
          customer={paymentFor}
          onClose={() => setPaymentFor(null)}
          onSettled={(message) => {
            setBanner({ kind: "success", message });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AddCustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const response = await createCustomer({ name, phone, address });
    setSubmitting(false);
    if (response.ok) onSaved(`${name.trim()} added to the khata.`);
    else setError(response.error);
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Add customer">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold text-slate-900">Add Customer</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="c-name">
              Customer name *
            </label>
            <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g., Ram Bahadur Gurung" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="c-phone">
                Phone
              </label>
              <input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="input" placeholder="98-XXXXXXXX" />
            </div>
            <div>
              <label className="label" htmlFor="c-address">
                Ward / area
              </label>
              <input id="c-address" value={address} onChange={(e) => setAddress(e.target.value)} className="input" placeholder="e.g., Gaindakot Ward No. 5" />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? <Loader2 size={18} className="animate-spin" /> : null} Add Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryModal({ customer, onClose }: { customer: CustomerOption; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomerHistory(customer.id).then((response) => {
      if (cancelled) return;
      if (response.ok) setEntries(response.data);
      else setError(response.error);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Customer history">
      <div className="modal-panel max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
            <p className="text-sm text-slate-500">
              {customer.phone ?? "No phone"} {customer.address ? `• ${customer.address}` : ""}
            </p>
          </div>
          <span className={customer.currentBalance > 0 ? "badge-red" : "badge-emerald"}>
            {customer.currentBalance > 0 ? `Owes ${formatNPR(customer.currentBalance)}` : "No dues"}
          </span>
        </div>

        <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</div>
          )}
          {!error && entries === null && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading history…
            </div>
          )}
          {entries !== null && entries.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">No transactions yet for this customer.</p>
          )}
          {entries !== null &&
            entries.map((entry) => {
              const isPayment = entry.type === "PAYMENT";
              return (
                <div key={entry.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={isPayment ? "badge-emerald" : entry.type === "WHOLESALE" ? "badge-blue" : "badge-slate"}>
                        {isPayment ? "PAYMENT" : entry.type === "WHOLESALE" ? "WHOLESALE SALE" : "RETAIL SALE"}
                      </span>
                      {!isPayment && (
                        <span
                          className={
                            entry.paymentStatus === "PAID" ? "badge-emerald" : entry.paymentStatus === "PARTIAL" ? "badge-amber" : "badge-red"
                          }
                        >
                          {entry.paymentStatus}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDateTime(entry.createdAt)}</span>
                  </div>

                  {isPayment ? (
                    <p className="mt-2 text-sm font-semibold text-emerald-700">
                      + {formatNPR(entry.totalAmount)} paid towards khata
                    </p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-0.5">
                        {entry.items.map((item, index) => (
                          <li key={index} className="text-xs text-slate-600">
                            {formatQuantity(item.quantity)} {item.unit} × {item.productName} @ {formatNPR(item.unitPrice)} ={" "}
                            <span className="font-semibold">{formatNPR(item.subtotal)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex justify-between text-sm">
                        <span className="font-semibold text-slate-900">Total {formatNPR(entry.totalAmount)}</span>
                        <span className="text-slate-500">
                          Paid {formatNPR(entry.paidAmount)}
                          {entry.totalAmount - entry.paidAmount > 0 && (
                            <span className="ml-1 font-semibold text-red-600">
                              (due {formatNPR(entry.totalAmount - entry.paidAmount)})
                            </span>
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
        </div>

        <button type="button" onClick={onClose} className="btn-secondary mt-4 w-full">
          Close
        </button>
      </div>
    </div>
  );
}

function PaymentModal({
  customer,
  onClose,
  onSettled,
}: {
  customer: CustomerOption;
  onClose: () => void;
  onSettled: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const outstanding = customer.currentBalance;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number.parseFloat(amount);
    if (Number.isNaN(value) || value <= 0) {
      setError("Enter the cash amount the customer paid.");
      return;
    }
    setSubmitting(true);
    const response = await recordPayment({ customerId: customer.id, amount: value });
    setSubmitting(false);
    if (response.ok) setNewBalance(response.data.newBalance);
    else setError(response.error);
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Record payment">
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        {newBalance === null ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Record Payment</h2>
                <p className="text-sm text-slate-500">{customer.name}</p>
              </div>
              <span className={outstanding > 0 ? "badge-red" : "badge-emerald"}>
                {outstanding > 0 ? `Owes ${formatNPR(outstanding)}` : "No dues"}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="pay-amount">
                  Cash received (Rs.) *
                </label>
                <input
                  id="pay-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input text-xl"
                  placeholder="0.00"
                  autoFocus
                  required
                />
                {outstanding > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(String(outstanding))}
                    className="mt-2 text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    Pay full outstanding ({formatNPR(outstanding)})
                  </button>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : null} Save Payment
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Wallet size={28} />
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-900">Payment Recorded</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatNPR(Number.parseFloat(amount) || 0)} received from {customer.name}.
            </p>
            <p className="mt-3 text-lg">
              New balance:{" "}
              <strong className={newBalance > 0 ? "text-red-600" : "text-emerald-700"}>
                {newBalance > 0 ? formatNPR(newBalance) : newBalance < 0 ? `Advance ${formatNPR(-newBalance)}` : "Clear — no dues"}
              </strong>
            </p>
            <button type="button" onClick={onClose} className="btn-primary mt-5 w-full">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
