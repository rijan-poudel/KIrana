"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Minus, PackageSearch, Pause, Plus, RotateCcw, ScanBarcode, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomerOption, PriceMode, ProductCardData } from "@/lib/types";
import { formatNPR, formatQuantity, formatTime, round2 } from "@/lib/format";
import { CART_STORAGE_KEY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import CheckoutDialog, { type CheckoutLine } from "./checkout-dialog";
import ScanDialog from "./scan-dialog";

type CartLine = { productId: string; quantity: number; unitName: string };

/** A bill parked mid-build while the shopkeeper serves the next customer. */
type HeldBill = {
  id: string;
  label: string; // name of the highest-value line, so it's recognisable at a glance
  mode: PriceMode;
  cart: CartLine[];
  total: number; // computed when held — display only
  heldAt: number;
};

/** All sellable units of a product: the base unit plus every configured pack size. */
export function unitOptions(product: ProductCardData) {
  return [{ name: product.baseUnit, factor: 1 }, ...product.units.map((u) => ({ name: u.name, factor: u.factor }))];
}

export function unitFactor(product: ProductCardData, unitName: string) {
  return unitOptions(product).find((u) => u.name === unitName)?.factor ?? 1;
}

export default function CounterClient({
  products,
  customers,
  quickIds,
}: {
  products: ProductCardData[];
  customers: CustomerOption[];
  quickIds: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PriceMode>("retail");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Quantity text being typed, keyed by cart line — lets the input hold
  // intermediate states like "" or "0." without deleting the line mid-edit.
  const [qtyDraft, setQtyDraft] = useState<{ key: string; value: string } | null>(null);
  const loadedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  // Restore the in-progress bill and any parked bills exactly once on mount —
  // a refresh mid-transaction must never wipe the counter cart.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { mode?: PriceMode; cart?: CartLine[]; held?: HeldBill[] };
      if (parsed.mode === "retail" || parsed.mode === "wholesale") setMode(parsed.mode);
      if (Array.isArray(parsed.cart)) {
        const restored: CartLine[] = [];
        for (const line of parsed.cart) {
          const product = typeof line?.productId === "string" ? productMap.get(line.productId) : undefined;
          if (!product) continue;
          const unit = unitOptions(product).find((u) => u.name === line.unitName) ?? unitOptions(product)[0];
          const quantity = Number(line?.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) continue;
          const capped = Math.min(quantity, product.stockQuantity / unit.factor);
          if (capped > 0) restored.push({ productId: product.id, quantity: capped, unitName: unit.name });
        }
        setCart(restored);
      }
      if (Array.isArray(parsed.held)) {
        const held: HeldBill[] = [];
        for (const bill of parsed.held) {
          if (typeof bill?.id !== "string" || !Array.isArray(bill.cart) || bill.cart.length === 0) continue;
          const modeOk = bill.mode === "retail" || bill.mode === "wholesale";
          held.push({
            id: bill.id,
            label: typeof bill.label === "string" && bill.label.trim() ? bill.label : "Held bill",
            mode: modeOk ? bill.mode : "retail",
            cart: bill.cart,
            total: Number(bill.total) || 0,
            heldAt: Number(bill.heldAt) || Date.now(),
          });
        }
        setHeldBills(held);
      }
    } catch {
      // Corrupted saved cart — start with a clean basket instead of crashing.
    }
  }, [productMap]);

  // Persist every cart change so the bill (and any parked bills) survive refreshes.
  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ mode, cart, held: heldBills }));
    } catch {
      // Storage unavailable — billing still works, it just won't survive a refresh.
    }
  }, [mode, cart, heldBills]);

  // F2 opens checkout from anywhere on the counter.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "F2" && cart.length > 0) {
        event.preventDefault();
        setCheckoutOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length]);

  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          (p.barcode ?? "").toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [products, term]);

  useEffect(() => setHighlight(0), [query]);

  const quickProducts = useMemo(
    () => quickIds.map((id) => productMap.get(id)).filter((p): p is ProductCardData => !!p),
    [quickIds, productMap],
  );

  const cartLines = useMemo<CheckoutLine[]>(() => {
    const lines: CheckoutLine[] = [];
    for (const line of cart) {
      const product = productMap.get(line.productId);
      if (!product) continue;
      const factor = unitFactor(product, line.unitName);
      const unitPrice = mode === "wholesale" ? product.wholesalePrice : product.retailPrice;
      const baseQuantity = round2(line.quantity * factor);
      lines.push({
        productId: product.id,
        name: product.name,
        quantity: line.quantity,
        unitName: line.unitName,
        factor,
        baseUnit: product.baseUnit,
        baseQuantity,
        unitPrice,
        subtotal: round2(unitPrice * baseQuantity),
      });
    }
    return lines;
  }, [cart, productMap, mode]);

  const cartTotal = round2(cartLines.reduce((sum, line) => sum + line.subtotal, 0));

  function addOne(productId: string, unitName?: string) {
    const product = productMap.get(productId);
    if (!product) return;
    const unit = unitName ?? product.baseUnit;
    const factor = unitFactor(product, unit);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId && l.unitName === unit);
      if (existing) {
        return prev.map((l) =>
          l === existing ? { ...l, quantity: Math.min(l.quantity + 1, product.stockQuantity / factor) } : l,
        );
      }
      if (product.stockQuantity <= 0) {
        toast.error(`${product.name} is out of stock.`);
        return prev;
      }
      // Cap the first tap at what's actually on the shelf (e.g. 0.5 kg left).
      return [...prev, { productId, quantity: Math.min(1, product.stockQuantity / factor), unitName: unit }];
    });
  }

  function setQuantity(productId: string, unitName: string, quantity: number) {
    const product = productMap.get(productId);
    if (!product) return;
    const factor = unitFactor(product, unitName);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setCart((prev) => prev.filter((l) => !(l.productId === productId && l.unitName === unitName)));
      return;
    }
    const capped = Math.min(quantity, product.stockQuantity / factor);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId && l.unitName === unitName);
      if (existing) return prev.map((l) => (l === existing ? { ...l, quantity: capped } : l));
      return capped > 0 ? [...prev, { productId, quantity: capped, unitName }] : prev;
    });
  }

  function setLineUnit(productId: string, fromUnit: string, toUnit: string) {
    const product = productMap.get(productId);
    if (!product) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId && l.unitName === fromUnit);
      if (!existing) return prev;
      // Merge into the target unit line if one exists (e.g. 3 pcs + 1 Carton).
      const target = prev.find((l) => l.productId === productId && l.unitName === toUnit && l !== existing);
      if (target) {
        const fromFactor = unitFactor(product, fromUnit);
        const toFactor = unitFactor(product, toUnit);
        const movedBase = existing.quantity * fromFactor;
        return prev
          .filter((l) => l !== existing)
          .map((l) =>
            l === target
              ? { ...l, quantity: Math.min(l.quantity + movedBase / toFactor, product.stockQuantity / toFactor) }
              : l,
          );
      }
      return prev.map((l) => (l === existing ? { ...l, unitName: toUnit } : l));
    });
  }

  function addFromSearch(product: ProductCardData) {
    addOne(product.id);
    setQuery("");
    setSearchOpen(false);
    searchRef.current?.focus();
  }

  function addFromScan(code: string) {
    const normalized = code.trim();
    const product = products.find((p) => (p.barcode ?? "").toLowerCase() === normalized.toLowerCase());
    if (!product) {
      toast.error(`No product has barcode ${normalized}. Add it in Stock first.`);
      return;
    }
    addOne(product.id);
    toast.success(`${product.name} added to the bill.`);
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && filtered.length > 0) {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && filtered.length > 0) {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setSearchOpen(false);
      return;
    }
    if (event.key !== "Enter") return;
    // Hardware barcode scanners type the code then press Enter. Read the input's
    // live value — React state can lag a fast scanner by a keystroke, and the
    // trailing characters are exactly what makes an exact barcode match fail.
    const typed = event.currentTarget.value.trim().toLowerCase();
    if (!typed) return;
    const exact = products.find((p) => (p.barcode ?? "").toLowerCase() === typed);
    const target = exact ?? filtered[0];
    if (target) addFromSearch(target);
  }

  /** "Bora Chawal" — the name of the line contributing the most money. */
  function describeCart() {
    let label = "Bill";
    let best = -1;
    for (const line of cart) {
      const product = productMap.get(line.productId);
      if (!product) continue;
      const subtotal = round2(
        (mode === "wholesale" ? product.wholesalePrice : product.retailPrice) *
          line.quantity *
          unitFactor(product, line.unitName),
      );
      if (subtotal > best) {
        best = subtotal;
        label = product.name;
      }
    }
    return { label, total: best >= 0 ? best : cartTotal };
  }

  /** Park the current bill so the next customer can be served. */
  function holdBill() {
    if (cart.length === 0) return;
    const { label, total } = describeCart();
    setHeldBills((prev) => [
      ...prev,
      { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, label, mode, cart, total, heldAt: Date.now() },
    ]);
    setCart([]);
    toast.success(`“${label}” held — the next customer is up.`);
  }

  /** Bring a parked bill back. If a new bill is half-built, hold it first. */
  function restoreHeld(id: string) {
    const held = heldBills.find((h) => h.id === id);
    if (!held) return;
    if (cart.length > 0) {
      const { label, total } = describeCart();
      setHeldBills((prev) => [
        ...prev.filter((h) => h.id !== id),
        { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, label, mode, cart, total, heldAt: Date.now() },
      ]);
    } else {
      setHeldBills((prev) => prev.filter((h) => h.id !== id));
    }
    const restored: CartLine[] = [];
    for (const line of held.cart) {
      const product = productMap.get(line.productId);
      if (!product) continue;
      const unit = unitOptions(product).find((u) => u.name === line.unitName) ?? unitOptions(product)[0];
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const capped = Math.min(quantity, product.stockQuantity / unit.factor);
      if (capped > 0) restored.push({ productId: product.id, quantity: capped, unitName: unit.name });
    }
    setMode(held.mode);
    setCart(restored);
    toast.success(`“${held.label}” restored to the counter.`);
  }

  function dropHeld(id: string) {
    const held = heldBills.find((h) => h.id === id);
    setHeldBills((prev) => prev.filter((h) => h.id !== id));
    if (held) toast.success(`Held bill “${held.label}” removed.`);
  }

  function handleCheckoutSuccess() {
    setCheckoutOpen(false);
    setCart([]);
    router.refresh();
    searchRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-28 md:px-8 md:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Counter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan, search or tap — the bill survives refreshes until the sale is done.
          </p>
        </div>
        <Button variant="outline" size="lg" onClick={() => setScanOpen(true)}>
          <ScanBarcode /> Scan camera
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: search + top sellers + product grid */}
        <section>
          <div className="relative">
            <Search
              size={20}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
              onKeyDown={handleSearchKey}
              type="text"
              placeholder="Search or scan a barcode…"
              autoComplete="off"
              className="h-14 pl-12 text-lg"
              aria-label="Search or scan products"
            />
            {searchOpen && term && (
              <div
                className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-md"
                // Keep the input focused when a result is clicked, so scanning can continue.
                onMouseDown={(e) => e.preventDefault()}
              >
                {filtered.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    No products match “{query}”. Add the item in Stock first.
                  </p>
                )}
                {filtered.map((p, index) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => addFromSearch(p)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                      index === highlight && "bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="min-w-0 truncate font-medium">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {formatNPR(mode === "wholesale" ? p.wholesalePrice : p.retailPrice)}/{p.baseUnit}
                      </span>
                      <Badge
                        variant={
                          p.stockQuantity <= 0 ? "destructive" : p.stockQuantity <= p.lowStockAt ? "warning" : "muted"
                        }
                      >
                        {formatQuantity(p.stockQuantity)} {p.baseUnit}
                      </Badge>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {quickProducts.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">Top sellers</h2>
              <div className="flex flex-wrap gap-2">
                {quickProducts.map((p) => (
                  <Button
                    key={`quick-${p.id}`}
                    variant="outline"
                    size="lg"
                    className="h-11"
                    onClick={() => addOne(p.id)}
                    disabled={p.stockQuantity <= 0}
                  >
                    {p.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      {formatNPR(mode === "wholesale" ? p.wholesalePrice : p.retailPrice)}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <h2 className="mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
              All products ({products.length})
            </h2>
            {products.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-8 text-center">
                <PackageSearch size={32} className="text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  No products yet. Add your first item on the Stock screen.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <ProductButton key={p.id} product={p} mode={mode} onAdd={() => addOne(p.id)} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right: the running bill */}
        <aside className="self-start lg:sticky lg:top-8">
          <div className="card flex flex-col">
            <div className="grid grid-cols-2 gap-2 border-b border-border p-3">
              <button
                type="button"
                onClick={() => setMode("retail")}
                aria-pressed={mode === "retail"}
                className={cn(
                  "h-14 rounded-xl text-base font-bold transition-colors",
                  mode === "retail"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                Retail
                <span
                  className={cn(
                    "block text-xs font-medium",
                    mode === "retail" ? "text-primary-foreground/70" : "text-muted-foreground/70",
                  )}
                >
                  Counter rate
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("wholesale")}
                aria-pressed={mode === "wholesale"}
                className={cn(
                  "h-14 rounded-xl text-base font-bold transition-colors",
                  mode === "wholesale"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                Wholesale
                <span
                  className={cn(
                    "block text-xs font-medium",
                    mode === "wholesale" ? "text-primary-foreground/70" : "text-muted-foreground/70",
                  )}
                >
                  Bulk rate
                </span>
              </button>
            </div>

            <div className="max-h-[42vh] min-h-[120px] overflow-y-auto px-3 py-2">
              {cartLines.length === 0 ? (
                <div className="flex h-[120px] flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ShoppingCart size={28} />
                  <p className="text-sm font-medium">Cart is empty — scan, search or tap products.</p>
                </div>
              ) : (
                cartLines.map((line) => {
                  const product = productMap.get(line.productId)!;
                  const lineKey = `${line.productId}-${line.unitName}`;
                  return (
                    <div
                      key={lineKey}
                      className="border-b border-border/60 py-2.5 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-foreground">{line.name}</p>
                        <button
                          type="button"
                          aria-label={`Remove ${line.name}`}
                          onClick={() => setQuantity(line.productId, line.unitName, 0)}
                          className="shrink-0 rounded p-1 text-muted-foreground/60 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex shrink-0 items-center rounded-lg border border-input">
                          <button
                            type="button"
                            aria-label={`Decrease ${line.name}`}
                            onClick={() => setQuantity(line.productId, line.unitName, line.quantity - 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-muted"
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            value={qtyDraft?.key === lineKey ? qtyDraft.value : String(line.quantity)}
                            inputMode="decimal"
                            aria-label={`Quantity of ${line.name} in ${line.unitName}`}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setQtyDraft({ key: lineKey, value: raw });
                              const value = Number.parseFloat(raw);
                              // Commit only valid positive values; "0", "" or "0." stay as
                              // editable drafts until the field blurs.
                              if (Number.isFinite(value) && value > 0) {
                                setQuantity(line.productId, line.unitName, value);
                              }
                            }}
                            onFocus={(e) => e.currentTarget.select()}
                            onBlur={() => setQtyDraft(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            className="h-9 w-14 border-x border-input text-center text-sm font-semibold text-foreground focus:outline-none"
                          />
                          <button
                            type="button"
                            aria-label={`Increase ${line.name}`}
                            onClick={() => addOne(line.productId, line.unitName)}
                            className="flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-muted"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <Select
                          value={line.unitName}
                          onValueChange={(v) => v && setLineUnit(line.productId, line.unitName, v)}
                        >
                          <SelectTrigger size="sm" className="w-[110px]" aria-label={`Unit for ${line.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {unitOptions(product).map((u) => (
                              <SelectItem key={u.name} value={u.name}>
                                {u.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="min-w-0 flex-1 text-right">
                          <div className="text-sm font-bold text-foreground">{formatNPR(line.subtotal)}</div>
                          {line.factor !== 1 && (
                            <div className="text-[11px] text-muted-foreground">
                              = {formatQuantity(line.baseQuantity)} {line.baseUnit}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-foreground">{formatNPR(cartTotal)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={cartLines.length === 0}
                  onClick={holdBill}
                  className="h-14 flex-1"
                  title="Park this bill and serve the next customer — bring it back anytime with Restore."
                >
                  <Pause /> Hold
                </Button>
                <Button
                  type="button"
                  size="lg"
                  disabled={cartLines.length === 0}
                  onClick={() => setCheckoutOpen(true)}
                  className="h-14 flex-1 text-lg"
                >
                  <ShoppingCart /> Checkout <span className="text-xs font-normal opacity-70">F2</span>
                </Button>
              </div>
            </div>
          </div>

          {heldBills.length > 0 && (
            <section className="card mt-4 p-4" aria-label="Held bills">
              <h2 className="text-base font-bold text-foreground">
                Held bills <span className="text-muted-foreground">({heldBills.length})</span>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Parked while you served somebody else — tap Restore to bring one back to the counter.
              </p>
              <div className="mt-3 space-y-2">
                {heldBills.map((held) => (
                  <div key={held.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{held.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatNPR(held.total)} • {held.cart.length} item{held.cart.length === 1 ? "" : "s"} • held{" "}
                        {formatTime(new Date(held.heldAt))}
                        {held.mode === "wholesale" ? " • wholesale" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" className="h-8" onClick={() => restoreHeld(held.id)}>
                        <RotateCcw /> Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete held bill ${held.label}`}
                        className="hover:text-red-600"
                        onClick={() => dropHeld(held.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        mode={mode}
        total={cartTotal}
        lines={cartLines}
        customers={customers}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
      />

      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} onDetected={addFromScan} />

      {/* Mobile: the cart panel stacks below the product grid, so keep the
          total + checkout reachable with a fixed bar instead of scrolling. */}
      {cartLines.length > 0 && !checkoutOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {cartLines.length} item{cartLines.length === 1 ? "" : "s"} in the bill
              </p>
              <p className="text-lg leading-tight font-bold text-foreground">{formatNPR(cartTotal)}</p>
            </div>
            <Button size="lg" className="h-12 px-6 text-base" onClick={() => setCheckoutOpen(true)}>
              <ShoppingCart /> Checkout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductButton({
  product,
  mode,
  onAdd,
}: {
  product: ProductCardData;
  mode: PriceMode;
  onAdd: () => void;
}) {
  const outOfStock = product.stockQuantity <= 0;
  const low = !outOfStock && product.stockQuantity <= product.lowStockAt;
  const price = mode === "wholesale" ? product.wholesalePrice : product.retailPrice;

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={outOfStock}
      className={cn(
        "card flex min-h-20 flex-col items-start p-3.5 text-left transition-colors hover:border-ring hover:shadow active:bg-muted",
        outOfStock && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="line-clamp-2 text-sm font-bold text-foreground md:text-base">{product.name}</span>
      <span className="mt-1 text-xs text-muted-foreground">{product.category}</span>
        <span className="mt-2 flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-base font-bold whitespace-nowrap text-primary md:text-lg">
            {formatNPR(price)}
            <span className="text-xs font-medium text-muted-foreground">/{product.baseUnit}</span>
          </span>
        {outOfStock ? (
          <Badge variant="destructive">Out</Badge>
        ) : low ? (
          <Badge variant="warning">{formatQuantity(product.stockQuantity)} left</Badge>
        ) : (
          <Badge variant="muted">
            {formatQuantity(product.stockQuantity)} {product.baseUnit}
          </Badge>
        )}
      </span>
    </button>
  );
}
