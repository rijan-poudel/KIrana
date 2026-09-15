"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgePercent, IndianRupee, Loader2, Minus, Plus, Save, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, parseInputNumber, parseOptionalNumber } from "@/components/form-field";
import type { BillDiscount, CustomerOption, ProductCardData, ReportRowData } from "@/lib/types";
import { formatNPR, round2 } from "@/lib/format";
import { editTransaction } from "@/actions/shop-actions";
import CustomerPicker from "../customer-picker";

/** Safe numeric coercion using the parse helper — 0 for invalid/empty input. */
function num(s: string): number {
  const r = parseOptionalNumber(s);
  return "error" in r || r.value === null ? 0 : r.value;
}

/** One editable line of a saved bill, keyed to today's catalog. */
type LineDraft = {
  productId: string;
  name: string;
  baseUnit: string;
  unitName: string;
  factor: number;
  unitPrice: number; // per base unit, today's price
  quantity: number; // in unitName
  soldBase: number; // original base units on the bill — sets the stock ceiling
};

type DiscountKind = "none" | "flat" | "percent";

function unitOptions(product: ProductCardData) {
  return [{ name: product.baseUnit, factor: 1 }, ...product.units.map((u) => ({ name: u.name, factor: u.factor }))];
}

/**
 * Fixes a wrongly-entered bill IN PLACE (same receipt number): edit the
 * quantities / units / customer / bhaansi, and the action reverses the
 * original lines and re-writes the record, adjusting stock and khata by the
 * exact deltas — a cleaner story than void + re-ring-up, and nothing is lost.
 */
