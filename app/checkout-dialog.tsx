"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Banknote,
  CheckCircle2,
  HandCoins,
  IndianRupee,
  Loader2,
  Printer,
  UserPlus,
} from "lucide-react";
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
import { FormField, parseInputNumber, parseOptionalNumber } from "@/components/form-field";
import type { CheckoutResult, CustomerOption, PriceMode } from "@/lib/types";
import { formatNPR, formatQuantity, round2 } from "@/lib/format";
import { checkout } from "@/actions/shop-actions";
import Receipt from "./receipt";
import CustomerPicker from "./customer-picker";
import { cn } from "@/lib/utils";

/** Safe numeric coercion using the parse helper — 0 for invalid/empty input. */
function num(s: string): number {
  const r = parseOptionalNumber(s);
  return "error" in r || r.value === null ? 0 : r.value;
}

export type CheckoutLine = {
  productId: string;
  name: string;
  quantity: number; // as entered
  unitName: string;
  factor: number;
  baseUnit: string;
  baseQuantity: number;
  unitPrice: number; // per base unit (after any counter rate override)
  subtotal: number;
  rate: number; // per chosen unit, exactly as shown on the bill
  lineDiscount: number; // per-line bhaansi in rupees
};

type PaymentChoice = "CASH" | "PARTIAL" | "UDHARO";
type CustomerChoice = "existing" | "new";
type DiscountKind = "none" | "flat" | "percent";

const CASH_QUICK_FILLS = [500, 1000, 2000, 5000];

