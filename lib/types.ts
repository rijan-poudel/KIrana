/**
 * Shared types used by both server actions and client components.
 */

/** Standard envelope returned by every server action. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Pricing mode for the billing screen. */
export type PriceMode = "retail" | "wholesale";

/** A sellable pack size defined on a product ("Carton" ×30 pcs, "gram" ×0.001 kg…). */
export type ProductUnitData = { id: string; name: string; factor: number };

/** Product fields the billing / inventory screens work with. */
export type ProductCardData = {
  id: string;
  name: string;
  category: string;
  barcode: string | null;
  retailPrice: number;
  wholesalePrice: number;
  costPrice: number; // purchase cost per base unit
  stockQuantity: number; // in base units
  baseUnit: string;
  lowStockAt: number;
  units: ProductUnitData[];
};

/** Customer fields used across khata / billing screens. */
export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  address: string;
  currentBalance: number;
  isFavorite: boolean;
};

export type ProductUnitInput = { name: string; factor: number };

export type ProductInput = {
  name: string;
  category: string;
  barcode: string;
  retailPrice: number;
  wholesalePrice: number;
  costPrice: number; // purchase cost per base unit
  baseUnit: string;
  lowStockAt: number;
  openingStock: number; // create only; logged as an OPENING stock move
  units: ProductUnitInput[];
};

export type CustomerInput = {
  name: string;
  phone: string;
  address: string;
};

export type CheckoutLineInput = {
  productId: string;
  quantity: number; // in the chosen unit
  unitName?: string; // omit = product base unit
};

/** Bhaansi choice applied to a whole bill. `value` is rupees (flat) or a percent. */
export type BillDiscount = { type: "flat" | "percent"; value: number; note?: string | null };

export type CheckoutInput = {
  type: "RETAIL" | "WHOLESALE";
  customerId: string | null;
  newCustomer: { name: string; phone: string; address: string } | null;
  items: CheckoutLineInput[];
  paidAmount: number;
  discount?: BillDiscount | null;
};

export type CheckoutLineResult = {
  productId: string;
  name: string;
  quantity: number; // as entered
  unitName: string; // as billed
  baseQuantity: number; // in base units
  baseUnit: string;
  unitPrice: number; // per base unit
  subtotal: number;
};

export type CheckoutResult = {
  transactionId: string;
  type: string;
  grossTotal: number; // before any discount
  discountAmount: number; // bhaansi taken off, in rupees
  discountNote: string | null;
  totalAmount: number; // net of discount — what actually gets paid/keditised
  paidAmount: number;
  dueAmount: number;
  paymentStatus: string;
  lines: CheckoutLineResult[];
};

export type HistoryEntry = {
  id: string;
  type: string;
  totalAmount: number;
  discountAmount: number;
  discountNote: string | null;
  paidAmount: number;
  paymentStatus: string;
  createdAt: string;
  items: {
    productName: string;
    quantity: number; // base units
    unitName: string; // billed unit ("" = base)
    baseUnit: string;
    unitPrice: number;
    subtotal: number;
  }[];
};

/** Stock-ledger adjustment, entered in a product unit (COUNT = absolute base-unit stock).
 * `costTotal` is only used on PURCHASE — the rupees paid for the lot, which updates the
 * product's cost price (weighted average per base unit). */
export type StockAdjustInput = {
  productId: string;
  mode: "PURCHASE" | "DAMAGE" | "RETURN" | "ADJUST" | "COUNT";
  quantity: number;
  unitName?: string;
  note?: string;
  costTotal?: number;
};

export type StockMoveData = {
  id: string;
  productName: string;
  baseUnit: string;
  delta: number; // in base units
  reason: string;
  note: string | null;
  unitName: string | null;
  quantity: number | null; // as entered, in unitName
  createdAt: string;
};

export type DeliveryLogData = {
  id: string;
  driverName: string;
  destinationClient: string;
  itemsSummary: string;
  totalValue: number;
  status: string;
  createdAt: string;
};

export type DeliveryInput = {
  driverName: string;
  destinationClient: string;
  itemsSummary: string;
  totalValue: number;
};

export type BackupInfo = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
};

/** One line of a saved transaction, as re-printed on receipts and reports. */
export type ReceiptLine = {
  name: string;
  quantity: number; // base units
  unitName: string; // billed unit ("" = base unit)
  baseUnit: string;
  unitPrice: number; // per base unit
  subtotal: number;
};

/** A saved transaction rendered by the shared receipt + report components. */
export type ReceiptData = {
  id: string;
  createdAt: string; // ISO
  type: string; // RETAIL | WHOLESALE
  totalAmount: number;
  discountAmount?: number; // bhaansi taken off, in rupees
  discountNote?: string | null;
  paidAmount: number;
  paymentStatus: string;
  customerLabel: string | null;
  items: ReceiptLine[];
};

/** One row of the day report table. */
export type ReportRowData = {
  id: string;
  time: string;
  typeLabel: string; // RETAIL | WHOLESALE | PAYMENT
  customerName: string | null;
  items: ReceiptLine[];
  totalAmount: number;
  discountAmount: number;
  discountNote: string | null;
  paidAmount: number;
  paymentStatus: string;
};
