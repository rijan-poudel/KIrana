"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { createBackupFile } from "@/lib/backup";
import { errorMessage } from "@/lib/utils";
import { round2 } from "@/lib/format";
import type {
  ActionResult,
  CheckoutInput,
  CheckoutLineResult,
  CheckoutResult,
  CustomerInput,
  DeliveryInput,
  HistoryEntry,
  ProductInput,
  StockAdjustInput,
  StockMoveData,
} from "@/lib/types";

/** Friendly messages for the Prisma error codes the shop will actually hit. */
function toActionError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "That barcode is already used by another product.";
    if (error.code === "P2003") return "This record is linked to sales history and cannot be deleted.";
    if (error.code === "P2025") return "Record not found — it may have already been deleted on another screen.";
  }
  return errorMessage(error);
}

function refreshShopPaths(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

/** The product shape the unit/stock helpers work with. */
type UnitSource = { name: string; baseUnit: string; units: { name: string; factor: number }[] };

/**
 * Resolve a requested unit name against a product's configured units.
 * Empty or base-unit requests resolve to the base unit (factor 1); anything
 * else must match a configured ProductUnit (case-insensitive).
 */
function resolveUnit(product: UnitSource, requested?: string | null): { unitName: string; factor: number } {
  const wanted = (requested ?? "").trim();
  if (!wanted || wanted.toLowerCase() === product.baseUnit.toLowerCase()) {
    return { unitName: product.baseUnit, factor: 1 };
  }
  const unit = product.units.find((u) => u.name.toLowerCase() === wanted.toLowerCase());
  if (!unit) {
    const available = [product.baseUnit, ...product.units.map((u) => u.name)].join(", ");
    throw new Error(`${product.name} is not sold in "${wanted}". Available units: ${available}.`);
  }
  return { unitName: unit.name, factor: unit.factor };
}

/* ------------------------------------------------------------------ */
/* Products (Stock / Inventory)                                        */
/* ------------------------------------------------------------------ */

function parseProductInput(input: ProductInput) {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Product name is required.");

  const category = (input.category ?? "").trim() || "General";
  const baseUnit = (input.baseUnit ?? "").trim().toLowerCase();
  if (!baseUnit) throw new Error("Base unit is required (pcs, kg or liter).");

  const barcode = (input.barcode ?? "").trim() || null;
  const retailPrice = round2(Number(input.retailPrice));
  const wholesalePrice = round2(Number(input.wholesalePrice));
  const lowStockAt = Number(input.lowStockAt);
  const openingStock = Number(input.openingStock) || 0;

  if (!Number.isFinite(retailPrice) || retailPrice < 0) throw new Error("Retail price must be zero or more.");
  if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) throw new Error("Wholesale price must be zero or more.");
  if (!Number.isFinite(lowStockAt) || lowStockAt < 0) throw new Error("Low-stock alert must be zero or more.");
  if (!Number.isFinite(openingStock) || openingStock < 0) throw new Error("Opening stock must be zero or more.");

  const rawUnits = Array.isArray(input.units) ? input.units : [];
  const units: { name: string; factor: number }[] = [];
  for (const u of rawUnits) {
    const unitName = (u?.name ?? "").trim();
    const factor = Number(u?.factor);
    if (!unitName) continue;
    if (unitName.toLowerCase() === baseUnit) {
      throw new Error(`"${unitName}" is the base unit — no need to define it again.`);
    }
    if (units.some((x) => x.name.toLowerCase() === unitName.toLowerCase())) {
      throw new Error(`Unit "${unitName}" is listed twice.`);
    }
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
      throw new Error(`Unit "${unitName}" needs a conversion factor greater than 0 (and not 1).`);
    }
    units.push({ name: unitName, factor });
  }

  return { name, category, barcode, baseUnit, retailPrice, wholesalePrice, lowStockAt, openingStock, units };
}

