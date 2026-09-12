"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Loader2, PackagePlus, Pencil, ScanBarcode, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BASE_UNITS, UNIT_PRESETS } from "@/lib/constants";
import { formatDateTime, formatNPR, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adjustStock, createProduct, deleteProduct, updateProduct } from "@/actions/shop-actions";
import type { ProductCardData, StockMoveData } from "@/lib/types";

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

export default function InventoryClient({ products, moves }: { products: ProductCardData[]; moves: StockMoveData[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [formTarget, setFormTarget] = useState<"new" | ProductCardData | null>(null);
  const [stockTarget, setStockTarget] = useState<ProductCardData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductCardData | null>(null);
  const [moveFilter, setMoveFilter] = useState("all");

  const term = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          (p.barcode ?? "").toLowerCase().includes(term),
      ),
    [products, term],
  );

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
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Stock</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length} products • {lowCount} low on stock. Purchases, damage and counts are all logged below.
          </p>
        </div>
        <Button size="lg" onClick={() => setFormTarget("new")}>
          <PackagePlus /> Add product
        </Button>
      </header>

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="pl-10" />
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">In stock</th>
              <th className="px-4 py-3 text-right font-semibold">Retail</th>
              <th className="px-4 py-3 text-right font-semibold">Wholesale</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {products.length === 0 ? "No products yet — add the first one." : "No products match the search."}
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
                  <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3">
                    <Badge variant={out ? "destructive" : low ? "warning" : "success"}>
                      {formatQuantity(p.stockQuantity)} {p.baseUnit}
                    </Badge>
                    {pack && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        ≈ {formatQuantity(Math.floor((p.stockQuantity / pack.factor) * 10) / 10)} {pack.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatNPR(p.retailPrice)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatNPR(p.wholesalePrice)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setStockTarget(p)}>
                        <PackagePlus /> Stock
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setFormTarget(p)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${p.name}`}
                        className="hover:text-red-600"
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

function ProductFormDialog({ product, onClose }: { product: ProductCardData | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [baseUnit, setBaseUnit] = useState(product?.baseUnit ?? "pcs");
  const [lowStockAt, setLowStockAt] = useState(String(product?.lowStockAt ?? 10));
  const [retailPrice, setRetailPrice] = useState(String(product?.retailPrice ?? ""));
  const [wholesalePrice, setWholesalePrice] = useState(String(product?.wholesalePrice ?? ""));
  const [openingStock, setOpeningStock] = useState("0");
  const [units, setUnits] = useState<UnitsDraft[]>(
    product?.units.map((u) => ({ name: u.name, factor: String(u.factor) })) ?? [],
  );

  const presets = UNIT_PRESETS[baseUnit] ?? [];

  function addPreset(preset?: { name: string; factor: number }) {
    setUnits((prev) => {
      if (preset) {
        if (prev.some((u) => u.name.toLowerCase() === preset.name.toLowerCase())) return prev;
        return [...prev, { name: preset.name, factor: String(preset.factor) }];
      }
      return [...prev, { name: "", factor: "" }];
    });
  }

  async function submit() {
    setBusy(true);
    const input = {
      name,
      category,
      barcode,
      baseUnit,
      lowStockAt: Number(lowStockAt) || 0,
      retailPrice: Number(retailPrice) || 0,
      wholesalePrice: Number(wholesalePrice) || 0,
      openingStock: Number(openingStock) || 0,
      units: units
        .filter((u) => u.name.trim())
        .map((u) => ({ name: u.name.trim(), factor: Number(u.factor) })),
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
            <div className="col-span-2">
              <Label htmlFor="p-name">Name *</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div>
              <Label htmlFor="p-category">Category</Label>
              <Input
                id="p-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Staples, Snacks…"
              />
            </div>
            <div>
              <Label htmlFor="p-barcode">
                <span className="inline-flex items-center gap-1">
                  <ScanBarcode size={13} /> Barcode
                </span>
              </Label>
              <Input
                id="p-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type…"
              />
            </div>
            <div>
              <Label>Base unit</Label>
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
            </div>
            <div>
              <Label htmlFor="p-low">Low-stock alert ({baseUnit})</Label>
              <Input
                id="p-low"
                type="number"
                min={0}
                step="any"
                value={lowStockAt}
                onChange={(e) => setLowStockAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="p-retail">Retail price / {baseUnit} *</Label>
              <Input
                id="p-retail"
                type="number"
                min={0}
                step="0.01"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="p-wholesale">Wholesale price / {baseUnit} *</Label>
              <Input
                id="p-wholesale"
                type="number"
                min={0}
                step="0.01"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                required
              />
            </div>
            {!product && (
              <div className="col-span-2">
                <Label htmlFor="p-opening">Opening stock ({baseUnit})</Label>
                <Input
                  id="p-opening"
                  type="number"
                  min={0}
                  step="any"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="mb-0">Sell units (packs &amp; fractions)</Label>
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
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={u.name}
                      onChange={(e) =>
                        setUnits((prev) => prev.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="Name (Carton)"
                      className="flex-1"
                    />
                    <span className="text-xs whitespace-nowrap text-muted-foreground">=</span>
                    <Input
                      value={u.factor}
                      onChange={(e) =>
                        setUnits((prev) => prev.map((x, i) => (i === index ? { ...x, factor: e.target.value } : x)))
                      }
                      placeholder={`× ${baseUnit}`}
                      type="number"
                      step="any"
                      min={0}
                      className="w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove unit ${u.name || index + 1}`}
                      onClick={() => setUnits((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
  const [busy, setBusy] = useState(false);

  const options = [
    { name: product.baseUnit, factor: 1 },
    ...product.units.map((u) => ({ name: u.name, factor: u.factor })),
  ];
  const factor = options.find((o) => o.name === unitName)?.factor ?? 1;
  const qty = Number(quantity);

  const preview = useMemo(() => {
    if (!Number.isFinite(qty) || quantity === "") return null;
    if (mode === "COUNT") return `${formatQuantity(qty)} ${product.baseUnit} on shelf`;
    const delta = Math.round(qty * factor * 100) / 100;
    const signed = mode === "DAMAGE" || mode === "RETURN" ? -Math.abs(delta) : delta;
    return `${signed >= 0 ? "+" : "−"}${formatQuantity(Math.abs(signed))} ${product.baseUnit}`;
  }, [qty, quantity, mode, factor, product.baseUnit]);

  async function submit() {
    setBusy(true);
    const response = await adjustStock({
      productId: product.id,
      mode: mode as "PURCHASE" | "DAMAGE" | "RETURN" | "ADJUST" | "COUNT",
      quantity: qty,
      unitName: mode === "COUNT" ? product.baseUnit : unitName,
      note,
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
          <div>
            <Label>Type</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                if (!v) return;
                setMode(v);
                setUnitName(product.baseUnit);
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
          </div>

          {mode === "COUNT" ? (
            <div>
              <Label htmlFor="s-qty">Counted stock ({product.baseUnit})</Label>
              <Input
                id="s-qty"
                type="number"
                step="any"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus
                required
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="s-qty">Quantity</Label>
                <Input
                  id="s-qty"
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div>
                <Label>Unit</Label>
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
              </div>
            </div>
          )}

          {preview && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
              Effect: {preview}
            </p>
          )}

          <div>
            <Label htmlFor="s-note">Note (supplier, reason…)</Label>
            <Input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>

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