export default function CheckoutDialog({
  open,
  mode,
  total,
  lines,
  customers,
  presetCustomerId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  mode: PriceMode;
  total: number;
  lines: CheckoutLine[];
  customers: CustomerOption[];
  presetCustomerId?: string | null;
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
  const [discountType, setDiscountType] = useState<DiscountKind>("none");
  const [discountText, setDiscountText] = useState("");
  const [discountNote, setDiscountNote] = useState("");
  const [errors, setErrors] = useState<{ discount?: string; paid?: string }>({});

  // Fresh state every time the modal opens. Gated on the closed→open transition:
  // server actions re-validate the page while the dialog is open, which hands the
  // monkey a *fresh* `customers` array and would otherwise reset the form and wipe
  // a completed receipt mid-display.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setChoice("CASH");
    setPaidText(String(total));
    setDiscountType("none");
    setDiscountText("");
    setDiscountNote("");
    setCustomerChoice(customers.length > 0 ? "existing" : "new");
    // A customer pinned on the counter carries straight into checkout.
    setCustomerId(presetCustomerId && customers.some((c) => c.id === presetCustomerId) ? presetCustomerId : "");
    setNewName("");
    setNewPhone("");
    setNewAddress("");
    setSubmitting(false);
    setResult(null);
  }, [open, total, customers, presetCustomerId]);

  /** Rupees taken off the bill — from a flat amount or a % of the gross. */
  const discountAmount = useMemo(() => {
    if (discountType === "none") return 0;
    const raw = num(discountText);
    if (raw < 0) return 0;
    if (discountType === "percent") return round2((total * Math.min(raw, 100)) / 100);
    return Math.min(round2(raw), total);
  }, [discountType, discountText, total]);

  const discountedTotal = useMemo(() => round2(total - discountAmount), [total, discountAmount]);

  const paidAmount = useMemo(() => {
    if (choice === "CASH") return discountedTotal;
    if (choice === "UDHARO") return 0;
    const value = num(paidText);
    if (value < 0) return 0;
    return Math.min(value, discountedTotal);
  }, [choice, paidText, discountedTotal]);

  const dueAmount = round2(discountedTotal - paidAmount);
  const needsCustomer = choice === "UDHARO" || (choice === "PARTIAL" && dueAmount > 0);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const customerLabel =
    customerChoice === "new" ? newName.trim() || "the new customer" : selectedCustomer?.name ?? "the customer";

  /** Validate discount + paid fields; returns null when everything is fine. */
  function validate(): boolean {
    const errs: { discount?: string; paid?: string } = {};
    if (discountType !== "none" && discountText.trim() !== "") {
      const parsed = parseInputNumber(discountText);
      if ("error" in parsed) errs.discount = parsed.error;
      else if (parsed.value < 0) errs.discount = "Cannot be negative.";
      else if (discountType === "percent" && parsed.value > 100) errs.discount = "Percent cannot exceed 100.";
    }
    if (choice === "PARTIAL" && paidText.trim() !== "") {
      const parsed = parseInputNumber(paidText);
      if ("error" in parsed) errs.paid = parsed.error;
      else if (parsed.value < 0) errs.paid = "Cannot be negative.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    if (choice === "PARTIAL" && (paidAmount <= 0 || paidAmount >= discountedTotal)) {
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
    // A customer pinned on the counter travels with the bill even on a cash
    // sale, so the regular's purchases build up history in the khata.
    const customerAttached = customerChoice === "existing" && customerId !== "" ? customerId : null;
    const response = await checkout({
      type: mode === "wholesale" ? "WHOLESALE" : "RETAIL",
      customerId: customerAttached,
      newCustomer:
        needsCustomer && customerChoice === "new"
          ? { name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() }
          : null,
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitName: line.unitName,
        // The rate shown on the counter bill is the contract — send it so the
        // ledger charges exactly what the shopkeeper and customer agreed on.
        unitPrice: line.unitPrice,
        discount: line.lineDiscount > 0 ? line.lineDiscount : undefined,
      })),
      paidAmount,
      discount:
        discountAmount > 0
          ? {
              type: discountType === "percent" ? "percent" : "flat",
              // The voidable clamp already depends on this value — keep the
              // server's 0–100% guard in sync with what the dialog showed.
              value:
                discountType === "percent"
                  ? Math.min(num(discountText), 100)
                  : num(discountText),
              note: discountNote.trim() || null,
            }
          : null,
    });
    setSubmitting(false);

    if (response.ok) {
      setResult(response.data);
      const { totalAmount, paidAmount: paid, dueAmount: due } = response.data;
      toast.success(
        due > 0
          ? `Sale done — ${formatNPR(paid)} cash, ${formatNPR(due)} added to ${customerLabel}'s khata.`
          : customerAttached
            ? `Sale done — ${formatNPR(totalAmount)} cash received for ${customerLabel}.`
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
                  discountAmount: result.discountAmount,
                  discountNote: result.discountNote,
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
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 shadow-lg shadow-emerald-600/15">
                <CheckCircle2 size={44} className="text-emerald-600" />
              </span>
              <h2 className="mt-3 text-2xl font-bold text-foreground">Sale complete!</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Receipt #{result.transactionId.slice(-8).toUpperCase()}
              </p>

              <div className="mt-4 rounded-2xl border-2 border-faded-gray bg-card p-4 text-left">
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
                  {result.discountAmount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Discount{result.discountNote ? ` (${result.discountNote})` : ""}</span>
                      <span>−{formatNPR(result.discountAmount)}</span>
                    </div>
                  )}
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
                New sale <span className="font-normal opacity-70">(Enter)</span>
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

            <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[#46a302] p-4 text-primary-foreground shadow-lg shadow-primary/25">
              {discountAmount > 0 && (
                <div className="flex items-baseline justify-between text-sm opacity-75">
                  <span>Bill total</span>
                  <span className="line-through">{formatNPR(total)}</span>
                </div>
              )}
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="text-sm font-semibold opacity-80">
                  {discountAmount > 0 ? "With discount" : "Bill total"}
                </span>
                <span className="font-heading text-3xl font-bold tracking-tight">{formatNPR(discountedTotal)}</span>
              </div>
            </div>

            <div className="mt-4">
              <FormField label="Discount (bhaansi)">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={discountType === "none" ? "secondary" : "outline"}
                    size="lg"
                    aria-pressed={discountType === "none"}
                    onClick={() => {
                      setDiscountType("none");
                      setDiscountText("");
                      setErrors((prev) => ({ ...prev, discount: "" }));
                    }}
                    className="h-11 flex-col gap-0 text-sm font-bold"
                  >
                    None
                  </Button>
                  <Button
                    type="button"
                    variant={discountType === "flat" ? "default" : "outline"}
                    size="lg"
                    aria-pressed={discountType === "flat"}
                    onClick={() => {
                      setDiscountType("flat");
                      setErrors((prev) => ({ ...prev, discount: "" }));
                    }}
                    className={cn(
                      "h-11 flex-col gap-0 text-sm font-bold",
                      discountType === "flat" && "border-primary text-primary-foreground",
                    )}
                  >
                    <IndianRupee size={15} /> Rs. off
                  </Button>
                  <Button
                    type="button"
                    variant={discountType === "percent" ? "default" : "outline"}
                    size="lg"
                    aria-pressed={discountType === "percent"}
                    onClick={() => {
                      setDiscountType("percent");
                      setErrors((prev) => ({ ...prev, discount: "" }));
                    }}
                    className={cn(
                      "h-11 flex-col gap-0 text-sm font-bold",
                      discountType === "percent" && "border-primary text-primary-foreground",
                    )}
                  >
                    <BadgePercent size={15} /> % off
                  </Button>
                </div>

                {discountType !== "none" && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={discountType === "percent" ? 100 : undefined}
                        step="any"
                        value={discountText}
                        onChange={(e) => {
                          setDiscountText(e.target.value);
                          setErrors((prev) => ({ ...prev, discount: "" }));
                        }}
                        placeholder={discountType === "percent" ? "e.g. 5" : "e.g. 50"}
                        aria-label={discountType === "percent" ? "Discount percent" : "Discount in rupees"}
                        aria-invalid={!!errors.discount}
                        className="flex-1"
                      />
                      <span className="w-20 shrink-0 text-right text-xs font-semibold text-muted-foreground">
                        {discountType === "percent" ? `% off → −${formatNPR(discountAmount)}` : `Rs. −${formatNPR(discountAmount)}`}
                      </span>
                    </div>
                    {errors.discount && <p role="alert" className="text-sm font-normal text-destructive">{errors.discount}</p>}
                    <Input
                      value={discountNote}
                      onChange={(e) => setDiscountNote(e.target.value)}
                      placeholder="Note (optional) — regular customer, damaged pack…"
                      aria-label="Discount note"
                    />
                  </div>
                )}
              </FormField>
            </div>

            <div className="mt-4">
              <FormField label="Payment">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={choice === "CASH" ? "outline" : "ghost"}
                    size="lg"
                    aria-pressed={choice === "CASH"}
                    onClick={() => setChoice("CASH")}
                    className={cn(
                      "relative h-16 flex-col gap-1 text-sm font-bold",
                      choice === "CASH"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-md shadow-emerald-600/15 hover:bg-emerald-50"
                        : "text-muted-foreground",
                    )}
                  >
                    {choice === "CASH" && (
                      <CheckCircle2 size={15} className="absolute top-1.5 right-1.5 text-emerald-600" />
                    )}
                    <Banknote size={18} /> Cash
                  </Button>
                  <Button
                    type="button"
                    variant={choice === "PARTIAL" ? "outline" : "ghost"}
                    size="lg"
                    aria-pressed={choice === "PARTIAL"}
                    onClick={() => setChoice("PARTIAL")}
                    className={cn(
                      "relative h-16 flex-col gap-1 text-sm font-bold",
                      choice === "PARTIAL"
                        ? "border-amber-500 bg-amber-50 text-amber-800 shadow-md shadow-amber-500/15 hover:bg-amber-50"
                        : "text-muted-foreground",
                    )}
                  >
                    {choice === "PARTIAL" && (
                      <CheckCircle2 size={15} className="absolute top-1.5 right-1.5 text-amber-600" />
                    )}
                    <HandCoins size={18} /> Partial
                  </Button>
                  <Button
                    type="button"
                    variant={choice === "UDHARO" ? "outline" : "ghost"}
                    size="lg"
                    aria-pressed={choice === "UDHARO"}
                    onClick={() => setChoice("UDHARO")}
                    className={cn(
                      "relative h-16 flex-col gap-1 text-sm font-bold",
                      choice === "UDHARO"
                        ? "border-red-500 bg-red-50 text-red-700 shadow-md shadow-red-500/15 hover:bg-red-50"
                        : "text-muted-foreground",
                    )}
                  >
                    {choice === "UDHARO" && (
                      <CheckCircle2 size={15} className="absolute top-1.5 right-1.5 text-red-600" />
                    )}
                    <AlertTriangle size={18} /> Udharo
                  </Button>
                </div>
              </FormField>
            </div>

            {choice === "CASH" && (
              <div className="mt-3">
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Collect <strong>{formatNPR(discountedTotal)}</strong> cash at the counter and hand over the goods.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CASH_QUICK_FILLS.filter((v) => v < discountedTotal).map((v) => (
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
                <FormField label="Cash received now (rest goes on khata)" htmlFor="paid-now" error={errors.paid}>
                  <Input
                    id="paid-now"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={discountedTotal}
                    step="0.01"
                    value={paidText}
                    onChange={(e) => {
                      setPaidText(e.target.value);
                      setErrors((prev) => ({ ...prev, paid: "" }));
                    }}
                    className="text-lg"
                    autoFocus
                    aria-invalid={!!errors.paid}
                  />
                </FormField>
                <p className="mt-1 text-sm text-muted-foreground">
                  Due after this payment: <strong className="text-amber-700">{formatNPR(dueAmount)}</strong>
                </p>
              </div>
            )}

            {choice === "UDHARO" && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                The full {formatNPR(discountedTotal)} goes on {customerLabel}&apos;s khata. Pick the customer below.
              </p>
            )}

            {needsCustomer && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-3">
                <FormField label={`Khata customer (${formatNPR(dueAmount)} on credit)`}>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={customerChoice === "existing" ? "default" : "outline"}
                      size="lg"
                      disabled={customers.length === 0}
                      aria-pressed={customerChoice === "existing"}
                      onClick={() => setCustomerChoice("existing")}
                      className="h-11 text-sm font-bold"
                    >
                      Existing customer
                    </Button>
                    <Button
                      type="button"
                      variant={customerChoice === "new" ? "default" : "outline"}
                      size="lg"
                      aria-pressed={customerChoice === "new"}
                      onClick={() => setCustomerChoice("new")}
                      className="h-11 text-sm font-bold"
                    >
                      <UserPlus size={15} /> New customer
                    </Button>
                  </div>
                </FormField>

                {customerChoice === "existing" ? (
                  <div className="mt-3">
                    <CustomerPicker
                      customers={customers}
                      selectedId={customerId || null}
                      onSelect={(id) => setCustomerId(id ?? "")}
                      allowClear
                      label="Search or pick the khata customer"
                      popoverWidth="100%"
                    />
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <FormField label="Customer name *" error={newName.trim() ? undefined : undefined}>
                      <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name *" />
                    </FormField>
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

            {!needsCustomer && customerChoice === "existing" && customerId !== "" && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-foreground">
                    Selling to <span className="font-bold">{selectedCustomer?.name ?? "the selected customer"}</span>
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setCustomerId("")}
                    className="px-0 text-xs font-medium text-red-600"
                  >
                    Remove from bill
                  </Button>
                </div>
                {selectedCustomer?.currentBalance != null && selectedCustomer.currentBalance > 0 && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    They already owe {formatNPR(selectedCustomer.currentBalance)} on khata — remind at pick-up.
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  This sale will be recorded in {selectedCustomer?.name ?? "their"} khata history.
                </p>
                <div className="mt-2">
                  <CustomerPicker
                    customers={customers}
                    selectedId={customerId || null}
                    onSelect={(id) => setCustomerId(id ?? "")}
                    allowClear
                    popoverWidth="100%"
                  />
                </div>
              </div>
            )}

            <Button type="submit" disabled={submitting} className="mt-5 h-14 w-full text-lg">
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {submitting
                ? "Saving…"
                : dueAmount > 0
                  ? `Complete sale — ${formatNPR(discountedTotal)} (${formatNPR(dueAmount)} udharo)`
                  : `Complete sale — ${formatNPR(discountedTotal)}`}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

