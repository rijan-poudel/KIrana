/**
 * Shared types used by both server actions and client components.
 */

/** Standard envelope returned by every server action. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Pricing mode for the billing screen. */
export type PriceMode = "retail" | "wholesale";

/** Who a product is sold to: walk-in retail, wholesale buyers, or both. */
export type SellAs = "RETAIL" | "WHOLESALE" | "BOTH";

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
  sellAs: SellAs;
  stockQuantity: number; // in base units
  baseUnit: string;
  lowStockAt: number;
  manufacturingDate: string | null; // ISO date, batch manufactured
  expiryDate: string | null; // ISO date, batch expires
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
  sellAs: SellAs;
  baseUnit: string;
  lowStockAt: number;
  openingStock: number; // create only; logged as an OPENING stock move
  manufacturingDate?: string | null; // ISO date, optional
  expiryDate?: string | null; // ISO date, optional
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
  /** Per base unit, in rupees. Omit to charge the product's current retail/wholesale price. */
  unitPrice?: number;
  /** Per-line bhaansi in rupees, taken off this item's subtotal. Optional. */
  discount?: number;
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

export type EditTransactionInput = {
  transactionId: string;
  items: CheckoutLineInput[];
  customerId: string | null;
  discount: BillDiscount | null;
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
  manufacturingDate?: string | null; // batch dates, applied on PURCHASE
  expiryDate?: string | null; // batch dates, applied on PURCHASE
};

/** One line of the batch "Receive stock" flow. Existing products are matched by
 * `productId`; otherwise a brand-new product is created from the typed name.
 * Received quantity + optional per-line cost; batch dates are applied to every line. */
export type ReceiveStockLineInput = {
  name: string;
  productId?: string | null;
  category?: string;
  retailPrice?: number; // for new products
  quantity: number;
  unitName?: string;
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
  driverPhone: string | null;
  vehicleNumber: string | null;
  destinationClient: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerBalance: number;
  scheduledAt: string | null;
  startedAt: string | null;
  deliveredAt: string | null;
  itemsSummary: string;
  totalValue: number;
  status: string;
  proofOfDelivery: string | null;
  deliveryNotes: string | null;
  settlementNotes: string | null;
  createdAt: string;
  updatedAt: string;
  items: DeliveryItemData[];
};

export type DeliveryItemData = {
  id: string;
  deliveryLogId: string;
  productId: string;
  productName: string;
  productBaseUnit: string;
  quantity: number;
  unitName: string;
  unitPrice: number;
  subtotal: number;
};

export type DeliveryInput = {
  driverName: string;
  driverPhone?: string | null;
  vehicleNumber?: string | null;
  destinationClient: string;
  customerId?: string | null;
  scheduledAt?: string | null; // ISO string
  itemsSummary: string;
  totalValue: number;
  items: DeliveryItemInput[];
};

export type DeliveryItemInput = {
  productId: string;
  quantity: number; // in base units
  unitName: string;
  unitPrice: number;
};

export type BackupInfo = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
};

/** A received (purchase) bill on the Bills screen. */
export type BillData = {
  id: string;
  vendorName: string;
  vendorPan: string | null;
  billNumber: string;
  billDateBs: string | null; // as printed on the bill (Bikram Sambat)
  billDateAd: string | null; // ISO date when known
  fiscalYear: string | null; // e.g. "2082/83"
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  isVatBill: boolean;
  source: string; // QR | MANUAL
  rawPayload: string | null;
  hasPhoto: boolean;
  note: string | null;
  createdAt: string;
};

/** Create/edit input for a bill. Amounts come straight from the bill/QR. */
export type BillInput = {
  vendorName: string;
  vendorPan?: string | null;
  billNumber: string;
  billDateBs?: string | null;
  billDateAd?: string | null; // ISO date string
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  isVatBill: boolean;
  note?: string | null;
  /** Only on create from a QR scan — the verifiable original payload. */
  rawPayload?: string | null;
  source?: string;
};

/** Saving may be stopped by an existing record for the same vendor + bill no.
 *  `match: "pan"` is the same physical bill (uniqueness-enforced, cannot be
 *  overridden); `match: "name"` matched only the vendor name, so saving anyway
 *  is allowed (the PAN was simply never captured). */
export type SaveBillResult =
  | { status: "saved"; id: string }
  | {
      status: "duplicate";
      match: "pan" | "name";
      existing: { id: string; vendorName: string; billNumber: string; createdAt: string };
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

/** A line on a day-report row, with the product id so it can be edited later. */
export type ReportLineData = ReceiptLine & { productId: string };

/** One row of the day report table. */
export type ReportRowData = {
  id: string;
  time: string;
  typeLabel: string; // RETAIL | WHOLESALE | PAYMENT
  customerName: string | null;
  customerId: string | null;
  items: ReportLineData[];
  totalAmount: number;
  discountAmount: number;
  discountNote: string | null;
  paidAmount: number;
  paymentStatus: string;
};

/** One day's totals inside a range report (weekly/monthly closing). */
export type RangeDayRow = {
  dateKey: string; // "2026-09-13"
  bills: number;
  salesTotal: number;
  discounts: number;
  cash: number; // paid at the counter that day
  udharoAdded: number;
  creditPayments: number;
};
