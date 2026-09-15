"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  Check,
  FileText,
  Pause,
  Pencil,
  Plus,
  RotateCcw,
  ScanBarcode,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CustomerOption, PriceMode, ProductCardData, SellAs } from "@/lib/types";
import { formatDate, formatNPR, formatQuantity, formatTime, round2 } from "@/lib/format";
import { CART_STORAGE_KEY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import CheckoutDialog, { type CheckoutLine } from "./checkout-dialog";
import ScanDialog from "./scan-dialog";
import CustomerPicker from "./customer-picker";
import ProductQuickAddDialog from "./product-quick-add";
import PriceEditorDialog from "./price-editor-dialog";

type CartLine = {
  productId: string;
  quantity: number;
  unitName: string;
  /** Rate per unitName, exactly as charged — auto-filled from the shelf price, freely editable. */
  rate: number;
  /** Bhaansi given on this line, in rupees. */
  discount: number;
};

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

/* ── Unit colour coding — one glance says kg vs pcs vs dozen ─────────────── */
type UnitTone = "kg" | "liter" | "dozen" | "pcs" | "default";

const UNIT_TONE_CLASSES: Record<UnitTone, string> = {
  kg: "border-eager-green/40 bg-eager-green/10 text-eager-green",
  liter: "border-pan-amber/50 bg-pan-amber/10 text-pan-amber",
  dozen: "border-purple-400/50 bg-purple-100 text-purple-700",
  pcs: "border-spark-blue/40 bg-spark-blue/10 text-spark-blue",
  default: "border-border bg-muted text-pencil-gray",
};

function unitTone(baseUnit: string, unitName: string): UnitTone {
  const u = unitName.toLowerCase();
  if (u.includes("dozen")) return "dozen";
  if (u.includes("liter") || u.includes("ml")) return "liter";
  // Pack sizes inherit the tone of what they pack: a Bora is 5 kg, so it's green.
  const base = baseUnit.toLowerCase();
  if (base.includes("kg")) return "kg";
  if (base.includes("liter")) return "liter";
  if (base.includes("pcs")) return "pcs";
  return "default";
}

function UnitChip({
  product,
  unitName,
  className,
}: {
  product: ProductCardData;
  unitName: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold",
        UNIT_TONE_CLASSES[unitTone(product.baseUnit, unitName)],
        className,
      )}
    >
      {unitName}
    </span>
  );
}

/** Shelf price for one unitName under the given mode — the auto-filled rate. */
function defaultRate(product: ProductCardData, unitName: string, mode: PriceMode): number {
  const price = mode === "wholesale" ? product.wholesalePrice : product.retailPrice;
  return round2(price * unitFactor(product, unitName));
}

/* ── Category → colour mapping (stable, derived from the name) ─────────── */
type CategoryTone = { dot: string; chip: string };

const CATEGORY_TONES: CategoryTone[] = [
  { dot: "bg-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { dot: "bg-amber-500", chip: "border-amber-200 bg-amber-50 text-amber-800" },
  { dot: "bg-sky-500", chip: "border-sky-200 bg-sky-50 text-sky-800" },
  { dot: "bg-violet-500", chip: "border-violet-200 bg-violet-50 text-violet-800" },
  { dot: "bg-rose-500", chip: "border-rose-200 bg-rose-50 text-rose-800" },
  { dot: "bg-lime-600", chip: "border-lime-200 bg-lime-50 text-lime-800" },
  { dot: "bg-orange-500", chip: "border-orange-200 bg-orange-50 text-orange-800" },
  { dot: "bg-cyan-500", chip: "border-cyan-200 bg-cyan-50 text-cyan-800" },
];

function categoryTone(category: string): CategoryTone {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
}

/** Column rhythm for the bill sheet — header and every row share it, so the
 *  bill lines up like a real paper bill. */
const BILL_GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_9.5rem_4.75rem_4.25rem_5.5rem_1.5rem] items-center gap-1.5";