export async function createProduct(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseProductInput(input);
    const product = await prisma.product.create({
      data: {
        name: data.name,
        category: data.category,
        barcode: data.barcode,
        baseUnit: data.baseUnit,
        retailPrice: data.retailPrice,
        wholesalePrice: data.wholesalePrice,
        lowStockAt: data.lowStockAt,
        stockQuantity: data.openingStock,
        units: { create: data.units },
        stockMoves:
          data.openingStock > 0
            ? {
                create: {
                  delta: data.openingStock,
                  reason: "OPENING",
                  quantity: data.openingStock,
                  unitName: data.baseUnit,
                  note: "Opening stock",
                },
              }
            : undefined,
      },
    });
    refreshShopPaths(["/", "/inventory", "/reports"]);
    return { ok: true, data: { id: product.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseProductInput(input);
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          category: data.category,
          barcode: data.barcode,
          baseUnit: data.baseUnit,
          retailPrice: data.retailPrice,
          wholesalePrice: data.wholesalePrice,
          lowStockAt: data.lowStockAt,
          units: { deleteMany: {}, create: data.units },
        },
      });
    });
    refreshShopPaths(["/", "/inventory", "/reports"]);
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteProduct(id: string): Promise<ActionResult<null>> {
  try {
    await prisma.product.delete({ where: { id } });
    refreshShopPaths(["/", "/inventory", "/reports"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Stock ledger (purchases, damage, counts)                            */
/* ------------------------------------------------------------------ */

export async function adjustStock(input: StockAdjustInput): Promise<ActionResult<{ newStock: number }>> {
  try {
    const productId = input.productId;
    const mode = input.mode;
    if (!["PURCHASE", "DAMAGE", "RETURN", "ADJUST", "COUNT"].includes(mode)) {
      throw new Error("Unknown stock adjustment type.");
    }

    const newStock = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, include: { units: true } });
      if (!product) throw new Error("Product not found — it may have already been deleted.");

      const { unitName, factor } = resolveUnit(product, input.unitName);
      const quantity = Number(input.quantity);
      if (!Number.isFinite(quantity)) throw new Error("Enter a valid quantity.");

      let delta: number;
      let moveQuantity: number;
      let moveUnit: string;

      if (mode === "COUNT") {
        const counted = round2(quantity);
        if (counted < 0) throw new Error("Counted stock cannot be negative.");
        delta = round2(counted - product.stockQuantity);
        moveQuantity = counted;
        moveUnit = product.baseUnit;
      } else {
        if (quantity === 0) throw new Error("Quantity cannot be zero.");
        if (mode === "PURCHASE" && quantity < 0) {
          throw new Error("Purchased quantity must be greater than zero.");
        }
        if (mode === "DAMAGE" && quantity < 0) {
          throw new Error("Damaged quantity must be greater than zero.");
        }
        if (mode === "RETURN" && quantity < 0) {
          throw new Error("Returned quantity must be greater than zero.");
        }
        const magnitude = Math.abs(quantity);
        const signedBase = quantity * factor; // ADJUST keeps its sign; the rest are forced below
        if (mode === "PURCHASE") delta = round2(magnitude * factor);
        else if (mode === "DAMAGE" || mode === "RETURN") delta = round2(-magnitude * factor);
        else delta = round2(signedBase);
        moveQuantity = quantity;
        moveUnit = unitName;
      }

      const updated = await tx.product.update({
        where: { id: product.id },
        data: { stockQuantity: { increment: delta } },
      });

      await tx.stockMove.create({
        data: {
          productId: product.id,
          delta,
          reason: mode,
          note: (input.note ?? "").trim() || null,
          unitName: moveUnit,
          quantity: moveQuantity,
        },
      });

      return updated.stockQuantity;
    });

    refreshShopPaths(["/", "/inventory", "/reports"]);
    return { ok: true, data: { newStock: round2(newStock) } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function listStockMoves(options?: {
  productId?: string;
  take?: number;
}): Promise<ActionResult<StockMoveData[]>> {
  try {
    const moves = await prisma.stockMove.findMany({
      where: options?.productId ? { productId: options.productId } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(options?.take ?? 50, 200),
      include: { product: { select: { name: true, baseUnit: true } } },
    });
    return {
      ok: true,
      data: moves.map((m) => ({
        id: m.id,
        productName: m.product.name,
        baseUnit: m.product.baseUnit,
        delta: m.delta,
        reason: m.reason,
        note: m.note,
        unitName: m.unitName,
        quantity: m.quantity,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Customers (Khata)                                                   */
/* ------------------------------------------------------------------ */

function parseCustomerInput(input: CustomerInput) {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Customer name is required.");
  return {
    name,
    phone: (input.phone ?? "").trim() || null,
    address: (input.address ?? "").trim(),
  };
}

export async function createCustomer(input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseCustomerInput(input);
    const customer = await prisma.customer.create({ data });
    refreshShopPaths(["/", "/khata"]);
    return { ok: true, data: { id: customer.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseCustomerInput(input);
    const customer = await prisma.customer.update({ where: { id }, data });
    refreshShopPaths(["/", "/khata"]);
    return { ok: true, data: { id: customer.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteCustomer(id: string): Promise<ActionResult<null>> {
  try {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new Error("Customer not found — they may already have been removed.");
    if (customer.currentBalance > 0) {
      throw new Error(
        `${customer.name} still owes Rs. ${customer.currentBalance.toFixed(2)}. Record their payment before deleting them.`,
      );
    }
    await prisma.customer.delete({ where: { id } });
    refreshShopPaths(["/", "/khata"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Billing (Counter)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Atomically: creates the Transaction + TransactionItems, decrements stock
 * (with a StockMove ledger entry per line), and (for udharo/partial) adds the
 * outstanding due to the customer's khata balance. All inside one Prisma
 * interactive transaction so a power cut mid-sale can never leave the books
 * half-written.
 */
export async function checkout(input: CheckoutInput): Promise<ActionResult<CheckoutResult>> {
  try {
    const cartItems = Array.isArray(input.items) ? input.items : [];
    if (cartItems.length === 0) throw new Error("The cart is empty — add products before checkout.");

    const type = input.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL";

    const result = await prisma.$transaction(async (tx) => {
      // Resolve the customer: pick an existing one or create on the spot.
      let customerId: string | null = input.customerId || null;
      if (!customerId && input.newCustomer) {
        const name = (input.newCustomer.name ?? "").trim();
        if (!name) throw new Error("Enter a name for the new customer.");
        const created = await tx.customer.create({
          data: {
            name,
            phone: (input.newCustomer.phone ?? "").trim() || null,
            address: (input.newCustomer.address ?? "").trim(),
          },
        });
        customerId = created.id;
      }

      const products = await tx.product.findMany({
        where: { id: { in: cartItems.map((item) => item.productId) } },
        include: { units: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Price every line from the database — never trust totals sent by the browser.
      let totalAmount = 0;
      const lines: CheckoutLineResult[] = [];
      for (const item of cartItems) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Cart quantities must be greater than zero.");
        const product = productMap.get(item.productId);
        if (!product) throw new Error("A product in the cart was removed from stock. Please start a new bill.");

        const { unitName, factor } = resolveUnit(product, item.unitName);
        const baseQuantity = round2(quantity * factor);
        if (baseQuantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`);

        const unitPrice = type === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;
        const subtotal = round2(unitPrice * baseQuantity);
        totalAmount += subtotal;
        lines.push({
          productId: product.id,
          name: product.name,
          quantity,
          unitName,
          baseQuantity,
          baseUnit: product.baseUnit,
          unitPrice,
          subtotal,
        });
      }
      totalAmount = round2(totalAmount);

      let paidAmount = round2(Number(input.paidAmount) || 0);
      if (paidAmount < 0) throw new Error("Paid amount cannot be negative.");
      if (paidAmount > totalAmount) paidAmount = totalAmount;
      const dueAmount = round2(totalAmount - paidAmount);

      const paymentStatus = dueAmount <= 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UDHARO";
      if (dueAmount > 0 && !customerId) {
        throw new Error("Udharo (credit) sales need a customer on the khata. Select or create one to continue.");
      }

      // Guard stock before writing anything.
      for (const line of lines) {
        const product = productMap.get(line.productId)!;
        if (product.stockQuantity < line.baseQuantity) {
          throw new Error(
            `Not enough stock for ${product.name}. Available: ${product.stockQuantity} ${product.baseUnit}, requested: ${line.baseQuantity} ${product.baseUnit}.`,
          );
        }
      }

      const transaction = await tx.transaction.create({
        data: {
          customerId,
          type,
          totalAmount,
          paidAmount,
          paymentStatus,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              quantity: line.baseQuantity,
              unitName: line.unitName === line.baseUnit ? "" : line.unitName,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
            })),
          },
        },
      });

      for (const line of lines) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQuantity: { decrement: line.baseQuantity } },
        });
        await tx.stockMove.create({
          data: {
            productId: line.productId,
            delta: -line.baseQuantity,
            reason: "SALE",
            unitName: line.unitName,
            quantity: line.quantity,
            refType: "TRANSACTION",
            refId: transaction.id,
          },
        });
      }

      if (dueAmount > 0 && customerId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { currentBalance: { increment: dueAmount } },
        });
      }

      return {
        transactionId: transaction.id,
        type,
        totalAmount,
        paidAmount,
        dueAmount,
        paymentStatus,
        lines,
      } satisfies CheckoutResult;
    });

    refreshShopPaths(["/", "/inventory", "/khata", "/reports"]);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Khata payments                                                      */
/* ------------------------------------------------------------------ */

/**
 * Records a cash settlement from a customer: decrements their balance and
 * writes a PAYMENT transaction so the day report can total the cash.
 */
export async function recordPayment(input: {
  customerId: string;
  amount: number;
}): Promise<ActionResult<{ newBalance: number }>> {
  try {
    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero.");

    const newBalance = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new Error("Customer not found — they may have already been removed.");

      const updated = await tx.customer.update({
        where: { id: customer.id },
        data: { currentBalance: { decrement: amount } },
      });

      await tx.transaction.create({
        data: {
          customerId: customer.id,
          type: "PAYMENT",
          totalAmount: amount,
          paidAmount: amount,
          paymentStatus: "PAID",
        },
      });

      return updated.currentBalance;
    });

    refreshShopPaths(["/", "/khata", "/reports"]);
    return { ok: true, data: { newBalance: round2(newBalance) } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Purchase + payment timeline for one customer's khata detail view. */
export async function getCustomerHistory(customerId: string): Promise<ActionResult<HistoryEntry[]>> {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: { include: { product: true } } },
    });

    const entries: HistoryEntry[] = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      totalAmount: t.totalAmount,
      paidAmount: t.paidAmount,
      paymentStatus: t.paymentStatus,
      createdAt: t.createdAt.toISOString(),
      items: t.items.map((item) => ({
        productName: item.product.name,
        quantity: item.quantity,
        unitName: item.unitName,
        baseUnit: item.product.baseUnit,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
    }));

    return { ok: true, data: entries };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Deliveries                                                          */
/* ------------------------------------------------------------------ */

export async function createDeliveryLog(
  input: DeliveryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const driverName = (input.driverName ?? "").trim();
    const destinationClient = (input.destinationClient ?? "").trim();
    const itemsSummary = (input.itemsSummary ?? "").trim();
    if (!driverName) throw new Error("Driver name is required.");
    if (!destinationClient) throw new Error("Destination client / shop name is required.");
    if (!itemsSummary) throw new Error("Describe the items loaded for delivery.");

    const totalValue = round2(Number(input.totalValue));
    if (!Number.isFinite(totalValue) || totalValue < 0) throw new Error("Total value must be zero or more.");

    const log = await prisma.deliveryLog.create({
      data: { driverName, destinationClient, itemsSummary, totalValue, status: "PENDING" },
    });
    refreshShopPaths(["/reports"]);
    return { ok: true, data: { id: log.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateDeliveryStatus(id: string, status: string): Promise<ActionResult<null>> {
  try {
    const allowed = ["PENDING", "DELIVERED", "SETTLED"];
    if (!allowed.includes(status)) throw new Error("Invalid delivery status.");
    await prisma.deliveryLog.update({ where: { id }, data: { status } });
    refreshShopPaths(["/reports"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteDeliveryLog(id: string): Promise<ActionResult<null>> {
  try {
    await prisma.deliveryLog.delete({ where: { id } });
    refreshShopPaths(["/reports"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

export async function saveBackup(): Promise<ActionResult<{ filename: string; sizeBytes: number }>> {
  try {
    const backup = await createBackupFile();
    refreshShopPaths(["/reports"]);
    return { ok: true, data: { filename: backup.filename, sizeBytes: backup.sizeBytes } };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