export default function EditBillDialog({
  open,
  bill,
  products,
  customers,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  bill: ReportRowData | null;
  products: ProductCardData[];
  customers: CustomerOption[];
  onOpenChange: (next: boolean) => void;
  onSaved: () => void;
}) {
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<DiscountKind>("none");
  const [discountText, setDiscountText] = useState("");
  const [discountNote, setDiscountNote] = useState("");
  const [qtyDraft, setQtyDraft] = useState<{ key: string; value: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ discount?: string }>({});

  const isWholesale = bill?.typeLabel === "WHOLESALE";

  // Populate the form fresh every time the dialog opens.
  useEffect(() => {
    if (!open || !bill) return;
    const draft: LineDraft[] = [];
    for (const item of bill.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      const options = unitOptions(product);
      const unit = options.find((u) => u.name === item.unitName) ?? options[0];
      draft.push({
        productId: product.id,
        name: product.name,
        baseUnit: product.baseUnit,
        unitName: unit.name,
        factor: unit.factor,
        unitPrice: bill.typeLabel === "WHOLESALE" ? product.wholesalePrice : product.retailPrice,
        quantity: round2(item.quantity / unit.factor),
        soldBase: item.quantity,
      });
    }
    setLines(draft);
    setCustomerId(bill.customerId);
    if (bill.discountAmount > 0) {
      setDiscountType("flat");
      setDiscountText(String(bill.discountAmount));
    } else {
      setDiscountType("none");
      setDiscountText("");
    }
    setDiscountNote(bill.discountNote ?? "");
    setQtyDraft(null);
    setSubmitting(false);
    setErrors({});
  }, [open, bill, products]);

  const grossTotal = useMemo(() => round2(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity * l.factor, 0)), [lines]);

  const discountAmount = useMemo(() => {
    if (discountType === "none") return 0;
    const raw = num(discountText);
    if (raw < 0) return 0;
    if (discountType === "percent") return round2((grossTotal * Math.min(raw, 100)) / 100);
    return Math.min(round2(raw), grossTotal);
  }, [discountType, discountText, grossTotal]);

  const newTotal = round2(grossTotal - discountAmount);
  const alreadyPaid = bill?.paidAmount ?? 0;
  const newPaid = Math.min(alreadyPaid, newTotal);
  const newDue = round2(newTotal - newPaid);
  const anyDraftInvalid =
    lines.length === 0 || lines.some((l) => !Number.isFinite(l.quantity) || l.quantity <= 0);
  const overStockCount = lines.filter((l) => {
    const product = products.find((p) => p.id === l.productId);
    if (!product) return false;
    return l.quantity * l.factor > product.stockQuantity + l.soldBase;
  }).length;

  function setLineQuantity(line: LineDraft, value: number) {
    setLines((prev) => prev.map((l) => (l === line ? { ...l, quantity: value } : l)));
  }

  function setLineUnit(line: LineDraft, unitName: string) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) return;
    const target = unitOptions(product).find((u) => u.name === unitName);
    if (!target) return;
    setLines((prev) =>
      prev.map((l) =>
        l === line
          ? { ...l, unitName: target.name, factor: target.factor, quantity: round2((l.quantity * l.factor) / target.factor) }
          : l,
      ),
    );
  }

  async function save() {
    if (!bill) return;
    if (anyDraftInvalid) {
      toast.error("Every line needs a quantity greater than zero.");
      return;
    }
    if (overStockCount > 0) {
      toast.error("One or more lines go above what's available on the shelf — reduce the quantity.");
      return;
    }
    const dErr: { discount?: string } = {};
    let discountValue = 0;
    if (discountType !== "none" && discountText.trim() !== "") {
      const parsed = parseInputNumber(discountText);
      if ("error" in parsed) dErr.discount = parsed.error;
      else if (parsed.value < 0) dErr.discount = "Cannot be negative.";
      else if (discountType === "percent" && parsed.value > 100) dErr.discount = "Percent cannot exceed 100.";
      else discountValue = discountType === "percent" ? Math.min(parsed.value, 100) : parsed.value;
    }
    if (dErr.discount) {
      setErrors(dErr);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const discount: BillDiscount | null =
      discountType === "none" || discountAmount <= 0
        ? null
        : {
            type: discountType === "percent" ? "percent" : "flat",
            value: discountValue,
            note: discountNote.trim() || null,
          };
    const response = await editTransaction({
      transactionId: bill.id,
      items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitName: l.unitName })),
      customerId: customerId,
      discount,
    });
    setSubmitting(false);
    if (response.ok) {
      toast.success(
        `Bill #${bill.id.slice(-8).toUpperCase()} corrected — ${formatNPR(response.data.totalAmount)}${newDue > 0 ? `, ${formatNPR(newDue)} on khata` : " settled"}.`,
      );
      onSaved();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit bill #{bill?.id.slice(-8).toUpperCase() ?? ""}</DialogTitle>
          <DialogDescription>
            Fix the lines below — the same receipt number is kept, and stock + khata adjust by exactly the difference.
          </DialogDescription>
        </DialogHeader>

        {bill && (
          <div className="space-y-4">
            <FormField label={`Lines (${isWholesale ? "wholesale" : "retail"} rate)`}>
              <div className="space-y-2">
                {lines.map((line) => {
                  const product = products.find((p) => p.id === line.productId);
                  const ceiling = product ? product.stockQuantity + line.soldBase : Infinity;
                  const baseQty = round2(line.quantity * line.factor);
                  const overCeiling = baseQty > ceiling;
                  const lineKey = line.productId;
                  return (
                    <div
                      key={lineKey}
                      className="rounded-lg border border-border/70 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{line.name}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => setLines((prev) => prev.filter((l) => l !== line))}
                          className="text-muted-foreground/60 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex shrink-0 items-center rounded-lg border border-input">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Decrease ${line.name}`}
                            onClick={() =>
                              setLineQuantity(line, line.quantity > 0 ? round2(line.quantity - 1) : 0)
                            }
                            className="size-9 rounded-l-lg text-muted-foreground"
                          >
                            <Minus size={14} />
                          </Button>
                          <input
                            value={qtyDraft?.key === lineKey ? qtyDraft.value : String(line.quantity)}
                            inputMode="decimal"
                            aria-label={`Quantity of ${line.name} in ${line.unitName}`}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setQtyDraft({ key: lineKey, value: raw });
                              const value = num(raw);
                              if (value > 0) setLineQuantity(line, value);
                              else setLineQuantity(line, 0);
                            }}
                            onFocus={(e) => e.currentTarget.select()}
                            onBlur={() => setQtyDraft(null)}
                            className="h-9 w-14 border-x border-input text-center text-sm font-semibold text-foreground focus:outline-none"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Increase ${line.name}`}
                            onClick={() => setLineQuantity(line, line.quantity + 1)}
                            className="size-9 rounded-r-lg text-muted-foreground"
                          >
                            <Plus size={14} />
                          </Button>
                        </div>
                        <Select value={line.unitName} onValueChange={(v) => v && setLineUnit(line, v)}>
                          <SelectTrigger size="sm" className="w-[110px]" aria-label={`Unit for ${line.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {product &&
                              unitOptions(product).map((u) => (
                                <SelectItem key={u.name} value={u.name}>
                                  {u.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <div className="min-w-0 flex-1 text-right">
                          <div className="text-sm font-bold text-foreground">
                            {formatNPR(round2(baseQty * line.unitPrice))}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {line.factor !== 1 ? `${formatNPR(line.unitPrice)}/${line.baseUnit} = ${round2(baseQty)} ${line.baseUnit}` : `${formatNPR(line.unitPrice)}/${line.baseUnit}`}
                            {overCeiling ? " • exceeds shelf!" : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {lines.length === 0 && (
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                    All lines removed — a bill needs at least one.
                  </p>
                )}
              </div>
            </FormField>

            <FormField label="Customer">
              <CustomerPicker
                customers={customers}
                selectedId={customerId}
                onSelect={(id) => setCustomerId(id)}
                allowClear
                label="Search or pick the customer"
                popoverWidth="100%"
              />
            </FormField>

            <FormField label="Discount (bhaansi)" error={errors.discount}>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={discountType === "none" ? "secondary" : "outline"}
                  size="lg"
                  aria-pressed={discountType === "none"}
                  onClick={() => {
                    setDiscountType("none");
                    setDiscountText("");
                    setErrors({});
                  }}
                  className="h-11 justify-center gap-1 text-sm font-bold"
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
                    setErrors({});
                  }}
                  className="h-11 justify-center gap-1 text-sm font-bold"
                >
                  <IndianRupee size={15} /> Rs.
                </Button>
                <Button
                  type="button"
                  variant={discountType === "percent" ? "default" : "outline"}
                  size="lg"
                  aria-pressed={discountType === "percent"}
                  onClick={() => {
                    setDiscountType("percent");
                    setErrors({});
                  }}
                  className="h-11 justify-center gap-1 text-sm font-bold"
                >
                  <BadgePercent size={15} /> %
                </Button>
              </div>
              {discountType !== "none" && (
                <div className="space-y-2">
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
                        setErrors({});
                      }}
                      placeholder={discountType === "percent" ? "e.g. 5" : "e.g. 50"}
                      aria-label={discountType === "percent" ? "Discount percent" : "Discount in rupees"}
                      aria-invalid={!!errors.discount}
                    />
                    <span className="w-20 shrink-0 text-right text-xs font-semibold text-muted-foreground">
                      −{formatNPR(discountAmount)}
                    </span>
                  </div>
                  {errors.discount && (
                    <p role="alert" className="text-sm font-normal text-destructive">
                      {errors.discount}
                    </p>
                  )}
                  <Input
                    value={discountNote}
                    onChange={(e) => setDiscountNote(e.target.value)}
                    placeholder="Note (optional) — regular customer, damaged pack…"
                    aria-label="Discount note"
                  />
                </div>
              )}
            </FormField>

            <div className="rounded-xl bg-primary p-4 text-sm text-primary-foreground">
              <div className="flex items-baseline justify-between">
                <span>New total</span>
                <span className="text-3xl font-bold">{formatNPR(newTotal)}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs opacity-80">
                <span>Was paid on the original bill: {formatNPR(alreadyPaid)}</span>
                {newDue > 0 ? <span>{formatNPR(newDue)} on khata</span> : <span>settled</span>}
              </div>
              {newTotal < alreadyPaid && (
                <p className="mt-2 rounded-lg bg-primary-foreground/10 px-2 py-1.5 text-[11px]">
                  The bill is now smaller than the {formatNPR(alreadyPaid)} already received — the{" "}
                  {formatNPR(alreadyPaid - newTotal)} difference was settled separately.
                </p>
              )}
              {overStockCount > 0 && (
                <p className="mt-2 rounded-lg bg-red-500/20 px-2 py-1.5 text-[11px] font-semibold">
                  A line goes above what's on the shelf after this correction — lower it before saving.
                </p>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={submitting || anyDraftInvalid}>
                {submitting ? <Loader2 className="animate-spin" /> : <Save />} Save changes
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}