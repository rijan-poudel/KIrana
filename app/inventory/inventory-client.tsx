"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
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
import { BASE_UNITS, UNIT_PRESETS } from "@/lib/constants";
import { formatDateTime, formatNPR, formatPercentage, formatQuantity, round2, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adjustStock, createProduct, deleteProduct, receiveStock, updateProduct } from "@/actions/shop-actions";
import type { ProductCardData, SellAs, StockMoveData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import ScanDialog from "../scan-dialog";

/** Safe numeric coercion using the parse helper — returns 0 for invalid/empty input. */
function num(s: string): number {
  const r = parseOptionalNumber(s);
  return "error" in r || r.value === null ? 0 : r.value;
}

type UnitsDraft = { name: string; factor: string };

type UnitVariant = "success" | "info" | "destructive" | "warning" | "muted";

const REASON_VARIANT: Record<string, UnitVariant> = {
  PURCHASE: "success",
  OPENING: "success",
  SALE: "info",
  DAMAGE: "destructive",
  RETURN: "warning",
  ADJUST: "info",
  COUNT: "muted",
};

/** Days until expiry (≤ 0 = already expired), or null when no expiry is set. */
function daysUntilExpiry(iso: string | null): number | null {
  if (!iso) return null;
  const expiry = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

/** Small badge shown next to stock for products that are expired or near expiry. */
function ExpiryBadge({ product }: { product: ProductCardData }) {
  const days = daysUntilExpiry(product.expiryDate);
  if (days === null || days > 7) return null;
  const expired = days <= 0;
  return (
    <Badge variant={expired ? "destructive" : "warning"} title={product.expiryDate ? `Expires ${formatDate(product.expiryDate)}` : undefined}>
      {expired ? "Expired" : `Expires ${formatDate(product.expiryDate!)}`}
    </Badge>
  );
}

export default function InventoryClient({
  products,
  moves,
  receiveId,
  receiveQty,
  receiveUnit,
}: {
  products: ProductCardData[];
  moves: StockMoveData[];
  receiveId: string;
  receiveQty: number;
  receiveUnit: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [formTarget, setFormTarget] = useState<"new" | ProductCardData | null>(null);
  const [stockTarget, setStockTarget] = useState<ProductCardData | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [printLabelsOpen, setPrintLabelsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductCardData | null>(null);
  const [moveFilter, setMoveFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "ok" | "low" | "out">("all");

  useEffect(() => {
    if (receiveId) {
      const product = products.find((p) => p.id === receiveId);
      if (product) {
        setReceiveOpen(true);
        // We'll let the ReceiveStockDialog handle pre-filling when it mounts
      }
    }
  }, [receiveId, products]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const term = query.trim().toLowerCase();
  const searchIndex = useMemo(
    () =>
      products.map((p) => ({
        p,
        name: p.name.toLowerCase(),
        category: p.category.toLowerCase(),
        barcode: (p.barcode ?? "").toLowerCase(),
      })),
    [products],
  );
  const filtered = useMemo(() => {
    return searchIndex.filter((s) => {
      if (
        term &&
        !s.name.includes(term) &&
        !s.category.includes(term) &&
        !s.barcode.includes(term)
      ) {
        return false;
      }
      if (category !== "all" && s.p.category !== category) return false;
      if (stockFilter === "out" && s.p.stockQuantity > 0) return false;
      if (stockFilter === "low" && !(s.p.stockQuantity > 0 && s.p.stockQuantity <= s.p.lowStockAt)) return false;
      if (stockFilter === "ok" && s.p.stockQuantity <= s.p.lowStockAt) return false;
      return true;
    }).map((s) => s.p);
  }, [searchIndex, term, category, stockFilter]);

  const lowCount = products.filter((p) => p.stockQuantity <= p.lowStockAt).length;
  const filteredMoves = moveFilter === "all" ? moves : moves.filter((m) => m.productName === moveFilter);

  async function handleDelete() {
    if (!deleteTarget) return;
    const response = await deleteProduct(deleteTarget.id);
    if (response.ok) {
      toast.success(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Stock"
        subtitle={`${products.length} products • ${lowCount} low on stock. Purchases, damage and counts are all logged below.`}
        icon={<PackagePlus size={22} />}
        actions={
          <>
            <Button variant="outline" onClick={() => setReceiveOpen(true)}>
              <PackagePlus /> Receive stock
            </Button>
            <Button variant="outline" onClick={() => setPrintLabelsOpen(true)}>
              <Printer /> Print labels
            </Button>
            <Button onClick={() => setFormTarget("new")}>
              <Plus /> Add product
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="pl-10" />
        </div>
        <Select value={category} onValueChange={(v) => v && setCategory(v)}>
          <SelectTrigger className="w-[170px]" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {([
            { value: "all", label: "All" },
            { value: "ok", label: "In stock" },
            { value: "low", label: "Low" },
            { value: "out", label: "Out" },
          ] as const).map((opt) => (
            <Button04
              key={opt.value}
              type="button"
              aria-pressed={stockFilter === opt.value}
              onClick={() => setStockFilter(opt.value)}
              className="h-8 rounded-md px-2.5 py-0 text-xs font-extrabold [--btn-radius:8px]"
            >
              {opt.label}
            </Button04>
          ))}
        </div>
      </div>

      {/* Phones: card list — a 6-column table can't fit a 390px screen. */}
      <div className="mt-4 space-y-2.5 md:hidden">
        {filtered.length === 0 && (
          <div className="card p-8 text-center text-sm text-muted-foreground">
            {products.length === 0 ? "No products yet — add the first one." : "No products match the filters."}
          </div>
        )}
        {filtered.map((p) => {
          const out = p.stockQuantity <= 0;
          const low = !out && p.stockQuantity <= p.lowStockAt;
          return (
            <div key={p.id} className="card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{p.name}</p>
                  {p.barcode && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.barcode}</p>}
                </div>
                <Badge variant={out ? "destructive" : low ? "warning" : "success"}>
                  {formatQuantity(p.stockQuantity)} {p.baseUnit}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">
                  {p.category}
                  {p.costPrice > 0 && <span className="ml-1.5 font-mono text-[11px]">cost {formatNPR(p.costPrice)}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <ExpiryBadge product={p} />
                  <span className="text-sm font-bold text-foreground">{formatNPR(p.retailPrice)}</span>
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <Button variant="outline" className="flex-1" onClick={() => setStockTarget(p)}>
                  <PackagePlus /> Stock
                </Button>
                <Button variant="outline" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setFormTarget(p)}>
                  <Pencil />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={`Delete ${p.name}`}
                  className="hover:border-red-300 hover:text-red-600"
                  onClick={() => setDeleteTarget(p)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mt-4 hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm md:min-w-[820px]">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Category</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">In stock</th>
              <th className="hidden px-4 py-3 text-right font-semibold lg:table-cell">Cost</th>
              <th className="px-4 py-3 text-right font-semibold">Retail</th>
              <th className="hidden px-4 py-3 text-right font-semibold lg:table-cell">Wholesale</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {products.length === 0 ? "No products yet — add the first one." : "No products match the filters."}
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const pack = [...p.units]
                .sort((a, b) => b.factor - a.factor)
                .find((u) => u.factor > 1 && p.stockQuantity >= u.factor);
              const out = p.stockQuantity <= 0;
              const low = !out && p.stockQuantity <= p.lowStockAt;
              return (
                <tr key={p.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    {p.barcode && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.barcode}</p>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{p.category}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={out ? "destructive" : low ? "warning" : "success"}>
                        {formatQuantity(p.stockQuantity)} {p.baseUnit}
                      </Badge>
                      <ExpiryBadge product={p} />
                    </div>
                    {pack && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        ≈ {formatQuantity(Math.floor((p.stockQuantity / pack.factor) * 10) / 10)} {pack.name}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right whitespace-nowrap lg:table-cell">
                    {p.costPrice > 0 ? (
                      <>
                        {formatNPR(p.costPrice)}
                        <span className="ml-1 text-[11px] text-emerald-700">
                          ↗{formatPercentage((p.retailPrice - p.costPrice) / p.costPrice)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatNPR(p.retailPrice)}</td>
                  <td className="hidden px-4 py-3 text-right whitespace-nowrap lg:table-cell">{formatNPR(p.wholesalePrice)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setStockTarget(p)}>
                        <PackagePlus /> Stock
                      </Button>
                      <Button variant="outline" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setFormTarget(p)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Delete ${p.name}`}
                        className="hover:border-red-300 hover:text-red-600"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stock movements ledger */}
      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Recent stock movements</h2>
            <p className="text-xs text-muted-foreground">Every purchase, sale, damage and count — newest first.</p>
          </div>
          <Select value={moveFilter} onValueChange={(v) => v && setMoveFilter(v)}>
            <SelectTrigger className="w-[200px]" aria-label="Filter movements by product">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filteredMoves.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No stock movements yet.</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {filteredMoves.map((m) => (
                <tr key={m.id} className="border-b border-border/40 last:border-0">
                  <td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(m.createdAt)}</td>
                  <td className="px-5 py-2.5 font-medium text-foreground">{m.productName}</td>
                  <td className="px-5 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-bold",
                        m.delta >= 0 ? "text-emerald-700" : "text-red-600",
                      )}
                    >
                      {m.delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {formatQuantity(Math.abs(m.delta))} {m.baseUnit}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">
                    {m.quantity !== null && m.unitName && m.unitName !== m.baseUnit
                      ? `${formatQuantity(m.quantity)} ${m.unitName}`
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge variant={REASON_VARIANT[m.reason] ?? "muted"}>{m.reason}</Badge>
                  </td>
                  <td className="max-w-[200px] truncate px-5 py-2.5 text-muted-foreground">{m.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {formTarget && <ProductFormDialog product={formTarget === "new" ? null : formTarget} onClose={() => setFormTarget(null)} />}

      {stockTarget && <StockDialog product={stockTarget} onClose={() => setStockTarget(null)} />}

      {receiveOpen && (
        <ReceiveStockDialog
          products={products}
          onClose={() => setReceiveOpen(false)}
          prefillProductId={receiveId}
          prefillQty={receiveQty}
          prefillUnit={receiveUnit}
        />
      )}

      {printLabelsOpen && <PrintLabelsDialog products={products} onClose={() => setPrintLabelsOpen(false)} />}

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Products with sales history cannot be deleted — their past bills stay intact. Stock records for this
              product will be removed with it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** "2026-09-14T00:00:00.000Z" → "2026-09-14" for a date input's value. */
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function ProductFormDialog({ product, onClose }: { product: ProductCardData | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [sellAs, setSellAs] = useState<SellAs>(product?.sellAs ?? "BOTH");
  const [baseUnit, setBaseUnit] = useState(product?.baseUnit ?? "pcs");
  const [lowStockAt, setLowStockAt] = useState(String(product?.lowStockAt ?? 10));
  const [retailPrice, setRetailPrice] = useState(String(product?.retailPrice ?? ""));
  const [wholesalePrice, setWholesalePrice] = useState(String(product?.wholesalePrice ?? ""));
  const [costPrice, setCostPrice] = useState(String(product?.costPrice ?? ""));
  const [openingStock, setOpeningStock] = useState("0");
  const [manufacturingDate, setManufacturingDate] = useState(toDateInputValue(product?.manufacturingDate ?? null));
  const [expiryDate, setExpiryDate] = useState(toDateInputValue(product?.expiryDate ?? null));
  const [scanOpen, setScanOpen] = useState(false);
  const [units, setUnits] = useState<UnitsDraft[]>(
    product?.units.map((u) => ({ name: u.name, factor: String(u.factor) })) ?? [],
  );
  // Field-level problems found on submit — cleared as the cashier fixes them.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unitErrors, setUnitErrors] = useState<(string | null)[]>([]);

  const presets = UNIT_PRESETS[baseUnit] ?? [];

  function addPreset(preset?: { name: string; factor: number }) {
    setUnits((prev) => {
      if (preset) {
        if (prev.some((u) => u.name.toLowerCase() === preset.name.toLowerCase())) return prev;
        return [...prev, { name: preset.name, factor: String(preset.factor) }];
      }
      return [...prev, { name: "", factor: "" }];
    });
    setUnitErrors([]);
  }

  function editUnit(index: number, patch: Partial<UnitsDraft>) {
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
    setUnitErrors((prev) => prev.map((e, i) => (i === index ? null : e)));
  }

  /** Validate the whole form; returns null when everything is fine. */
  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required.";

    const retail = parseOptionalNumber(retailPrice);
    if ("error" in retail) errs.retail = retail.error;
    else if (sellAs !== "WHOLESALE" && retail.value === null) errs.retail = "Retail price is required.";

    const wholesale = parseOptionalNumber(wholesalePrice);
    if ("error" in wholesale) errs.wholesale = wholesale.error;
    else if (sellAs === "WHOLESALE" && wholesale.value === null) errs.wholesale = "Wholesale price is required.";

    const cost = parseOptionalNumber(costPrice);
    if ("error" in cost) errs.cost = cost.error;

    const low = parseOptionalNumber(lowStockAt);
    if ("error" in low) errs.low = low.error;

    if (expiryDate && manufacturingDate && expiryDate < manufacturingDate) {
      errs.expiry = "Expiry cannot be before the manufacturing date.";
    }

    if (!product) {
      const opening = parseOptionalNumber(openingStock);
      if ("error" in opening) errs.opening = opening.error;
    }

    const uErrors: (string | null)[] = units.map((u, i) => {
      if (!u.name.trim()) return "Enter a unit name, or remove this row.";
      const sameName = units.some((x, j) => j !== i && x.name.trim().toLowerCase() === u.name.trim().toLowerCase());
      if (sameName) return `“${u.name.trim()}” is listed twice.`;
      if (u.name.trim().toLowerCase() === baseUnit) return `“${baseUnit}” is the base unit — drop this row.`;
      const result = parseInputNumber(u.factor);
      if ("error" in result) return `Enter a real factor for “${u.name.trim()}”.`;
      if (result.value <= 0 || result.value === 1) return "Factor must be greater than 0 (and not 1).";
      return null;
    });
    setUnitErrors(uErrors);
    if (uErrors.some(Boolean)) errs.units = "Fix the pack sizes below.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    const input = {
      name,
      category,
      barcode,
      baseUnit,
      lowStockAt: num(lowStockAt),
      retailPrice: sellAs === "WHOLESALE" ? 0 : num(retailPrice),
      wholesalePrice: sellAs === "RETAIL" ? 0 : num(wholesalePrice),
      costPrice: num(costPrice),
      sellAs,
      openingStock: num(openingStock),
      manufacturingDate: manufacturingDate || null,
      expiryDate: expiryDate || null,
      units: units
        .filter((u) => u.name.trim())
        .map((u) => ({ name: u.name.trim(), factor: num(u.factor) })),
    };
    const response = product ? await updateProduct(product.id, input) : await createProduct(input);
    setBusy(false);
    if (response.ok) {
      toast.success(product ? `${input.name} updated.` : `${input.name} added to stock.`);
      router.refresh();
      onClose();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <div>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{product ? `Edit ${product.name}` : "Add product"}</DialogTitle>
            <DialogDescription>
              Stock is counted in one base unit; pack sizes like Cartons convert automatically when selling.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Name *" htmlFor="p-name" error={errors.name} className="col-span-2">
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  aria-invalid={!!errors.name}
                  required
                  autoFocus
                />
              </FormField>

              <FormField label="Category" htmlFor="p-category" className="col-span-2">
                <Input
                  id="p-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Staples, Snacks…"
                />
              </FormField>

              <FormField
                label={
                  <span className="inline-flex items-center gap-1">
                    <ScanBarcode size={13} /> Barcode
                  </span>
                }
                htmlFor="p-barcode"
                className="col-span-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="p-barcode"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan or type…"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Scan barcode with the camera"
                    onClick={() => setScanOpen(true)}
                  >
                    <ScanBarcode />
                  </Button>
                </div>
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

              <FormField
                label={`Low-stock alert (${baseUnit})`}
                htmlFor="p-low"
                error={errors.low}
                hint="Warn me on the counter when stock falls to this."
              >
                <Input
                  id="p-low"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={lowStockAt}
                  onChange={(e) => {
                    setLowStockAt(e.target.value);
                    setErrors((prev) => ({ ...prev, low: "" }));
                  }}
                  aria-invalid={!!errors.low}
                />
              </FormField>

              <FormField
                label="Sold to"
                hint="Who is this product for? Prices only show for the places you sell it."
                className="col-span-2"
              >
                <div role="radiogroup" aria-label="Sold to" className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                  {([
                    { value: "RETAIL", label: "Retail only" },
                    { value: "BOTH", label: "Both" },
                    { value: "WHOLESALE", label: "Wholesale only" },
                  ] as const).map((opt) => (
                    <Button04
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={sellAs === opt.value}
                      onClick={() => setSellAs(opt.value)}
                      className="h-9 flex-1 rounded-md px-2 py-0 text-sm font-extrabold [--btn-radius:8px]"
                    >
                      {opt.label}
                    </Button04>
                  ))}
                </div>
              </FormField>

              {sellAs !== "WHOLESALE" && (
                <FormField label={`Retail price / ${baseUnit} *`} htmlFor="p-retail" error={errors.retail}>
                  <Input
                    id="p-retail"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={retailPrice}
                    onChange={(e) => {
                      setRetailPrice(e.target.value);
                      setErrors((prev) => ({ ...prev, retail: "" }));
                    }}
                    aria-invalid={!!errors.retail}
                    required
                  />
                </FormField>
              )}

              {sellAs !== "RETAIL" && (
                <FormField label={`Wholesale price / ${baseUnit}${sellAs === "WHOLESALE" ? " *" : ""}`} htmlFor="p-wholesale" error={errors.wholesale}>
                  <Input
                    id="p-wholesale"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={wholesalePrice}
                    onChange={(e) => {
                      setWholesalePrice(e.target.value);
                      setErrors((prev) => ({ ...prev, wholesale: "" }));
                    }}
                    aria-invalid={!!errors.wholesale}
                    required={sellAs === "WHOLESALE"}
                  />
                </FormField>
              )}

              <FormField
                label={`Cost price / ${baseUnit}`}
                htmlFor="p-cost"
                error={errors.cost}
                hint="What you pay for it — used for the profit report."
              >
                <Input
                  id="p-cost"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => {
                    setCostPrice(e.target.value);
                    setErrors((prev) => ({ ...prev, cost: "" }));
                  }}
aria-invalid={!!errors.cost}
              />
            </FormField>

              <FormField
                label="Manufactured on"
                htmlFor="p-mfg"
                hint="When this product was made (batch date)."
                className="col-span-2"
              >
                <Input
                  id="p-mfg"
                  type="date"
                  value={manufacturingDate}
                  onChange={(e) => setManufacturingDate(e.target.value)}
                />
              </FormField>

              <FormField
                label="Expires on"
                htmlFor="p-expiry"
                error={errors.expiry}
                hint="Optional — you'll be warned when stock is near expiry."
                className="col-span-2"
              >
                <Input
                  id="p-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    setErrors((prev) => ({ ...prev, expiry: "" }));
                  }}
                  aria-invalid={!!errors.expiry}
                />
              </FormField>

              {!product && (
                <FormField
                  label={`Opening stock (${baseUnit})`}
                  htmlFor="p-opening"
                  error={errors.opening}
                  hint="Logged as an OPENING stock move."
                  className="col-span-2"
                >
                  <Input
                    id="p-opening"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={openingStock}
                    onChange={(e) => {
                      setOpeningStock(e.target.value);
                      setErrors((prev) => ({ ...prev, opening: "" }));
                    }}
                    aria-invalid={!!errors.opening}
                  />
                </FormField>
              )}
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Sell units (packs &amp; fractions)</p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset) => (
                    <Button key={preset.name} type="button" variant="outline" size="xs" onClick={() => addPreset(preset)}>
                      + {preset.name}
                    </Button>
                  ))}
                  <Button type="button" variant="ghost" size="xs" onClick={() => addPreset()}>
                    + custom
                  </Button>
                </div>
              </div>

              {units.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Optional. Examples: a Carton of 30 pcs, a Pack of 10 pcs, or gram = 0.001 for a kg product.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {units.map((u, index) => (
                    <div key={index}>
                      <div className="flex items-center gap-2">
                        <Input
                          value={u.name}
                          onChange={(e) => editUnit(index, { name: e.target.value })}
                          placeholder="Name (Carton)"
                          className="flex-1"
                          aria-invalid={!!unitErrors[index]}
                        />
                        <span className="text-xs whitespace-nowrap text-muted-foreground">=</span>
                        <Input
                          value={u.factor}
                          onChange={(e) => editUnit(index, { factor: e.target.value })}
                          placeholder={`× ${baseUnit}`}
                          type="number"
                          step="any"
                          min={0}
                          inputMode="decimal"
                          className="w-24"
                          aria-invalid={!!unitErrors[index]}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove unit ${u.name || index + 1}`}
                          onClick={() => {
                            setUnits((prev) => prev.filter((_, i) => i !== index));
                            setUnitErrors((prev) => prev.filter((_, i) => i !== index));
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      {unitErrors[index] && (
                        <p role="alert" className="mt-1 text-sm font-normal text-destructive">
                          {unitErrors[index]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {errors.units && <p role="alert" className="mt-2 text-sm font-normal text-destructive">{errors.units}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {product ? "Save changes" : "Add product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(code) => {
          setBarcode(code);
          setScanOpen(false);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STOCK_MODES = [
  { value: "PURCHASE", label: "Purchase (stock in)" },
  { value: "DAMAGE", label: "Damage / wastage (out)" },
  { value: "RETURN", label: "Return to supplier (out)" },
  { value: "ADJUST", label: "Correction (+/−)" },
  { value: "COUNT", label: "Count — set exact stock" },
] as const;

function StockDialog({ product, onClose }: { product: ProductCardData; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<string>("PURCHASE");
  const [unitName, setUnitName] = useState(product.baseUnit);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [costTotal, setCostTotal] = useState("");
  const [manufacturingDate, setManufacturingDate] = useState(toDateInputValue(product.manufacturingDate ?? null));
  const [expiryDate, setExpiryDate] = useState(toDateInputValue(product.expiryDate ?? null));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ quantity?: string; cost?: string; expiry?: string }>({});

  const options = [
    { name: product.baseUnit, factor: 1 },
    ...product.units.map((u) => ({ name: u.name, factor: u.factor })),
  ];
  const factor = options.find((o) => o.name === unitName)?.factor ?? 1;
  const qty = quantity.trim() === "" ? NaN : Number(quantity);

  const preview = useMemo(() => {
    if (!Number.isFinite(qty) || quantity === "") return null;
    if (mode === "COUNT") return `${formatQuantity(qty)} ${product.baseUnit} on shelf`;
    const delta = Math.round(qty * factor * 100) / 100;
    const signed = mode === "DAMAGE" || mode === "RETURN" ? -Math.abs(delta) : delta;
    return `${signed >= 0 ? "+" : "−"}${formatQuantity(Math.abs(signed))} ${product.baseUnit}`;
  }, [qty, quantity, mode, factor, product.baseUnit]);

  function validate(): boolean {
    const errs: { quantity?: string; cost?: string; expiry?: string } = {};
    const qtyParsed = parseInputNumber(quantity);
    if ("error" in qtyParsed) {
      errs.quantity = qtyParsed.error;
    } else {
      if (mode === "COUNT" && qtyParsed.value < 0) errs.quantity = "Counted stock cannot be negative.";
      else if (mode !== "COUNT" && qtyParsed.value <= 0) errs.quantity = "Enter a positive quantity.";
    }

    if (mode === "PURCHASE") {
      if (costTotal.trim() !== "") {
        const costParsed = parseOptionalNumber(costTotal);
        if ("error" in costParsed) errs.cost = costParsed.error;
      }
      if (expiryDate && manufacturingDate && expiryDate < manufacturingDate) {
        errs.expiry = "Expiry cannot be before the manufacturing date.";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    const response = await adjustStock({
      productId: product.id,
      mode: mode as "PURCHASE" | "DAMAGE" | "RETURN" | "ADJUST" | "COUNT",
      quantity: qty,
      unitName: mode === "COUNT" ? product.baseUnit : unitName,
      note,
      costTotal: mode === "PURCHASE" ? num(costTotal) : undefined,
      manufacturingDate: mode === "PURCHASE" ? (manufacturingDate || null) : undefined,
      expiryDate: mode === "PURCHASE" ? (expiryDate || null) : undefined,
    });
    setBusy(false);
    if (response.ok) {
      toast.success(`${product.name}: now ${formatQuantity(response.data.newStock)} ${product.baseUnit} in stock.`);
      router.refresh();
      onClose();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal size={18} /> Stock — {product.name}
          </DialogTitle>
          <DialogDescription>
            Currently {formatQuantity(product.stockQuantity)} {product.baseUnit} on the shelf.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <FormField label="Type">
            <Select
              value={mode}
              onValueChange={(v) => {
                if (!v) return;
                setMode(v);
                setUnitName(product.baseUnit);
                setQuantity("");
                setErrors({});
              }}
            >
              <SelectTrigger className="w-full" aria-label="Stock movement type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {mode === "COUNT" ? (
            <FormField label={`Counted stock (${product.baseUnit})`} htmlFor="s-qty" error={errors.quantity}>
              <Input
                id="s-qty"
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setErrors((prev) => ({ ...prev, quantity: "" }));
                }}
                autoFocus
                aria-invalid={!!errors.quantity}
                required
              />
            </FormField>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Quantity" htmlFor="s-qty" error={errors.quantity}>
                <Input
                  id="s-qty"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    setErrors((prev) => ({ ...prev, quantity: "" }));
                  }}
                  autoFocus
                  aria-invalid={!!errors.quantity}
                  required
                />
              </FormField>

              <FormField label="Unit">
                <Select value={unitName} onValueChange={(v) => v && setUnitName(v)}>
                  <SelectTrigger className="w-full" aria-label="Unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.name} value={o.name}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          )}

          {preview && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
              Effect: {preview}
            </p>
          )}

          {mode === "PURCHASE" && (
            <FormField
              label="Total purchase cost (Rs.)"
              htmlFor="s-cost"
              error={errors.cost}
              hint="Optional — the total rupees paid for this lot, which sets the new cost price."
            >
              <Input
                id="s-cost"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={costTotal}
                onChange={(e) => {
                  setCostTotal(e.target.value);
                  setErrors((prev) => ({ ...prev, cost: "" }));
                }}
                placeholder="Optional — updates cost price"
                aria-invalid={!!errors.cost}
              />
            </FormField>
          )}

          {mode === "PURCHASE" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Manufactured on"
                htmlFor="s-mfg"
                hint="When this lot was made."
              >
                <Input id="s-mfg" type="date" value={manufacturingDate} onChange={(e) => setManufacturingDate(e.target.value)} />
              </FormField>
              <FormField
                label="Expires on"
                htmlFor="s-exp"
                error={errors.expiry}
                hint="Warned near expiry."
              >
                <Input
                  id="s-exp"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    setErrors((prev) => ({ ...prev, expiry: "" }));
                  }}
                  aria-invalid={!!errors.expiry}
                />
              </FormField>
            </div>
          )}

          <FormField label="Note (supplier, reason…)" htmlFor="s-note">
            <Input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Record
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

type ReceiveLine = {
  key: string;
  productId: string | null;
  name: string;
  category: string;
  retailPrice: string; // only used when creating a brand-new product
  unitName: string;
  quantity: string;
  costTotal: string;
};

/**
 * The fast way to log a whole delivery: type or scan a name, tap it, type the
 * quantity, done — then repeat for the next item. New names can be created in
 * the same breath (just name + retail price + count). One click records
 * everything, and a shared manufacturing/expiry date + supplier note are
 * applied to the whole lot.
 */
function ReceiveStockDialog({
  products,
  onClose,
  prefillProductId,
  prefillQty,
  prefillUnit,
}: {
  products: ProductCardData[];
  onClose: () => void;
  prefillProductId?: string;
  prefillQty?: number;
  prefillUnit?: string;
}) {
  const router = useRouter();
  const [cue, setCue] = useState("");
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [lotMfg, setLotMfg] = useState("");
  const [lotExp, setLotExp] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [cueFocus, setCueFocus] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cueRef, setCueRef] = useState<HTMLInputElement | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    if (prefillProductId && lines.length === 0) {
      const product = products.find((p) => p.id === prefillProductId);
      if (product) {
        const unitName = prefillUnit && product.units.some((u) => u.name === prefillUnit) ? prefillUnit : product.baseUnit;
        const key = `${product.id}-${Date.now().toString(36)}`;
        setLines([{ key, productId: product.id, name: product.name, category: product.category, retailPrice: "", unitName, quantity: String(prefillQty || ""), costTotal: "" }]);
        setErrors((prev) => ({ ...prev, [key]: "" }));
      }
    }
  }, [prefillProductId, prefillQty, prefillUnit, products, lines.length]);

  const term = cue.trim().toLowerCase();
  const alreadyAdded = useMemo(() => new Set(lines.filter((l) => l.productId).map((l) => l.productId!)), [lines]);
  const matches = useMemo(() => {
    if (!term) return [];
    return products
      .filter((p) => !alreadyAdded.has(p.id))
      .filter(
        (p) => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term) || (p.barcode ?? "").includes(term),
      )
      .slice(0, 6);
  }, [products, term, alreadyAdded]);

  const exactMatch = term.length > 0 && matches.some((m) => m.name.toLowerCase() === term);

  function onScanned(code: string) {
    const product = products.find((p) => (p.barcode ?? "").toLowerCase() === code.toLowerCase());
    if (product) {
      if (lines.some((l) => l.productId === product.id)) {
        toast.info(`${product.name} is already in the list.`);
      } else {
        addProduct(product);
      }
    } else {
      toast.error(`No product has barcode ${code}.`);
    }
    setScanOpen(false);
  }

  function unitOptionsFor(p: ProductCardData) {
    return [{ name: p.baseUnit, factor: 1 }, ...p.units.map((u) => ({ name: u.name, factor: u.factor }))];
  }

  function pushLine(line: ReceiveLine) {
    setLines((prev) => [...prev, line]);
    setCue("");
    setErrors((prev) => ({ ...prev, [line.key]: "" }));
    requestAnimationFrame(() => cueRef?.focus());
  }

  function addProduct(p: ProductCardData) {
    pushLine({ key: `${p.id}-${Date.now().toString(36)}`, productId: p.id, name: p.name, category: p.category, retailPrice: "", unitName: p.baseUnit, quantity: "", costTotal: "" });
  }

  function addNewProduct(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    pushLine({ key: `new-${Date.now().toString(36)}`, productId: null, name: trimmed, category: "", retailPrice: "", unitName: "pcs", quantity: "", costTotal: "" });
  }

  function updateLine(key: string, patch: Partial<ReceiveLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function onCueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (matches.length > 0) {
      addProduct(matches[0]);
    } else if (term) {
      addNewProduct(cue);
    }
  }

  /** After typing a count, hit Enter to jump straight back to the search box. */
  function onQtyKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      cueRef?.focus();
    }
  }

  async function submit() {
    const errs: Record<string, string> = {};
    for (const line of lines) {
      const parsed = parseInputNumber(line.quantity);
      if ("error" in parsed) errs[line.key] = parsed.error;
      else if (parsed.value <= 0) errs[line.key] = "Enter a quantity greater than zero.";
    }
    if (lotExp && lotMfg && lotExp < lotMfg) errs.lot = "Expiry cannot be before the manufacturing date.";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one item to receive.");
      return;
    }

    setBusy(true);
    const response = await receiveStock(
      lines.map((l) => ({
        name: l.name,
        productId: l.productId ?? undefined,
        category: l.category,
        retailPrice: l.productId ? undefined : num(l.retailPrice),
        quantity: num(l.quantity),
        unitName: l.productId ? l.unitName : undefined,
        costTotal: l.costTotal.trim() === "" ? undefined : num(l.costTotal),
      })),
      { manufacturingDate: lotMfg || null, expiryDate: lotExp || null, note: note || null },
    );
    setBusy(false);
    if (response.ok) {
      const newCount = response.data.newProducts;
      toast.success(
        `Logged ${lines.length} item${lines.length === 1 ? "" : "s"} on the shelf` +
          (newCount > 0 ? ` • ${newCount} new product${newCount === 1 ? "" : "s"} created` : "") +
          ".",
      );
      router.refresh();
      onClose();
    } else {
      toast.error(response.error);
    }
  }

  const totalQty = lines.reduce((sum, l) => sum + num(l.quantity), 0);

  return (
    <div>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive stock</DialogTitle>
            <DialogDescription>
              Everything that came in today, in one go — search each item or type its name, add the count, and hit Record
              at the end.
            </DialogDescription>
          </DialogHeader>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <div className="relative">
            <Input
              ref={setCueRef}
              value={cue}
              onChange={(e) => {
                setCue(e.target.value);
                setCueFocus(true);
              }}
              onFocus={() => setCueFocus(true)}
              onKeyDown={onCueKeyDown}
              placeholder="Search a product, or type a new name…"
              className="pl-9 pr-12"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => setScanOpen(true)}
              aria-label="Scan barcode with camera"
            >
              <ScanBarcode size={16} />
            </Button>
          </div>
          {cueFocus && cue.trim() !== "" && (
            <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl shadow-black/5">
              {matches.length > 0 &&
                matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      addProduct(p);
                      setCueFocus(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-[11px]">{p.category}</span>
                      {p.stockQuantity <= 0 ? (
                        <Badge variant="destructive">Out</Badge>
                      ) : (
                        <span>
                          {formatQuantity(p.stockQuantity)} {p.baseUnit}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              {!exactMatch && (
                <button
                  type="button"
                  onClick={() => {
                    addNewProduct(cue);
                    setCueFocus(false);
                  }}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                >
                  <Plus size={14} /> Create “{cue.trim()}” as a new product
                </button>
              )}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="scrollbar-none -mx-1 mt-1 max-h-[38vh] flex-1 space-y-2 overflow-y-auto px-1">
            {lines.map((line) => {
              const product = line.productId ? products.find((p) => p.id === line.productId) : undefined;
              const options = product ? unitOptionsFor(product) : [{ name: "pcs", factor: 1 }];
              const error = errors[line.key];
              return (
                <div key={line.key} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{line.name}</p>
                      {product ? (
                        <p className="text-[11px] text-muted-foreground">
                          in stock {formatQuantity(product.stockQuantity)} {product.baseUnit}
                        </p>
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={line.retailPrice}
                          onChange={(e) => updateLine(line.key, { retailPrice: e.target.value })}
                          placeholder="Retail price / pcs"
                          className="mt-1 h-8 w-40 text-xs"
                          aria-label={`Retail price for ${line.name}`}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        onKeyDown={onQtyKeyDown}
                        placeholder="Qty"
                        aria-label={`Quantity of ${line.name}`}
                        aria-invalid={!!error}
                        className="h-9 w-20 text-right"
                      />
                      {options.length === 1 ? (
                        <span className="w-14 shrink-0 text-center text-xs text-muted-foreground">{line.unitName}</span>
                      ) : (
                        <Select value={line.unitName} onValueChange={(v) => v && updateLine(line.key, { unitName: v })}>
                          <SelectTrigger className="h-9 w-[84px]" aria-label={`Unit for ${line.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((o) => (
                              <SelectItem key={o.name} value={o.name}>
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={line.costTotal}
                      onChange={(e) => updateLine(line.key, { costTotal: e.target.value })}
                      placeholder="Cost Rs."
                      aria-label={`Total cost for ${line.name}`}
                      className="h-9 w-24 text-right font-mono text-xs"
                    />

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => removeLine(line.key)}
                      className="hover:text-red-600"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
          <FormField label="Manufactured on">
            <Input type="date" value={lotMfg} onChange={(e) => setLotMfg(e.target.value)} />
          </FormField>
          <FormField label="Expires on" error={errors.lot}>
            <Input
              type="date"
              value={lotExp}
              onChange={(e) => {
                setLotExp(e.target.value);
                setErrors((prev) => ({ ...prev, lot: "" }));
              }}
              aria-invalid={!!errors.lot}
            />
          </FormField>
          <FormField label="Note (supplier…)" className="col-span-2 sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </FormField>
        </div>

        <DialogFooter>
          <p className="mr-auto text-xs text-muted-foreground">
            {lines.length} item{lines.length === 1 ? "" : "s"}
            {totalQty > 0 ? ` • ${formatQuantity(round2(totalQty))} counted` : ""}
          </p>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || lines.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Record {lines.length > 0 ? `${lines.length} item${lines.length === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} onDetected={onScanned} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Printable label sheet for thermal label printers (80mm/58mm). */
function PrintLabelsDialog({ products, onClose }: { products: ProductCardData[]; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "no-barcode" | "low-stock">("all");

  const filtered = products.filter((p) => {
    if (filter === "no-barcode") return !p.barcode;
    if (filter === "low-stock") return p.stockQuantity <= p.lowStockAt;
    return true;
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  function print() {
    if (selected.size === 0) {
      toast.error("Select at least one product.");
      return;
    }
    const printProducts = products.filter((p) => selected.has(p.id));
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked — allow popups for this site.");
      return;
    }
    const html = renderLabels(printProducts);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Print labels</DialogTitle>
          <DialogDescription>
            Select products to print QR labels for. Works on any thermal label printer (80mm or 58mm roll).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select value={filter} onValueChange={(v) => v && setFilter(v)}>
            <SelectTrigger className="w-full" aria-label="Filter products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="no-barcode">Missing barcode</SelectItem>
              <SelectItem value="low-stock">Low / out of stock</SelectItem>
            </SelectContent>
          </Select>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No products match the filter.</p>
            ) : (
              filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.category} • {p.barcode ? <span className="font-mono">{p.barcode}</span> : <span className="text-amber-600">No barcode</span>}
                      </p>
                    </div>
                  </div>
                  <Badge variant={p.stockQuantity <= 0 ? "destructive" : p.stockQuantity <= p.lowStockAt ? "warning" : "default"}>
                    {formatQuantity(p.stockQuantity)} {p.baseUnit}
                  </Badge>
                </label>
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{selected.size} selected</span>
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {selected.size === filtered.length ? "Deselect all" : "Select all"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={print} disabled={selected.size === 0}>
            <Printer /> Print {selected.size} label{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function renderLabels(printProducts: ProductCardData[]) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Labels</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
  <style>
    @page { margin: 0; size: auto; }
    body { margin: 0; padding: 4mm; font-family: monospace; font-size: 10px; }
    .label { page-break-inside: avoid; width: 72mm; height: 32mm; border: 1px solid #ddd; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
    .qr { width: 24mm; height: 24mm; }
    .name { font-weight: bold; font-size: 11px; text-align: center; max-width: 68mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .price { font-size: 10px; color: #333; }
    .barcode { font-family: monospace; font-size: 9px; letter-spacing: 1px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  ${printProducts
    .map((p) => {
      const qrData = JSON.stringify({ n: p.name, c: p.category, b: p.barcode, r: p.retailPrice, u: p.baseUnit });
      return `<div class="label">
        <div class="qr" id="qr-${p.id}"></div>
        <div class="name">${p.name}</div>
        <div class="price">${formatNPR(p.retailPrice)}/${p.baseUnit}</div>
        ${p.barcode ? `<div class="barcode">${p.barcode}</div>` : ""}
      </div>`;
    })
    .join("")}
  <script>
    ${printProducts
      .map((p) => {
        const qrData = JSON.stringify({ n: p.name, c: p.category, b: p.barcode, r: p.retailPrice, u: p.baseUnit });
        return `new QRCode(document.getElementById("qr-${p.id}"), { text: ${JSON.stringify(qrData)}, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });`;
      })
      .join("")}
  </script>
</body>
</html>`;
  }
}
