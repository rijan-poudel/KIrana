"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronLeft, Loader2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Button04 } from "@/components/button-04";
import { Badge } from "@/components/ui/badge";
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
import { BASE_UNITS, DEFAULT_LOW_STOCK_AT } from "@/lib/constants";
import { formatNPR, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createProduct } from "@/actions/shop-actions";
import type { ProductCardData, ProductInput, SellAs } from "@/lib/types";

/** Safe numeric coercion using the parse helper — returns 0 for invalid/empty input. */
function num(s: string): number {
  const r = parseOptionalNumber(s);
  return "error" in r || r.value === null ? 0 : r.value;
}

/**
 * Quick product creation dialog — opens when a barcode is scanned that isn't
 * yet in the catalog.  Designed for mid-scan speed: the cashier has a customer
 * standing there.
 *
 * Two-step forward-only flow:
 *   1. Details  – name, sold-to, pricing via cost + margin, base unit, stock.
 *   2. Preview  – summary card + "Add to current bill" toggle + save.
 */
export default function ProductQuickAddDialog({
  open,
  barcode,
  existingCategories,
  onCreated,
  onCancel,
  resumeScan,
}: {
  open: boolean;
  barcode: string;
  existingCategories: string[];
  /** Called once the product is persisted — the id is already live in the DB. */
  onCreated: (product: ProductCardData, addToBill: boolean) => void;
  onCancel: () => void;
  /** If true, the counter reopens the camera dialog after we close. */
  resumeScan: boolean;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ── Detail fields ──────────────────────────────────────── */
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [sellAs, setSellAs] = useState<SellAs>("BOTH");
  const [baseUnit, setBaseUnit] = useState("pcs");
  const [costStr, setCostStr] = useState("");
  const [marginStr, setMarginStr] = useState("25"); // common Nepali grocery markup
  const [retailStr, setRetailStr] = useState("");
  const [wholesaleStr, setWholesaleStr] = useState("");
  const [retailTouched, setRetailTouched] = useState(false);
  const [wholesaleTouched, setWholesaleTouched] = useState(false);
  const [openingStock, setOpeningStock] = useState("1");
  const [categoryOpen, setCategoryOpen] = useState(false);

  /* ── Derived pricing ────────────────────────────────────── */
  const cost = parseInputNumber(costStr);
  const margin = parseInputNumber(marginStr);
  const costValid = "value" in cost;
  const marginValid = "value" in margin;

  // Auto-compute prices from cost + margin when the relevant field is still
  // machine-controlled (not manually touched).
  useEffect(() => {
    if (!costValid || !marginValid) return;
    const base = round2(cost.value * (1 + margin.value / 100));
    if (!retailTouched) setRetailStr(String(round2(base)));
    if (!wholesaleTouched) setWholesaleStr(String(round2(base)));
  }, [costStr, marginStr, costValid, marginValid, retailTouched, wholesaleTouched]);

  // If the cost is cleared, re-allow auto-fill on next entry.
  useEffect(() => {
    if (!costValid) {
      setRetailTouched(false);
      setWholesaleTouched(false);
    }
  }, [costValid]);

  /* ── Reset on open ──────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setBusy(false);
    setErrors({});
    setName("");
    setCategory("");
    setSellAs("BOTH");
    setBaseUnit("pcs");
    setCostStr("");
    setMarginStr("25");
    setRetailStr("");
    setWholesaleStr("");
    setRetailTouched(false);
    setWholesaleTouched(false);
    setOpeningStock("1");
    setCategoryOpen(false);
  }, [open, barcode]);

  useEffect(() => {
    if (step === 1 && open) {
      // Wait for dialog to mount, then focus name
      const t = setTimeout(() => nameRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step, open]);

  /* ── Computed values for preview ─────────────────────────── */
  const openingStockNum = num(openingStock);
  const retailPrice = num(retailStr);
  const wholesalePrice = num(wholesaleStr);
  const costPrice = costValid ? cost.value : 0;

  /* ── Validation ─────────────────────────────────────────── */
  function validateStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required — what is this product called?";

    if (sellAs !== "WHOLESALE") {
      const rp = parseInputNumber(retailStr);
      if ("error" in rp) errs.retail = "Enter the retail price.";
      else if (rp.value < 0) errs.retail = "Price can't be negative.";
      else if (rp.value === 0 && sellAs === "BOTH") errs.retail = "Enter a retail price (or switch to Wholesale only).";
    }

    if (sellAs !== "RETAIL") {
      const wp = parseInputNumber(wholesaleStr);
      if ("error" in wp) errs.wholesale = "Enter the wholesale price.";
      else if (wp.value < 0) errs.wholesale = "Price can't be negative.";
      else if (wp.value === 0 && sellAs === "BOTH") errs.wholesale = "Enter a wholesale price (or switch to Retail only).";
    }

    if (sellAs === "RETAIL") {
      const wp = parseInputNumber(wholesaleStr);
      if ("value" in wp && wp.value > 0) {
        // Retail-only but a wholesale price was typed — the server will
        // auto-promote to BOTH, so warn the user early.
        errs.wholesale = "Wholesale price entered — this will be sold to both.";
      }
    }
    if (sellAs === "WHOLESALE") {
      const rp = parseInputNumber(retailStr);
      if ("value" in rp && rp.value > 0) {
        errs.retail = "Retail price entered — this will be sold to both.";
      }
    }

    if (costValid && marginValid && cost.value > 0 && margin.value > 0) {
      // cost + margin is the primary path — let it override a manual price
      // that's zero when sellAs = BOTH, since the user probably means to use
      // the formula.
      delete errs.retail;
      delete errs.wholesale;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goStep2() {
    if (!validateStep1()) return;
    setStep(2);
  }

  /* ── Submit ─────────────────────────────────────────────── */
  async function submit(addToBill: boolean) {
    setBusy(true);
    const input: ProductInput = {
      name: name.trim(),
      category: (category.trim() || "General").trim(),
      barcode,
      retailPrice: sellAs !== "WHOLESALE" ? num(retailStr) : 0,
      wholesalePrice: sellAs !== "RETAIL" ? num(wholesaleStr) : 0,
      costPrice: costValid ? cost.value : 0,
      sellAs,
      baseUnit,
      lowStockAt: DEFAULT_LOW_STOCK_AT,
      openingStock: openingStockNum,
      units: [],
    };
    const result = await createProduct(input);
    setBusy(false);
    if (result.ok) {
      toast.success(`${name.trim()} added to stock.`);
      onCreated(
        {
          id: result.data.id,
          name: name.trim(),
          category: category.trim() || "General",
          barcode,
          retailPrice: sellAs !== "WHOLESALE" ? num(retailStr) : 0,
          wholesalePrice: sellAs !== "RETAIL" ? num(wholesaleStr) : 0,
          costPrice: costValid ? cost.value : 0,
          sellAs,
          stockQuantity: openingStockNum,
          baseUnit,
          lowStockAt: DEFAULT_LOW_STOCK_AT,
          manufacturingDate: null,
          expiryDate: null,
          units: [],
        },
        addToBill,
      );
    } else {
      toast.error(result.error);
      // If the server complains about barcode or prices, keep the user on the
      // preview so they can adjust without re-entering everything.
    }
  }

  const unitLabel = baseUnit === "pcs" ? "pcs" : baseUnit;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode size={18} />
            New item — not in stock
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Enter the details once; next time this barcode is scanned it's instant."
              : "Check everything looks right, then save."}
          </DialogDescription>
        </DialogHeader>

        {/* Barcode chip */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2.5 py-1 font-mono text-xs font-semibold text-foreground">
            <ScanBarcode size={13} className="text-muted-foreground" />
            {barcode}
          </span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                step === 1 ? "bg-primary" : "bg-emerald-500",
              )}
            />
            <span className="text-xs text-muted-foreground">{step === 1 ? "Details" : "Review"}</span>
          </div>
        </div>

        {step === 1 ? (
          <DetailsStep
            nameRef={nameRef}
            name={name}
            setName={setName}
            category={category}
            setCategory={setCategory}
            categoryOpen={categoryOpen}
            setCategoryOpen={setCategoryOpen}
            existingCategories={existingCategories}
            sellAs={sellAs}
            setSellAs={setSellAs}
            baseUnit={baseUnit}
            setBaseUnit={setBaseUnit}
            costStr={costStr}
            setCostStr={setCostStr}
            marginStr={marginStr}
            setMarginStr={setMarginStr}
            retailStr={retailStr}
            setRetailStr={setRetailStr}
            wholesaleStr={wholesaleStr}
            setWholesaleStr={setWholesaleStr}
            retailTouched={retailTouched}
            setRetailTouched={setRetailTouched}
            wholesaleTouched={wholesaleTouched}
            setWholesaleTouched={setWholesaleTouched}
            openingStock={openingStock}
            setOpeningStock={setOpeningStock}
            errors={errors}
            setErrors={setErrors}
            unitLabel={unitLabel}
            costValid={costValid}
            marginValid={marginValid}
            cost={cost}
            margin={margin}
          />
        ) : (
          <PreviewStep
            name={name.trim()}
            category={category.trim() || "General"}
            barcode={barcode}
            sellAs={sellAs}
            baseUnit={baseUnit}
            costPrice={costPrice}
            retailPrice={
              sellAs !== "WHOLESALE" ? num(retailStr) : 0
            }
            wholesalePrice={
              sellAs !== "RETAIL" ? num(wholesaleStr) : 0
            }
            openingStock={openingStockNum}
            unitLabel={unitLabel}
          />
        )}

        <DialogFooter className="!justify-between gap-2">
          {step === 2 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={busy}
            >
              <ChevronLeft /> Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </Button>
          )}

          {step === 1 ? (
            <Button
              type="button"
              onClick={goStep2}
              className="shadow-md shadow-primary/25"
            >
              Review <ArrowRight size={15} />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => submit(false)}
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                Save only
              </Button>
              <Button
                type="button"
                onClick={() => submit(true)}
                disabled={busy}
                className="shadow-md shadow-primary/25"
              >
                {busy ? <Loader2 className="animate-spin" /> : (
                  <CheckCircle2 size={15} />
                )}
                Save &amp; add to bill
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Step 1: Details                                               */
/* ────────────────────────────────────────────────────────────── */

function DetailsStep({
  nameRef,
  name,
  setName,
  category,
  setCategory,
  categoryOpen,
  setCategoryOpen,
  existingCategories,
  sellAs,
  setSellAs,
  baseUnit,
  setBaseUnit,
  costStr,
  setCostStr,
  marginStr,
  setMarginStr,
  retailStr,
  setRetailStr,
  wholesaleStr,
  setWholesaleStr,
  retailTouched,
  setRetailTouched,
  wholesaleTouched,
  setWholesaleTouched,
  openingStock,
  setOpeningStock,
  errors,
  setErrors,
  unitLabel,
  costValid,
  marginValid,
  cost,
  margin,
}: {
  nameRef: React.RefObject<HTMLInputElement | null>;
  name: string;
  setName: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  categoryOpen: boolean;
  setCategoryOpen: (v: boolean) => void;
  existingCategories: string[];
  sellAs: SellAs;
  setSellAs: (v: SellAs) => void;
  baseUnit: string;
  setBaseUnit: (v: string) => void;
  costStr: string;
  setCostStr: (v: string) => void;
  marginStr: string;
  setMarginStr: (v: string) => void;
  retailStr: string;
  setRetailStr: (v: string) => void;
  wholesaleStr: string;
  setWholesaleStr: (v: string) => void;
  retailTouched: boolean;
  setRetailTouched: (v: boolean) => void;
  wholesaleTouched: boolean;
  setWholesaleTouched: (v: boolean) => void;
  openingStock: string;
  setOpeningStock: (v: string) => void;
  errors: Record<string, string>;
  setErrors: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  unitLabel: string;
  costValid: boolean;
  marginValid: boolean;
  cost: { value: number } | { error: string };
  margin: { value: number } | { error: string };
}) {
  const autoPrice =
    costValid && marginValid && !("error" in cost) && !("error" in margin)
      ? round2(cost.value * (1 + margin.value / 100))
      : null;

  return (
    <div className="space-y-4">
      {/* ── Name (most important — large, prominent) ────────────── */}
      <FormField label={<span className="text-base font-semibold">Product name</span>} htmlFor="q-name" error={errors.name}>
        <Input
          id="q-name"
          ref={nameRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((prev) => ({ ...prev, name: "" }));
          }}
          placeholder="What is the product?"
          className="h-12 text-base"
          aria-invalid={!!errors.name}
          required
        />
      </FormField>

      {/* ── Sold to (key business rule — must be quick) ──────────── */}
      <FormField label="Sold to" hint="Who is this product for?">
        <div
          role="radiogroup"
          aria-label="Sold to"
          className="flex rounded-lg border border-border bg-muted/40 p-0.5"
        >
          {([
            { value: "RETAIL", label: "Retail only", short: "Retail" },
            { value: "BOTH", label: "Both", short: "Both" },
            { value: "WHOLESALE", label: "Wholesale only", short: "Wholesale" },
          ] as const).map((opt) => (
            <Button04
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={sellAs === opt.value}
              onClick={() => setSellAs(opt.value)}
              className="flex-1 rounded-md px-2 py-0 text-sm font-extrabold [--btn-radius:8px] h-9"
            >
              <span className="hidden sm:inline">{opt.label}</span>
              <span className="sm:hidden">{opt.short}</span>
            </Button04>
          ))}
        </div>
      </FormField>

      {/* ── Pricing: cost → margin → price ──────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Pricing
        </p>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label={`Cost / ${unitLabel}`}
            htmlFor="q-cost"
            hint="What you pay for it"
          >
            <Input
              id="q-cost"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              placeholder="e.g. 100"
            />
          </FormField>

          <FormField
            label="Margin %"
            htmlFor="q-margin"
            hint={autoPrice !== null ? `→ ${formatNPR(autoPrice)} per ${unitLabel}` : "Markup on cost"}
          >
            <Input
              id="q-margin"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={marginStr}
              onChange={(e) => setMarginStr(e.target.value)}
              placeholder="25"
            />
          </FormField>
        </div>

        {/* Retail price */}
        {sellAs !== "WHOLESALE" && (
          <FormField
            label={
              <span className="inline-flex items-center gap-1.5">
                Retail price / {unitLabel}
                {!retailTouched && autoPrice !== null && (
                  <span className="text-[10px] font-normal text-emerald-600 italic">auto</span>
                )}
              </span>
            }
            htmlFor="q-retail"
            error={errors.retail}
          >
            <Input
              id="q-retail"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={retailStr}
              onChange={(e) => {
                setRetailStr(e.target.value);
                setRetailTouched(true);
                setErrors((prev) => ({ ...prev, retail: "" }));
              }}
              aria-invalid={!!errors.retail}
            />
          </FormField>
        )}

        {/* Wholesale price */}
        {sellAs !== "RETAIL" && (
          <FormField
            label={
              <span className="inline-flex items-center gap-1.5">
                Wholesale price / {unitLabel}
                {!wholesaleTouched && autoPrice !== null && (
                  <span className="text-[10px] font-normal text-emerald-600 italic">auto</span>
                )}
              </span>
            }
            htmlFor="q-wholesale"
            error={errors.wholesale}
          >
            <Input
              id="q-wholesale"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={wholesaleStr}
              onChange={(e) => {
                setWholesaleStr(e.target.value);
                setWholesaleTouched(true);
                setErrors((prev) => ({ ...prev, wholesale: "" }));
              }}
              aria-invalid={!!errors.wholesale}
            />
          </FormField>
        )}
      </div>

      {/* ── Secondary fields (less emphasis, collapsed row) ──────── */}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Category" htmlFor="q-category">
          <Input
            id="q-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="General"
            list="q-category-list"
          />
          <datalist id="q-category-list">
            {existingCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Base unit">
          <Select value={baseUnit} onValueChange={(v) => v && setBaseUnit(v)}>
            <SelectTrigger className="w-full" aria-label="Base unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BASE_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField
        label="On shelf now"
        htmlFor="q-stock"
        hint="Stock to start with"
      >
        <Input
          id="q-stock"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={openingStock}
          onChange={(e) => setOpeningStock(e.target.value)}
          className="w-28"
        />
      </FormField>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Step 2: Preview                                               */
/* ────────────────────────────────────────────────────────────── */

const SELL_AS_LABEL: Record<SellAs, string> = {
  RETAIL: "Retail",
  WHOLESALE: "Wholesale",
  BOTH: "Retail + Wholesale",
};

function PreviewStep({
  name,
  category,
  barcode,
  sellAs,
  baseUnit,
  costPrice,
  retailPrice,
  wholesalePrice,
  openingStock,
  unitLabel,
}: {
  name: string;
  category: string;
  barcode: string;
  sellAs: SellAs;
  baseUnit: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  openingStock: number;
  unitLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">
              {category}
              <span className="mx-1.5 text-border">·</span>
              {unitLabel}
            </p>
          </div>
          <Badge variant="muted">{SELL_AS_LABEL[sellAs]}</Badge>
        </div>

        {/* Price grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-2 border-t border-border/60">
          {costPrice > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Cost</span>
              <span className="font-semibold text-foreground">{formatNPR(costPrice)}</span>
            </div>
          )}
          {retailPrice > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Retail</span>
              <span className="font-bold text-foreground">{formatNPR(retailPrice)}</span>
            </div>
          )}
          {wholesalePrice > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Wholesale</span>
              <span className="font-bold text-foreground">{formatNPR(wholesalePrice)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">On shelf</span>
            <span className="font-semibold text-foreground">
              {openingStock} {unitLabel}
            </span>
          </div>
        </div>

        {/* Barcode */}
        <div className="pt-2 border-t border-border/60">
          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <ScanBarcode size={12} />
            {barcode}
          </span>
        </div>
      </div>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Scan this barcode again and it will appear instantly. The opening stock
        is logged as a purchase in the stock ledger.
      </p>
    </div>
  );
}
