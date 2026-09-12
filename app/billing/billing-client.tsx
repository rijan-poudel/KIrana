"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { PackageSearch, ScanBarcode, Search, ShoppingCart } from "lucide-react";
import type { CustomerOption, PriceMode, ProductCardData } from "@/lib/types";
import { formatNPR, formatQuantity, round2 } from "@/lib/format";
import { CART_STORAGE_KEY, LOW_STOCK_THRESHOLD, STAPLE_KEYWORDS } from "@/lib/constants";
import CheckoutModal from "./checkout-modal";

type CartLine = { productId: string; quantity: number };

export type CheckoutLine = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export default function BillingClient({
  products,
  customers,
}: {
  products: ProductCardData[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PriceMode>("retail");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const loadedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  // Restore the in-progress bill exactly once on mount — a refresh mid-transaction
  // must never wipe the counter cart.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { mode?: PriceMode; cart?: CartLine[] };
      if (parsed.mode === "retail" || parsed.mode === "wholesale") setMode(parsed.mode);
      if (Array.isArray(parsed.cart)) {
        const restored: CartLine[] = [];
        for (const line of parsed.cart) {
          const product = typeof line?.productId === "string" ? productMap.get(line.productId) : undefined;
          const quantity = Number(line?.quantity);
          if (!product || !Number.isFinite(quantity) || quantity <= 0) continue;
          const capped = Math.min(quantity, product.stockQuantity);
          if (capped > 0) restored.push({ productId: product.id, quantity: capped });
        }
        setCart(restored);
      }
    } catch {
      // Corrupted saved cart — start with a clean basket instead of crashing.
    }
  }, [productMap]);

  // Persist every cart change so the bill survives accidental refreshes.
  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ mode, cart }));
    } catch {
      // Storage unavailable — billing still works, it just won't survive a refresh.
    }
  }, [mode, cart]);

  const quickProducts = useMemo(() => {
    const picked: ProductCardData[] = [];
    for (const keyword of STAPLE_KEYWORDS) {
      if (picked.length >= 8) break;
      const match = products.find((p) => p.name.toLowerCase().includes(keyword) && !picked.includes(p));
      if (match) picked.push(match);
    }
    return picked;
  }, [products]);

  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        (p.barcode ?? "").toLowerCase().includes(term),
    );
  }, [products, term]);

  const cartLines = useMemo<CheckoutLine[]>(() => {
    const lines: CheckoutLine[] = [];
    for (const line of cart) {
      const product = productMap.get(line.productId);
      if (!product) continue;
      const unitPrice = mode === "wholesale" ? product.wholesalePrice : product.retailPrice;
      lines.push({
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: line.quantity,
        unitPrice,
        subtotal: round2(unitPrice * line.quantity),
      });
    }
    return lines;
  }, [cart, productMap, mode]);

  const cartTotal = round2(cartLines.reduce((sum, line) => sum + line.subtotal, 0));
  const totalItems = cartLines.reduce((sum, line) => sum + line.quantity, 0);

  function addOne(productId: string) {
    const product = productMap.get(productId);
    if (!product || product.stockQuantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (!existing) return [...prev, { productId, quantity: 1 }];
      return prev.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.min(l.quantity + 1, product.stockQuantity) } : l,
      );
    });
  }

  function setQuantity(productId: string, quantity: number) {
    const product = productMap.get(productId);
    if (!product) return;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    const capped = Math.min(quantity, product.stockQuantity);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (!existing) return capped > 0 ? [...prev, { productId, quantity: capped }] : prev;
      return prev.map((l) => (l.productId === productId ? { ...l, quantity: capped } : l));
    });
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  // Barcode scanners "type" the code and press Enter — snap that Enter onto the
  // exact barcode match (or the first hit) for one-scan billing.
  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !term) return;
    const exactBarcode = products.find((p) => (p.barcode ?? "").toLowerCase() === term);
    const target = exactBarcode ?? filtered[0];
    if (!target) return;
    addOne(target.id);
    setQuery("");
  }

  function handleCheckoutSuccess() {
    setCheckoutOpen(false);
    setCart([]);
    router.refresh();
    searchRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Counter Billing</h1>
        <p className="mt-1 text-slate-500">
          Tap products to build the bill — the cart survives page refreshes until the sale is completed.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: search + quick grid + product grid */}
        <section>
          <div className="relative">
            <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              type="text"
              placeholder="Search item name, category, or scan barcode…"
              autoFocus
              className="input h-14 pl-12 text-lg"
            />
          </div>

          {quickProducts.length > 0 && !term && (
            <div className="mt-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Quick Items</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {quickProducts.map((p) => (
                  <ProductButton key={`quick-${p.id}`} product={p} mode={mode} onAdd={() => addOne(p.id)} large />
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
              {term ? `Search Results (${filtered.length})` : `All Products (${filtered.length})`}
            </h2>
            {filtered.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-8 text-center">
                <PackageSearch size={32} className="text-slate-300" />
                <p className="text-sm font-medium text-slate-500">
                  No products match “{query}”. Check the spelling or add the item in Inventory.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => (
                  <ProductButton key={p.id} product={p} mode={mode} onAdd={() => addOne(p.id)} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right: cart with the prominent pricing switcher on top */}
        <aside className="self-start lg:sticky lg:top-8">
          <div className="card flex flex-col">
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3">
              <button
                type="button"
                onClick={() => setMode("retail")}
                aria-pressed={mode === "retail"}
                className={`h-14 rounded-xl text-base font-bold transition-colors ${
                  mode === "retail" ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Retail
                <span className={`block text-xs font-medium ${mode === "retail" ? "text-emerald-100" : "text-slate-400"}`}>
                  Counter price
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("wholesale")}
                aria-pressed={mode === "wholesale"}
                className={`h-14 rounded-xl text-base font-bold transition-colors ${
                  mode === "wholesale" ? "bg-slate-900 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Wholesale
                <span className={`block text-xs font-medium ${mode === "wholesale" ? "text-slate-300" : "text-slate-400"}`}>
                  Bhatta price
                </span>
              </button>
            </div>

            <div className="max-h-[42vh] min-h-[120px] overflow-y-auto px-3 py-2">
              {cartLines.length === 0 ? (
                <div className="flex h-[120px] flex-col items-center justify-center gap-2 text-slate-400">
                  <ShoppingCart size={28} />
                  <p className="text-sm font-medium">Cart is empty — tap products to add.</p>
                </div>
              ) : (
                cartLines.map((line) => (
                  <div key={line.productId} className="flex items-center gap-2 border-b border-slate-100 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{line.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatNPR(line.unitPrice)} / {line.unit}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center rounded-lg border border-slate-300">
                      <button
                        type="button"
                        aria-label={`Decrease ${line.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-l-lg text-slate-600 hover:bg-slate-100"
                      >
                        −
                      </button>
                      <input
                        value={String(line.quantity)}
                        inputMode="decimal"
                        aria-label={`Quantity of ${line.name}`}
                        onChange={(e) => {
                          const value = Number.parseFloat(e.target.value);
                          if (!Number.isNaN(value)) setQuantity(line.productId, value);
                        }}
                        className="h-9 w-14 border-x border-slate-300 text-center text-sm font-semibold text-slate-900 focus:outline-none"
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${line.name}`}
                        onClick={() => addOne(line.productId)}
                        className="flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-600 hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                    <div className="w-20 shrink-0 text-right text-sm font-bold text-slate-900">{formatNPR(line.subtotal)}</div>
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => removeLine(line.productId)}
                      className="shrink-0 rounded p-1 text-slate-300 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-slate-600">
                  Total <span className="text-sm font-normal text-slate-400">({formatQuantity(totalItems)} units)</span>
                </span>
                <span className="text-2xl font-bold text-slate-900">{formatNPR(cartTotal)}</span>
              </div>
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={() => setCheckoutOpen(true)}
                className="btn-primary mt-3 h-14 w-full text-lg"
              >
                <ShoppingCart size={20} />
                Checkout
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* key remounts the modal whenever it opens/closes so its state always
          starts fresh from the current props — and a post-sale data refresh can
          never wipe the success receipt. */}
      <CheckoutModal
        key={checkoutOpen ? "open" : "closed"}
        open={checkoutOpen}
        mode={mode}
        total={cartTotal}
        lines={cartLines}
        customers={customers}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
      />
    </div>
  );
}

function ProductButton({
  product,
  mode,
  onAdd,
  large = false,
}: {
  product: ProductCardData;
  mode: PriceMode;
  onAdd: () => void;
  large?: boolean;
}) {
  const outOfStock = product.stockQuantity <= 0;
  const low = !outOfStock && product.stockQuantity <= LOW_STOCK_THRESHOLD;
  const price = mode === "wholesale" ? product.wholesalePrice : product.retailPrice;

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={outOfStock}
      className={`card flex flex-col items-start p-3.5 text-left transition-colors hover:border-emerald-500 hover:shadow ${
        outOfStock ? "cursor-not-allowed opacity-50" : "active:bg-emerald-50"
      } ${large ? "min-h-24" : "min-h-20"}`}
    >
      <span className="line-clamp-2 text-sm font-bold text-slate-900 md:text-base">{product.name}</span>
      <span className="mt-1 text-xs text-slate-400">{product.category}</span>
      <span className="mt-2 flex w-full items-center justify-between">
        <span className="text-base font-bold text-emerald-700 md:text-lg">
          {formatNPR(price)}
          <span className="text-xs font-medium text-slate-400">/{product.unit}</span>
        </span>
        {outOfStock ? (
          <span className="badge-red">Out</span>
        ) : low ? (
          <span className="badge-amber">{formatQuantity(product.stockQuantity)} left</span>
        ) : (
          <span className="badge-slate">{formatQuantity(product.stockQuantity)} {product.unit}</span>
        )}
      </span>
    </button>
  );
}
