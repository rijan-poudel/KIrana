"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, HandCoins, Loader2, Printer, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CheckoutResult, CustomerOption, PriceMode } from "@/lib/types";
import { formatNPR, formatQuantity, round2 } from "@/lib/format";
import { checkout } from "@/actions/shop-actions";
import Receipt from "./receipt";
import { cn } from "@/lib/utils";

export type CheckoutLine = {
  productId: string;
  name: string;
  quantity: number; // as entered
  unitName: string;
  factor: number;
  baseUnit: string;
  baseQuantity: number;
  unitPrice: number; // per base unit
  subtotal: number;
};

type PaymentChoice = "CASH" | "PARTIAL" | "UDHARO";
type CustomerChoice = "existing" | "new";

const CASH_QUICK_FILLS = [500, 1000, 2000, 5000];

export default function CheckoutDialog({
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
  const [paidText, setPaidText] = useState("");
  const [customerChoice, setCustomerChoice] = useState<CustomerChoice>("existing");
  const [customerId, setCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  // Regulars first so the everyday udharo customer is one tap away.
  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)),
    [customers],
  );

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setChoice("CASH");
    setPaidText(String(total));
    setCustomerChoice(customers.length > 0 ? "existing" : "new");
    setCustomerId(sortedCustomers[0]?.id ?? "");
    setNewName("");
    setNewPhone("");
    setNewAddress("");
    setSubmitting(false);
    setResult(null);
  }, [open, total, customers, sortedCustomers]);

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
    customerChoice === "new" ? newName.trim() || "the new customer" : selectedCustomer?.name ?? "the customer";

  async function submit() {
    if (choice === "PARTIAL" && (paidAmount <= 0 || paidAmount >= total)) {
      toast.error("For a partial payment, enter the cash received now (less than the bill total).");
      return;
    }
    if (needsCustomer && customerChoice === "existing" && !customerId) {
      toast.error("Select a customer for the udharo amount, or create a new one.");
      return;
    }
    if (needsCustomer && customerChoice === "new" && !newName.trim()) {
      toast.error("Enter the new customer's name.");
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
      items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitName: line.unitName })),
      paidAmount,
    });
    setSubmitting(false);

    if (response.ok) {
      setResult(response.data);
      const { totalAmount, paidAmount: paid, dueAmount: due } = response.data;
      toast.success(
        due > 0
          ? `Sale done — ${formatNPR(paid)} cash, ${formatNPR(due)} added to ${customerLabel}'s khata.`
          : `Sale done — ${formatNPR(totalAmount)} cash received.`,
      );
    } else {
      toast.error(response.error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (result) onSuccess();
        else onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg" showCloseButton={!result}>
        {result ? (
          <>
            <div id="receipt-print" className="hidden print:block">
              <Receipt
                data={{
                  id: result.transactionId,
                  createdAt: new Date().toISOString(),
                  type: mode === "wholesale" ? "WHOLESALE" : "RETAIL",
                  totalAmount: result.totalAmount,
                  paidAmount: result.paidAmount,
                  paymentStatus: result.paymentStatus,
                  customerLabel: customerLabel,
                  items: result.lines.map((line) => ({
                    name: line.name,
                    quantity: line.baseQuantity,
                    unitName: "",
                    baseUnit: line.baseUnit,
                    unitPrice: line.unitPrice,
                    subtotal: line.subtotal,
                  })),
                }}
              />
            </div>
            <div className="text-center">
              <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
              <h2 className="mt-2 text-2xl font-bold text-foreground">Sale complete!</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Receipt #{result.transactionId.slice(-8).toUpperCase()}
              </p>

              <div className="mt-4 rounded-xl border border-border p-4 text-left">
                {result.lines.map((line) => (
                  <div key={`${line.productId}-${line.unitName}`} className="flex items-baseline justify-between py-1 text-sm">
                    <span className="min-w-0 text-muted-foreground">
                      {line.quantity === line.baseQuantity
                        ? `${formatNPR(line.unitPrice)} × ${formatQuantity(line.quantity)} ${line.unitName}`
                        : `${line.quantity} ${line.unitName} (${formatQuantity(line.baseQuantity)} ${line.baseUnit})`}
                      {" — "}
                      {line.name}
                    </span>
                    <span className="ml-2 shrink-0 font-semibold text-foreground">{formatNPR(line.subtotal)}</span>
                  </div>
                ))}
                <div className="mt-2 space-y-1 border-t border-dashed border-border pt-2 text-sm">
                  <div className="flex justify-between font-semibold text-foreground">
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
            </div>
            <DialogFooter className="mt-4 gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer /> Print receipt
              </Button>
              <Button autoFocus onClick={() => onSuccess()}>
                New sale (Enter)
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Checkout</DialogTitle>
              <DialogDescription>
                {lines.length} item{lines.length === 1 ? "" : "s"} • {mode === "wholesale" ? "Wholesale" : "Retail"} rate
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 rounded-xl bg-primary p-4 text-primary-foreground">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold opacity-80">Bill total</span>
                <span className="text-3xl font-bold">{formatNPR(total)}</span>
              </div>
            </div>

            <div className="mt-4">
              <Label>Payment</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setChoice("CASH")}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors",
                    choice === "CASH"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Banknote size={18} /> Cash
                </button>
                <button
                  type="button"
                  onClick={() => setChoice("PARTIAL")}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors",
                    choice === "PARTIAL"
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <HandCoins size={18} /> Partial
                </button>
                <button
                  type="button"
                  onClick={() => setChoice("UDHARO")}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors",
                    choice === "UDHARO"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <AlertTriangle size={18} /> Udharo
                </button>
              </div>
            </div>

            {choice === "CASH" && (
              <div className="mt-3">
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Collect <strong>{formatNPR(total)}</strong> cash at the counter and hand over the goods.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CASH_QUICK_FILLS.filter((v) => v < total).map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setChoice("PARTIAL");
                        setPaidText(String(v));
                      }}
                    >
                      {formatNPR(v)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {choice === "PARTIAL" && (
              <div className="mt-3">
                <Label htmlFor="paid-now">Cash received now (rest goes on khata)</Label>
                <Input
                  id="paid-now"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={total}
                  step="0.01"
                  value={paidText}
                  onChange={(e) => setPaidText(e.target.value)}
                  className="text-lg"
                  autoFocus
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Due after this payment: <strong className="text-amber-700">{formatNPR(dueAmount)}</strong>
                </p>
              </div>
            )}

            {choice === "UDHARO" && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                The full {formatNPR(total)} goes on {customerLabel}&apos;s khata. Pick the customer below.
              </p>
            )}

            {needsCustomer && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3">
                <Label>Khata customer ({formatNPR(dueAmount)} on credit)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerChoice("existing")}
                    disabled={customers.length === 0}
                    className={cn(
                      "h-11 rounded-lg border text-sm font-bold transition-colors disabled:opacity-40",
                      customerChoice === "existing"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    Existing customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerChoice("new")}
                    className={cn(
                      "flex h-11 items-center justify-center gap-1 rounded-lg border text-sm font-bold transition-colors",
                      customerChoice === "new"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    <UserPlus size={15} /> New customer
                  </button>
                </div>

                {customerChoice === "existing" ? (
                  <Select value={customerId} onValueChange={(v) => v && setCustomerId(v)}>
                    <SelectTrigger className="mt-3 w-full" aria-label="Select customer">
                      <SelectValue placeholder="Choose a customer" />
                    </SelectTrigger>
                  <SelectContent>
                    {sortedCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.isFavorite ? "★ " : ""}
                        {c.name}
                        {c.currentBalance > 0 ? ` — owes ${formatNPR(c.currentBalance)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                  </Select>
                ) : (
                  <div className="mt-3 space-y-2">
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name *" />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="Phone (optional)"
                        inputMode="tel"
                      />
                      <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Ward / area" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button type="submit" disabled={submitting} className="mt-5 h-14 w-full text-lg">
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {submitting
                ? "Saving…"
                : dueAmount > 0
                  ? `Complete sale — ${formatNPR(total)} (${formatNPR(dueAmount)} udharo)`
                  : `Complete sale — ${formatNPR(total)}`}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