export default function CounterClient({
  products,
  customers,
  quickIds,
  todayStats,
}: {
  products: ProductCardData[];
  customers: CustomerOption[];
  quickIds: string[];
  todayStats: { bills: number; salesValue: number; cashCollected: number };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PriceMode>("retail");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  // A regular customer pinned on the counter: every bill is charged to them and
  // checkout skips the "who is this?" step. Stays until explicitly cleared.
  const [pinnedCustomerId, setPinnedCustomerId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [category, setCategory] = useState("all");
  const [scanOpen, setScanOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ barcode: string } | null>(null);
  const [quickAddResumeScan, setQuickAddResumeScan] = useState(false);
  // Products created mid-scan that haven't landed in the server-rehydrated
  // `products` prop yet.  Merged into `workingProducts` so cart lines render
  // immediately, even before a page refresh.
  const [localProducts, setLocalProducts] = useState<ProductCardData[]>([]);
  // Text being typed into a bill cell (qty / rate / disc), keyed by line — lets
  // an input hold intermediate states like "" or "0." without losing the line.
  const [cellDraft, setCellDraft] = useState<{
    key: string;
    field: "qty" | "rate" | "disc";
    value: string;
  } | null>(null);
  // Live clock for the masthead and the bill header.
  const [now, setNow] = useState(() => new Date());
  // "Scan accepted" cue at the search box — the counter silently ringed up.
  const [scanFlash, setScanFlash] = useState(false);
  // PAN bill: off for everyday sales; switched on, the bill becomes a formal
  // invoice with a number and the whole sheet turns amber so nobody mistakes it.
  const [panMode, setPanMode] = useState(false);
  const [panNumber, setPanNumber] = useState("");
  // Product whose shelf price is being fixed from the counter.
  const [priceEdit, setPriceEdit] = useState<ProductCardData | null>(null);
  const scanFlashTimer = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Scroll target of the bill's line list + the keys already rendered, so a
  // freshly scanned line gets a one-time entrance and the list stays pinned
  // to the newest item.
  const billLinesRef = useRef<HTMLDivElement>(null);
  const seenLineKeysRef = useRef<Set<string>>(new Set());

  // ── Hardware scanner state ─────────────────────────────────────────────
  // A USB scanner is just a keyboard that types a code in one fast burst and
  // hits Enter. We watch the capture phase so a scan lands on the bill even
  // when focus is in a quantity input, a customer field, or anywhere else the
  // digits would otherwise corrupt.
  const scanBufRef = useRef("");
  const scanPrevTsRef = useRef(0);
  const scanStartRef = useRef(0);
  const scanSlowRef = useRef(false);
  // Latest versions of the pieces the keydown listener reads, so it never
  // captures a stale closure no matter how many renders have passed.
  const scanRouteRef = useRef((_code: string) => {});
  const scanCueRef = useRef<() => void>(() => {});
  const scanGuardRef = useRef(false);

  // When a product is created from an unknown barcode and server revalidation
  // hasn't landed yet, the local copy keeps the cart rendering correct.
  const workingProducts = useMemo(() => {
    const localById = new Map(localProducts.map((p) => [p.id, p]));
    return [...products.filter((p) => !localById.has(p.id)), ...localById.values()];
  }, [products, localProducts]);

  const workingProductMap = useMemo(() => new Map(workingProducts.map((p) => [p.id, p] as const)), [workingProducts]);

  // Barcode → product, keyed once by lowercase so every scan is an O(1) lookup
  // instead of a linear scan of the whole catalog.
  const barcodeMap = useMemo(() => {
    const map = new Map<string, ProductCardData>();
    for (const p of workingProducts) {
      const code = (p.barcode ?? "").toLowerCase();
      if (code) map.set(code, p);
    }
    return map;
  }, [workingProducts]);

  // Lowercased once up front so a fast scanner typing in a barcode never pays
  // for repeated toLowerCase() calls on every keystroke.
  const searchIndex = useMemo(
    () =>
      workingProducts.map((p) => ({
        p,
        name: p.name.toLowerCase(),
        category: p.category.toLowerCase(),
        barcode: (p.barcode ?? "").toLowerCase(),
      })),
    [workingProducts],
  );

  // Restore the in-progress bill and any parked bills exactly once on mount —
  // a refresh mid-transaction must never wipe the counter cart. Lines saved by
  // older builds (no rate/discount) get their rate backfilled from the shelf.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        mode?: PriceMode;
        cart?: CartLine[];
        held?: HeldBill[];
        customerId?: string | null;
      };
      const parsedMode: PriceMode = parsed.mode === "wholesale" ? "wholesale" : "retail";
      if (parsed.mode === "retail" || parsed.mode === "wholesale") setMode(parsed.mode);
      if (typeof parsed.customerId === "string" && customers.some((c) => c.id === parsed.customerId)) {
        setPinnedCustomerId(parsed.customerId);
      }
      if (Array.isArray(parsed.cart)) {
        const restored: CartLine[] = [];
        for (const line of parsed.cart) {
          const product = typeof line?.productId === "string" ? workingProductMap.get(line.productId) : undefined;
          if (!product) continue;
          const unit = unitOptions(product).find((u) => u.name === line.unitName) ?? unitOptions(product)[0];
          const quantity = Number(line?.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) continue;
          const capped = Math.min(quantity, product.stockQuantity / unit.factor);
          if (capped <= 0) continue;
          const rate = Number(line?.rate);
          restored.push({
            productId: product.id,
            quantity: capped,
            unitName: unit.name,
            rate: Number.isFinite(rate) && rate > 0 ? round2(rate) : defaultRate(product, unit.name, parsedMode),
            discount: Math.max(0, Number(line?.discount) || 0),
          });
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
  }, [workingProductMap, customers]);

  // Persist every cart change so the bill (and any parked bills) survive refreshes.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ mode, cart, held: heldBills, customerId: pinnedCustomerId }),
      );
    } catch {
      // Storage unavailable — billing still works, it just won't survive a refresh.
    }
  }, [mode, cart, heldBills, pinnedCustomerId]);

  // Keep the counter clock fresh — receipts and held-bill timing depend on it.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Clear any pending scan cue timer when the page unmounts.
  useEffect(
    () => () => {
      if (scanFlashTimer.current) window.clearTimeout(scanFlashTimer.current);
    },
    [],
  );

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

  // Hardware barcode scanner: recognises the tell-tale fast burst and routes
  // the code to the bill from wherever focus happens to be. Characters arrive
  // with a sub-80ms gap; a human never types that fast, so normal typing and
  // Enter-to-search keep working unchanged.
  useEffect(() => {
    const SCAN_GAP_MAX = 80; // ms between keystrokes
    const SCAN_WINDOW = 1800; // ms allowance for the whole code
    const SCAN_MIN_LEN = 4;

    function onScanKey(event: globalThis.KeyboardEvent) {
      if (scanGuardRef.current) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const now = performance.now();
      const gap = now - scanPrevTsRef.current;
      scanPrevTsRef.current = now;

      if (event.key.length === 1) {
        const buf = scanBufRef.current;
        if (buf.length > 0 && gap > SCAN_GAP_MAX) scanSlowRef.current = true;
        if (buf.length === 0) scanStartRef.current = now;
        if (buf.length === 1 && gap <= SCAN_GAP_MAX) {
          // Second character arrived instantly — it's a scanner, not a human.
          // Pull focus back to the search box so the rest of the code types
          // there instead of into whatever field happened to be focused.
          if (document.activeElement && document.activeElement !== searchRef.current) {
            searchRef.current?.focus();
          }
        }
        scanBufRef.current = buf + event.key;
        return;
      }

      if (event.key === "Enter") {
        const code = scanBufRef.current;
        const isBurst = !scanSlowRef.current && code.length >= SCAN_MIN_LEN;
        const inWindow = now - scanStartRef.current <= SCAN_WINDOW;
        const digits = code.replace(/[^0-9]/g, "").length;
        scanBufRef.current = "";
        scanSlowRef.current = false;
        if (isBurst && inWindow && (digits >= 3 || code.length >= 8)) {
          event.preventDefault();
          event.stopPropagation();
          // Commit anything mid-edit so focus lands somewhere safe.
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          setQuery("");
          setSearchOpen(false);
          scanRouteRef.current(code);
          scanCueRef.current();
          browseRefocus();
        }
      }
    }
    document.addEventListener("keydown", onScanKey, true);
    return () => document.removeEventListener("keydown", onScanKey, true);
  }, []);

  // Keep the newest bill line visible as the basket grows — a long receipt
  // must never push the item you just scanned out of view.
  useEffect(() => {
    const el = billLinesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cart]);

  const term = query.trim().toLowerCase();

  /** Is this product available in the current retail/wholesale mode? */
  function isSoldInMode(p: ProductCardData): boolean {
    if (mode === "wholesale") return p.sellAs !== "RETAIL";
    return p.sellAs !== "WHOLESALE";
  }

  const searchResults = useMemo(() => {
    if (!term) return [];
    return searchIndex
      .filter((s) => (s.name.includes(term) || s.category.includes(term) || s.barcode.includes(term)) && isSoldInMode(s.p))
      .slice(0, 8)
      .map((s) => s.p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIndex, term, mode]);

  useEffect(() => setHighlight(0), [query]);

  const categories = useMemo(
    () => [...new Set(workingProducts.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [workingProducts],
  );

  const browseProducts = useMemo(
    () => workingProducts.filter((p) => (category === "all" || p.category === category) && isSoldInMode(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workingProducts, category, mode],
  );

  const quickProducts = useMemo(
    () => quickIds.map((id) => workingProductMap.get(id)).filter((p): p is ProductCardData => !!p && isSoldInMode(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quickIds, workingProductMap, mode],
  );

  /** Bill lines with every number the sheet and checkout need. The rate on the
   *  bill is the contract — overridden rates flow to the ledger unchanged. */
  const cartLines = useMemo<CheckoutLine[]>(() => {
    const lines: CheckoutLine[] = [];
    for (const line of cart) {
      const product = workingProductMap.get(line.productId);
      if (!product) continue;
      const factor = unitFactor(product, line.unitName);
      const baseQuantity = round2(line.quantity * factor);
      const gross = round2(line.quantity * line.rate);
      const lineDiscount = Math.min(Math.max(0, round2(line.discount)), gross);
      lines.push({
        productId: product.id,
        name: product.name,
        quantity: line.quantity,
        unitName: line.unitName,
        factor,
        baseUnit: product.baseUnit,
        baseQuantity,
        unitPrice: factor === 1 ? line.rate : round2(line.rate / factor),
        subtotal: round2(gross - lineDiscount),
        rate: line.rate,
        lineDiscount,
      });
    }
    return lines;
  }, [cart, workingProductMap]);

  const cartTotal = round2(cartLines.reduce((sum, line) => sum + line.subtotal, 0));
  const billDiscountTotal = round2(cartLines.reduce((sum, line) => sum + line.lineDiscount, 0));

  function addOne(productId: string, unitName?: string) {
    const product = workingProductMap.get(productId);
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
      return [
        ...prev,
        {
          productId,
          quantity: Math.min(1, product.stockQuantity / factor),
          unitName: unit,
          rate: defaultRate(product, unit, mode),
          discount: 0,
        },
      ];
    });
  }

  function setQuantity(productId: string, unitName: string, quantity: number) {
    const product = workingProductMap.get(productId);
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
      return capped > 0
        ? [
            ...prev,
            { productId, quantity: capped, unitName, rate: defaultRate(product, unitName, mode), discount: 0 },
          ]
        : prev;
    });
  }

  /** The rate on the bill is whatever the shopkeeper says it is. */
  function setLineRate(productId: string, unitName: string, rate: number) {
    const safe = Number.isFinite(rate) && rate >= 0 ? round2(rate) : 0;
    setCart((prev) =>
      prev.map((l) => (l.productId === productId && l.unitName === unitName ? { ...l, rate: safe } : l)),
    );
  }

  /** Per-line bhaansi in rupees — never lets a line go negative. */
  function setLineDiscount(productId: string, unitName: string, discount: number) {
    const safe = Number.isFinite(discount) && discount >= 0 ? round2(discount) : 0;
    setCart((prev) =>
      prev.map((l) => (l.productId === productId && l.unitName === unitName ? { ...l, discount: safe } : l)),
    );
  }

  function setLineUnit(productId: string, fromUnit: string, toUnit: string) {
    const product = workingProductMap.get(productId);
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
      // The rate was per the old unit — reset it to the shelf price of the new
      // one rather than silently mispricing a Dozen at a pcs rate.
      return prev.map((l) =>
        l === existing ? { ...l, unitName: toUnit, rate: defaultRate(product, toUnit, mode) } : l,
      );
    });
  }

  // Switching retail/wholesale re-prices the bill to the new shelf rates —
  // a deliberate act, so it's announced. Held-bill restores suppress this so
  // a parked bill comes back with exactly the rates it left with.
  const modeRef = useRef<PriceMode>(mode);
  const suppressRepriceRef = useRef(false);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    if (suppressRepriceRef.current) {
      suppressRepriceRef.current = false;
      return;
    }
    if (cartRef.current.length === 0) return;
    setCart((prev) =>
      prev.map((l) => {
        const product = workingProductMap.get(l.productId);
        return product ? { ...l, rate: defaultRate(product, l.unitName, mode) } : l;
      }),
    );
    toast(`Rates set to ${mode === "wholesale" ? "wholesale" : "retail"} prices.`);
  }, [mode, workingProductMap]);

  function addFromSearch(product: ProductCardData) {
    addOne(product.id);
    setQuery("");
    setSearchOpen(false);
    browseRefocus();
  }

  function addFromScan(code: string, quiet = false) {
    const normalized = code.trim();
    const product = barcodeMap.get(normalized.toLowerCase());
    if (!product) {
      // Unknown barcode — the customer is holding an item we haven't filed yet.
      // Pause the camera and collect the essentials now, then resume scanning.
      setScanOpen(false);
      setQuickAddResumeScan(true);
      setQuickAdd({ barcode: normalized });
      return;
    }
    if (!isSoldInMode(product)) {
      toast.error(
        `${product.name} is not sold ${mode === "wholesale" ? "at wholesale" : "at retail"} price. Switch to ${
          mode === "wholesale" ? "Retail" : "Wholesale"
        } mode first.`,
      );
      return;
    }
    addOne(product.id);
    // Quiet in the scanner path — the bill visibly updates, no toast per item.
    if (!quiet) toast.success(`${product.name} added to the bill.`);
  }

  // After picking an item with the keyboard (search), return focus to the search
  // box so scanning can continue without reaching for the mouse.
  function browseRefocus() {
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && searchResults.length > 0) {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, searchResults.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && searchResults.length > 0) {
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
    const exact = barcodeMap.get(typed);
    if (exact) {
      addFromSearch(exact);
      return;
    }
    // Looks like a barcode but not in the catalog — offer to create it.
    // Hardware-scanned barcodes are typically 4+ digits with no spaces.
    if (!typed.includes(" ") && typed.length >= 4) {
      setQuickAddResumeScan(false);
      setQuickAdd({ barcode: event.currentTarget.value.trim() });
      setQuery("");
      return;
    }
    // Otherwise treat as a product-name search.
    const target = searchResults[0];
    if (target) addFromSearch(target);
  }

  /** "Bora Chawal" — the name of the line contributing the most money. */
  function describeCart() {
    let label = "Bill";
    let best = -1;
    for (const line of cartLines) {
      if (line.subtotal > best) {
        best = line.subtotal;
        label = line.name;
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
    toast.success(`“${label}” parked — the next customer is up.`);
  }

  /** Bring a parked bill back. If a new bill is half-built, park it first. */
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
      const product = workingProductMap.get(line.productId);
      if (!product) continue;
      const unit = unitOptions(product).find((u) => u.name === line.unitName) ?? unitOptions(product)[0];
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const capped = Math.min(quantity, product.stockQuantity / unit.factor);
      if (capped <= 0) continue;
      const rate = Number(line.rate);
      restored.push({
        productId: product.id,
        quantity: capped,
        unitName: unit.name,
        rate: Number.isFinite(rate) && rate > 0 ? round2(rate) : defaultRate(product, unit.name, held.mode),
        discount: Math.max(0, Number(line.discount) || 0),
      });
    }
    // The parked bill keeps its own rates — don't let the mode-change effect
    // re-price it to the new mode's shelf.
    suppressRepriceRef.current = true;
    setMode(held.mode);
    setCart(restored);
    toast.success(`“${held.label}” is back on the counter.`);
  }

  function dropHeld(id: string) {
    const held = heldBills.find((h) => h.id === id);
    setHeldBills((prev) => prev.filter((h) => h.id !== id));
    if (held) toast.success(`Parked bill “${held.label}” removed.`);
  }

  function handleCheckoutSuccess() {
    setCheckoutOpen(false);
    setCart([]);
    setPanMode(false);
    setPanNumber("");
    router.refresh();
    browseRefocus();
  }

  /** After the product creator: drop the item on the bill right away if requested. */
  function handleQuickAddCreated(product: ProductCardData, addToBill: boolean) {
    setLocalProducts((prev) => [...prev, product]);
    setQuickAdd(null);
    if (addToBill && product.stockQuantity > 0) {
      setCart((prev) => [
        ...prev,
        { productId: product.id, quantity: Math.min(1, product.stockQuantity), unitName: product.baseUnit, rate: defaultRate(product, product.baseUnit, mode), discount: 0 },
      ]);
    }
    // Resume scanning the basket, or return focus to the search box.
    if (quickAddResumeScan) {
      requestAnimationFrame(() => setScanOpen(true));
    } else {
      browseRefocus();
    }
  }

  const totalLines = cartLines.length;
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  scanRouteRef.current = addFromScan;
  scanCueRef.current = () => {
    setScanFlash(true);
    if (scanFlashTimer.current) window.clearTimeout(scanFlashTimer.current);
    scanFlashTimer.current = window.setTimeout(() => setScanFlash(false), 450);
  };
  scanGuardRef.current = checkoutOpen || scanOpen || !!quickAdd || !!priceEdit;

  // Keys that are appearing for the first time — one gentle entrance per line.
  const newLineKeys = useMemo(() => {
    const keys = new Set(cartLines.map((l) => `${l.productId}-${l.unitName}`));
    const fresh = new Set(cartLines.map((l) => `${l.productId}-${l.unitName}`).filter((k) => !seenLineKeysRef.current.has(k)));
    seenLineKeysRef.current = keys;
    return fresh;
  }, [cartLines]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 pt-4 pb-28 md:px-6 md:pt-5 lg:pb-10">
      {/* Masthead: date + today's pulse · search · quick actions */}
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-eager-green text-white">
            <Store size={20} />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-sm font-extrabold leading-tight text-charcoal">
              {formatDate(now)}, {formatTime(now)}
            </p>
            <p className="truncate text-xs font-medium text-pencil-gray">
              {todayStats.bills} bill{todayStats.bills === 1 ? "" : "s"} today ·{" "}
              <span className="font-bold text-eager-green">{formatNPR(todayStats.cashCollected)}</span> cash in
            </p>
          </div>
        </div>

        {/* Search / scan field — full width on mobile, centre stage on desktop */}
        <div className="relative order-last w-full min-w-0 basis-full md:order-none md:basis-auto md:flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-pencil-gray/70" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onKeyDown={handleSearchKey}
            placeholder="Scan barcode or type item…"
            aria-label="Search products or scan a barcode"
            autoComplete="off"
            className={cn(
              "h-12 w-full rounded-xl border-2 border-faded-gray bg-white pr-11 pl-11 text-sm font-semibold text-charcoal placeholder:font-medium placeholder:text-pencil-gray/60 focus:border-eager-green focus:ring-3 focus:ring-eager-green/20 focus:outline-none",
              scanFlash && "border-eager-green ring-3 ring-eager-green/30",
            )}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
                browseRefocus();
              }}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-pencil-gray hover:text-charcoal"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Scan with camera"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setScanOpen(true)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-pencil-gray hover:text-eager-green"
            >
              <ScanBarcode size={17} />
            </button>
          )}

          {searchOpen && !!query.trim() && (
            <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border-2 border-faded-gray bg-white p-1.5 shadow-lg">
              {searchResults.length === 0 ? (
                <div className="px-3 py-3 text-center">
                  <p className="text-sm font-semibold text-charcoal">Nothing matches “{query.trim()}”.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuickAddResumeScan(false);
                      setQuickAdd({ barcode: query.trim() });
                      setQuery("");
                    }}
                  >
                    <Plus /> Create “{query.trim()}” as a product
                  </Button>
                </div>
              ) : (
                searchResults.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addFromSearch(p)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left",
                      i === highlight && "bg-storybook-green",
                    )}
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", categoryTone(p.category).dot)} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-charcoal">{p.name}</span>
                    <UnitChip product={p} unitName={p.baseUnit} />
                    <span className="shrink-0 text-sm font-bold text-eager-green tabular-nums">
                      {formatNPR(mode === "wholesale" ? p.wholesalePrice : p.retailPrice)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <p className="mt-1.5 hidden text-[11px] font-medium text-pencil-gray/80 md:block">
            Scan from anywhere on this screen — USB scanners are always listening.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/inventory" title="Add or fix products">
            <Button variant="outline" size="lg" className="gap-1.5">
              <Boxes /> Products
            </Button>
          </Link>
          <Button variant="outline" size="lg" className="gap-1.5" onClick={() => setScanOpen(true)}>
            <ScanBarcode /> Scan
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── The bill — the star of the counter ── */}
        <section className="min-w-0">
          <div className={cn("overflow-hidden rounded-2xl border-2 border-faded-gray bg-white", panMode && "border-amber-300")}>
            {/* Bill header: PAN toggle left, date right, customer + pricing mode below */}
            <div className={cn("border-b-2 border-faded-gray/70 p-3.5", panMode && "border-amber-200")}>
              <div className="flex items-center justify-between gap-3">
                {panMode ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-2 border-amber-400 bg-amber-100 px-3 text-xs font-extrabold tracking-wider text-amber-800 uppercase">
                      <FileText size={13} /> PAN bill
                    </span>
                    <input
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value)}
                      placeholder="Bill no."
                      aria-label="PAN bill number"
                      className="h-8 w-28 rounded-lg border-2 border-amber-300 bg-white px-2 text-sm font-bold text-charcoal focus:border-amber-500 focus:outline-none"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Turn off PAN bill"
                      onClick={() => {
                        setPanMode(false);
                        setPanNumber("");
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setPanMode(true)}
                    title="Tax invoice for businesses — prints with a bill number"
                  >
                    <FileText /> PAN bill
                  </Button>
                )}
                <p className={cn("text-sm font-extrabold", panMode ? "text-amber-900" : "text-charcoal")}>{formatDate(now)}</p>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <UserRound size={15} className="shrink-0 text-pencil-gray" />
                <div className="min-w-40 flex-1">
                  <CustomerPicker
                    customers={customers}
                    selectedId={pinnedCustomerId}
                    onSelect={(id) => setPinnedCustomerId(id)}
                    allowClear
                    label="Bill to"
                  />
                </div>
                <div className="flex items-center rounded-full border-2 border-faded-gray bg-storybook-green/30 p-0.5" role="group" aria-label="Pricing mode">
                  {(["retail", "wholesale"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "h-8 rounded-full px-3.5 text-xs font-extrabold transition-colors",
                        mode === m
                          ? m === "wholesale"
                            ? "bg-night-ink text-white"
                            : "bg-eager-green text-white"
                          : "text-charcoal hover:text-eager-green",
                      )}
                    >
                      {m === "retail" ? "Retail" : "Wholesale"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* The bill sheet — scrolls vertically, header stays pinned */}
            <div ref={billLinesRef} className="max-h-[52vh] min-h-[200px] overflow-auto">
              {totalLines === 0 ? (
                <div className="flex h-[200px] flex-col items-center justify-center gap-2 p-4 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-storybook-green text-eager-green">
                    <ShoppingCart size={26} />
                  </span>
                  <p className="text-sm font-extrabold text-charcoal">The bill is empty</p>
                  <p className="max-w-[34ch] text-xs leading-relaxed text-pencil-gray">
                    Scan a barcode or tap any item on the shelf — it lands here as bill row 1.
                  </p>
                </div>
              ) : (
                <div className="min-w-[640px] px-3.5">
                  <div
                    className={cn(
                      BILL_GRID,
                      "sticky top-0 z-10 -mx-3.5 border-b-2 px-3.5 py-2 text-[10px] font-extrabold tracking-wider uppercase",
                      panMode ? "border-amber-200 bg-amber-50 text-amber-800" : "border-faded-gray bg-white text-pencil-gray",
                    )}
                  >
                    <span className="text-center">S.No</span>
                    <span>Item</span>
                    <span>Qty</span>
                    <span className="text-right">Rate</span>
                    <span className="text-right">Disc.</span>
                    <span className="text-right">Total</span>
                    <span />
                  </div>

                  {cartLines.map((line, index) => {
                    const product = workingProductMap.get(line.productId);
                    if (!product) return null;
                    const lineKey = `${line.productId}-${line.unitName}`;
                    const qtyValue = cellDraft?.key === lineKey && cellDraft.field === "qty" ? cellDraft.value : String(line.quantity);
                    const rateValue = cellDraft?.key === lineKey && cellDraft.field === "rate" ? cellDraft.value : String(line.rate);
                    const discValue = cellDraft?.key === lineKey && cellDraft.field === "disc" ? cellDraft.value : String(line.lineDiscount);
                    const commit = () => setCellDraft(null);
                    return (
                      <div
                        key={lineKey}
                        className={cn(
                          BILL_GRID,
                          "border-b border-faded-gray/50 py-2.5 last:border-0",
                          newLineKeys.has(lineKey) && "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out",
                        )}
                      >
                        <span className="text-center text-sm font-bold text-pencil-gray tabular-nums">{index + 1}</span>
                        <p className="min-w-0 truncate text-sm font-bold text-charcoal" title={line.name}>
                          {line.name}
                        </p>
                        <div className="flex items-center gap-1">
                          <input
                            value={qtyValue}
                            inputMode="decimal"
                            aria-label={`Quantity of ${line.name} in ${line.unitName}`}
                            onChange={(e) => {
                              setCellDraft({ key: lineKey, field: "qty", value: e.target.value });
                              const parsed = Number.parseFloat(e.target.value);
                              if (Number.isFinite(parsed) && parsed > 0) setQuantity(line.productId, line.unitName, parsed);
                            }}
                            onFocus={(e) => e.currentTarget.select()}
                            onBlur={commit}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            className="h-10 w-11 shrink-0 rounded-lg border-2 border-faded-gray bg-white text-center text-sm font-bold text-charcoal tabular-nums focus:border-eager-green focus:outline-none"
                          />
                          <Select value={line.unitName} onValueChange={(v) => v && setLineUnit(line.productId, line.unitName, v)}>
                            <SelectTrigger
                              size="sm"
                              aria-label={`Unit for ${line.name}`}
                              className={cn("h-10 min-w-0 flex-1 rounded-lg text-xs", UNIT_TONE_CLASSES[unitTone(product.baseUnit, line.unitName)])}
                            >
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
                        </div>
                        {/* The rate on the bill is the contract — editable per line. */}
                        <input
                          value={rateValue}
                          inputMode="decimal"
                          aria-label={`Rate for ${line.name} per ${line.unitName}`}
                          placeholder="rate"
                          onChange={(e) => {
                            setCellDraft({ key: lineKey, field: "rate", value: e.target.value });
                            const parsed = Number.parseFloat(e.target.value);
                            if (Number.isFinite(parsed) && parsed >= 0) setLineRate(line.productId, line.unitName, parsed);
                          }}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={commit}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="h-10 w-full rounded-lg border-2 border-faded-gray bg-white px-2 text-right text-sm font-bold text-charcoal tabular-nums focus:border-eager-green focus:outline-none"
                        />
                        {/* Per-line bhaansi, in rupees. */}
                        <input
                          value={discValue}
                          inputMode="decimal"
                          aria-label={`Discount for ${line.name} in rupees`}
                          placeholder="0"
                          onChange={(e) => {
                            setCellDraft({ key: lineKey, field: "disc", value: e.target.value });
                            const parsed = Number.parseFloat(e.target.value);
                            if (Number.isFinite(parsed) && parsed >= 0) setLineDiscount(line.productId, line.unitName, parsed);
                          }}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={commit}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          className="h-10 w-full rounded-lg border-2 border-faded-gray bg-white px-2 text-right text-sm font-bold text-amber-700 tabular-nums focus:border-amber-500 focus:outline-none"
                        />
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-charcoal tabular-nums">{formatNPR(line.subtotal)}</div>
                          {line.factor !== 1 && (
                            <div className="text-[10px] font-medium text-pencil-gray tabular-nums">
                              = {formatQuantity(line.baseQuantity)} {line.baseUnit}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${line.name} from the bill`}
                          className="hover:text-destructive"
                          onClick={() => setQuantity(line.productId, line.unitName, 0)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer: summary · total · actions */}
            <div className={cn("border-t-2 p-4", panMode ? "border-amber-200" : "border-faded-gray/70")}>
              <div className="mb-2.5 flex items-center justify-between px-1 text-xs font-semibold text-pencil-gray">
                <span>
                  {totalLines} line{totalLines === 1 ? "" : "s"} · {formatQuantity(cartCount)} qty
                </span>
                {billDiscountTotal > 0 && (
                  <span className="font-bold text-amber-700">Bhaansi −{formatNPR(billDiscountTotal)}</span>
                )}
              </div>
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl px-4 py-3",
                  panMode ? "bg-amber-400 text-amber-950" : "bg-eager-green text-white",
                )}
              >
                <span className="text-sm font-extrabold tracking-wider uppercase opacity-90">Total</span>
                <span key={cartTotal} className="animate-in fade-in zoom-in-95 font-heading text-3xl font-extrabold tabular-nums">
                  {formatNPR(cartTotal)}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="lg" className="h-14 flex-1 gap-1.5" onClick={holdBill} disabled={totalLines === 0}>
                  <Pause /> Hold bill
                </Button>
                <Button
                  variant="checkout-dark"
                  size="lg"
                  className="h-14 flex-1 gap-1.5"
                  onClick={() => setCheckoutOpen(true)}
                  disabled={totalLines === 0}
                >
                  <Check /> Checkout
                  <kbd className="rounded-md border border-white/25 px-1.5 text-[10px] font-extrabold">F2</kbd>
                </Button>
              </div>
            </div>
          </div>

          {/* Parked customers — bills held mid-build */}
          {heldBills.length > 0 && (
            <section className="mt-5" aria-label="Parked customers">
              <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-extrabold tracking-wider text-pencil-gray uppercase">
                <Pause size={13} /> Parked customers ({heldBills.length})
              </h2>
              <div className="space-y-2">
                {heldBills.map((held) => (
                  <div
                    key={held.id}
                    className="flex items-center justify-between gap-2 rounded-xl border-2 border-faded-gray bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-charcoal">{held.label}</p>
                      <p className="text-[11px] font-medium text-pencil-gray">
                        {formatNPR(held.total)} · {held.mode === "wholesale" ? "Wholesale" : "Retail"} · {formatTime(new Date(held.heldAt))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => restoreHeld(held.id)}>
                        <RotateCcw /> Bring back
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Drop parked bill ${held.label}`}
                        className="hover:text-destructive"
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
        </section>

        {/* ── Products shelf — the right rail ── */}
        <aside className="min-w-0 space-y-5">
          {quickProducts.length > 0 && (
            <section aria-label="Daily prices">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-xs font-extrabold tracking-wider text-pencil-gray uppercase">Daily prices</h2>
                <p className="hidden text-[11px] font-medium text-pencil-gray/80 lg:block">Tap name = fix rate · tap tile = add</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
                {quickProducts.map((p) => (
                  <ProductTile key={`quick-${p.id}`} product={p} mode={mode} onAdd={() => addOne(p.id)} onEditPrice={() => setPriceEdit(p)} />
                ))}
              </div>
            </section>
          )}

          {categories.length > 0 && (
            <section aria-label="All items">
              <h2 className="mb-2 px-1 text-xs font-extrabold tracking-wider text-pencil-gray uppercase">All items</h2>
              {categories.length > 1 && (
                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                  {["all", ...categories].map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                      className={cn(
                        "shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors",
                        category === c
                          ? "border-eager-green bg-eager-green text-white"
                          : "border-faded-gray bg-white text-charcoal hover:border-eager-green/50",
                      )}
                    >
                      {c === "all" ? "All" : c}
                    </button>
                  ))}
                </div>
              )}
              {browseProducts.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-faded-gray p-6 text-center text-xs font-semibold text-pencil-gray">
                  No items in this category yet.
                </div>
              ) : (
                <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-3 xl:grid-cols-2">
                  {browseProducts.map((p) => (
                    <ProductTile key={p.id} product={p} mode={mode} onAdd={() => addOne(p.id)} onEditPrice={() => setPriceEdit(p)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      {/* Camera scanner */}
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(code) => addFromScan(code, true)}
      />

      {/* Checkout — takes exactly the lines on the bill */}
      <CheckoutDialog
        open={checkoutOpen}
        mode={mode}
        total={cartTotal}
        lines={cartLines}
        customers={customers}
        presetCustomerId={pinnedCustomerId}
        onClose={() => {
          setCheckoutOpen(false);
          browseRefocus();
        }}
        onSuccess={handleCheckoutSuccess}
      />

      {/* Quick product creation for unknown barcodes / search misses */}
      {quickAdd && (
        <ProductQuickAddDialog
          open
          barcode={quickAdd.barcode}
          existingCategories={categories}
          resumeScan={quickAddResumeScan}
          onCreated={handleQuickAddCreated}
          onCancel={() => {
            setQuickAdd(null);
            if (quickAddResumeScan) requestAnimationFrame(() => setScanOpen(true));
            else browseRefocus();
          }}
        />
      )}

      {/* Today's-rate editor, opened from a shelf tile's name */}
      {priceEdit && <PriceEditorDialog product={priceEdit} onClose={() => setPriceEdit(null)} />}

      {/* Mobile action bar */}
      {totalLines > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-faded-gray bg-white p-3 shadow-[0_-4px_16px_rgba(0,4,55,0.06)] xl:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <Button variant="outline" size="lg" className="h-12 shrink-0 gap-1.5" onClick={holdBill}>
              <Pause /> Hold
            </Button>
            <Button
              variant="default"
              size="lg"
              className="h-12 flex-1 justify-between gap-2 px-4"
              onClick={() => setCheckoutOpen(true)}
            >
              <span className="flex items-center gap-1.5">
                <Check /> Checkout
              </span>
              <span className="text-base tabular-nums">{formatNPR(cartTotal)}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shelf tile: tap the name to fix today's rate, tap the tile to add one ── */
function ProductTile({
  product,
  mode,
  onAdd,
  onEditPrice,
}: {
  product: ProductCardData;
  mode: PriceMode;
  onAdd: () => void;
  onEditPrice: () => void;
}) {
  const out = product.stockQuantity <= 0;
  const price = mode === "wholesale" ? product.wholesalePrice : product.retailPrice;
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-xl border-2 border-faded-gray bg-white p-2.5 transition-colors",
        out ? "opacity-55" : "hover:border-eager-green",
      )}
    >
      <button
        type="button"
        onClick={onEditPrice}
        title={`Fix ${product.name}'s rate`}
        className="flex items-start gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eager-green"
      >
        <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-bold text-charcoal">{product.name}</span>
        <Pencil size={11} className="mt-0.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-90" />
      </button>
      <button
        type="button"
        onClick={onAdd}
        disabled={out}
        title={out ? "Out of stock" : `Add 1 ${product.baseUnit} to the bill`}
        className="flex items-center justify-between gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eager-green disabled:cursor-not-allowed"
      >
        <UnitChip product={product} unitName={product.baseUnit} />
        <span className="text-xs font-bold text-charcoal tabular-nums">{formatNPR(price)}</span>
      </button>
      {out && (
        <Badge variant="destructive" className="absolute top-1.5 right-1.5 px-1.5 text-[9px]">
          Out
        </Badge>
      )}
    </div>
  );
}
