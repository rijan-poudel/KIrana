/**
 * Shared types used by both server actions and client components.
 */

/** Standard envelope returned by every server action. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Pricing mode for the billing screen. */
export type PriceMode = "retail" | "wholesale";

/** Product fields the billing / inventory screens work with. */
export type ProductCardData = {
  id: string;
  name: string;
  category: string;
  barcode: string | null;
  retailPrice: number;
  wholesalePrice: number;
  stockQuantity: number;
  unit: string;
};

/** Customer fields used across khata / billing screens. */
export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  address: string;
  currentBalance: number;
};

export type ProductInput = {
  name: string;
  category: string;
  barcode: string;
  retailPrice: number;
  wholesalePrice: number;
  stockQuantity: number;
  unit: string;
};

export type CustomerInput = {
  name: string;
  phone: string;
  address: string;
};

export type CheckoutInput = {
  type: "RETAIL" | "WHOLESALE";
  customerId: string | null;
  newCustomer: { name: string; phone: string; address: string } | null;
  items: { productId: string; quantity: number }[];
  paidAmount: number;
};

export type CheckoutResult = {
  transactionId: string;
  type: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: string;
};

export type HistoryEntry = {
  id: string;
  type: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  createdAt: string;
  items: { productName: string; quantity: number; unit: string; unitPrice: number; subtotal: number }[];
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
