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
  DeliveryItemInput,
  EditTransactionInput,
  HistoryEntry,
  ProductInput,
  ReceiveStockLineInput,
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

/** Resolve optional batch dates: empty string → null, else parse the YYYY-MM-DD input. */
function parseBatchDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseProductInput(input: ProductInput) {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Product name is required.");

  const category = (input.category ?? "").trim() || "General";
  const baseUnit = (input.baseUnit ?? "").trim().toLowerCase();
  if (!baseUnit) throw new Error("Base unit is required (pcs, kg or liter).");

  const barcode = (input.barcode ?? "").trim() || null;
  const retailPrice = round2(Number(input.retailPrice));
  const wholesalePrice = round2(Number(input.wholesalePrice));
  const costPrice = round2(Number(input.costPrice ?? 0));
  const lowStockAt = Number(input.lowStockAt);
  const openingStock = Number(input.openingStock) || 0;
  const manufacturingDate = parseBatchDate(input.manufacturingDate);
  const expiryDate = parseBatchDate(input.expiryDate);

  // "Sells to" — retail, wholesale, or both. A price entered for a mode implies
  // the shop sells it in that mode, so a retail-only item with a wholesale price
  // (or vice versa) is promoted to "both", never silently dropped.
  let sellAs: "RETAIL" | "WHOLESALE" | "BOTH" =
    input.sellAs === "RETAIL" || input.sellAs === "WHOLESALE" ? input.sellAs : "BOTH";
  if (sellAs === "RETAIL" && wholesalePrice > 0) sellAs = "BOTH";
  if (sellAs === "WHOLESALE" && retailPrice > 0) sellAs = "BOTH";

  if (expiryDate && manufacturingDate && expiryDate < manufacturingDate) {
    throw new Error("Expiry date cannot be before the manufacturing date.");
  }

  if (!Number.isFinite(retailPrice) || retailPrice < 0) throw new Error("Retail price must be zero or more.");
  if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) throw new Error("Wholesale price must be zero or more.");
  if (!Number.isFinite(costPrice) || costPrice < 0) throw new Error("Cost price must be zero or more.");
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

  return {
    name,
    category,
    barcode,
    baseUnit,
    retailPrice,
    wholesalePrice,
    costPrice,
    sellAs,
    lowStockAt,
    openingStock,
    manufacturingDate,
    expiryDate,
    units,
  };
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
        costPrice: data.costPrice,
        sellAs: data.sellAs,
        lowStockAt: data.lowStockAt,
        manufacturingDate: data.manufacturingDate,
        expiryDate: data.expiryDate,
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
          costPrice: data.costPrice,
          sellAs: data.sellAs,
          lowStockAt: data.lowStockAt,
          manufacturingDate: data.manufacturingDate,
          expiryDate: data.expiryDate,
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

/**
 * Fast price update from the counter — retail + wholesale in one tap so daily
 * vegetable / grain prices can follow the market without opening the stock screen.
 */
export async function updateProductPrices(
  id: string,
  prices: { retailPrice?: number; wholesalePrice?: number },
): Promise<ActionResult<{ id: string }>> {
  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new Error("Product not found — it may have been removed.");

    const data: { retailPrice?: number; wholesalePrice?: number; sellAs?: string } = {};
    const retailPrice = prices.retailPrice != null ? round2(Number(prices.retailPrice)) : product.retailPrice;
    const wholesalePrice = prices.wholesalePrice != null ? round2(Number(prices.wholesalePrice)) : product.wholesalePrice;
    if (!Number.isFinite(retailPrice) || retailPrice < 0 || !Number.isFinite(wholesalePrice) || wholesalePrice < 0) {
      throw new Error("Prices cannot be negative.");
    }
    data.retailPrice = retailPrice;
    data.wholesalePrice = wholesalePrice;

    // If a price is entered for a mode the product isn't sold in, promote it to
    // "both" the same way create/update do — never silently drop the new price.
    let sellAs = product.sellAs;
    if (sellAs === "RETAIL" && wholesalePrice > 0) sellAs = "BOTH";
    if (sellAs === "WHOLESALE" && retailPrice > 0) sellAs = "BOTH";
    data.sellAs = sellAs;

    await prisma.product.update({ where: { id }, data });
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

      if (mode === "PURCHASE") {
        const costTotal = Number(input.costTotal ?? 0);
        if (!Number.isFinite(costTotal) || costTotal < 0) throw new Error("Purchase cost must be zero or more.");
        if (costTotal > 0) {
          const perBaseCost = round2(costTotal / Math.abs(delta));
          const newCost = round2(
            (product.stockQuantity * product.costPrice + Math.abs(delta) * perBaseCost) /
              (product.stockQuantity + Math.abs(delta)),
          );
          await tx.product.update({
            where: { id: product.id },
            data: { costPrice: newCost },
          });
        }

        // New batch in → refresh the manufacturing / expiry dates for the product.
        const manufacturingDate = parseBatchDate(input.manufacturingDate);
        const expiryDate = parseBatchDate(input.expiryDate);
        if (manufacturingDate || expiryDate) {
          const data: { manufacturingDate?: Date; expiryDate?: Date } = {};
          if (manufacturingDate) data.manufacturingDate = manufacturingDate;
          if (expiryDate) data.expiryDate = expiryDate;
          await tx.product.update({ where: { id: product.id }, data });
        }
      }

      return updated.stockQuantity;
    });

    refreshShopPaths(["/", "/inventory", "/reports"]);
    return { ok: true, data: { newStock: round2(newStock) } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Batch stock intake — one round trip for a whole delivery. Each line either
 * tops up an existing product (with cost-price averaging, like a single
 * PURCHASE) or instantly creates a new product from just a typed name and
 * retail price. A shared manufacturing/expiry date (one supplier lot) is
 * applied to every line. All inside a single atomic transaction.
 */
export async function receiveStock(
  lines: ReceiveStockLineInput[],
  batch?: { manufacturingDate?: string | null; expiryDate?: string | null; note?: string | null },
): Promise<ActionResult<{ received: number; newProducts: number }>> {
  try {
    const items = Array.isArray(lines) ? lines : [];
    if (items.length === 0) throw new Error("Add at least one item to receive.");
    if (items.length > 50) throw new Error("Receive up to 50 lines at a time.");

    const sharedMfg = parseBatchDate(batch?.manufacturingDate);
    const sharedExp = parseBatchDate(batch?.expiryDate);
    const note = (batch?.note ?? "").trim() || null;

    const result = await prisma.$transaction(async (tx) => {
      let received = 0;
      let newProducts = 0;

      for (const raw of items) {
        const displayName = (raw.name ?? "").trim() || "Unknown product";
        const quantity = Number(raw.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Quantity for “${displayName}” must be greater than zero.`);
        }

        if (raw.productId) {
          const product = await tx.product.findUnique({ where: { id: raw.productId }, include: { units: true } });
          if (!product) throw new Error(`“${displayName}” is no longer in the catalog.`);

          const { unitName, factor } = resolveUnit(product, raw.unitName);
          const delta = round2(quantity * factor);
          if (delta <= 0) throw new Error(`Quantity for “${displayName}” must be greater than zero.`);

          await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { increment: delta } },
          });
          await tx.stockMove.create({
            data: {
              productId: product.id,
              delta,
              reason: "PURCHASE",
              note,
              unitName,
              quantity,
            },
          });

          const costTotal = Number(raw.costTotal ?? 0);
          if (Number.isFinite(costTotal) && costTotal > 0) {
            const perBaseCost = round2(costTotal / delta);
            const newCost = round2(
              (product.stockQuantity * product.costPrice + delta * perBaseCost) / (product.stockQuantity + delta),
            );
            await tx.product.update({ where: { id: product.id }, data: { costPrice: newCost } });
          }

          // A new lot came in — refresh the dates (only if this batch has them).
          if (sharedMfg || sharedExp) {
            const dateData: { manufacturingDate?: Date; expiryDate?: Date } = {};
            if (sharedMfg) dateData.manufacturingDate = sharedMfg;
            if (sharedExp) dateData.expiryDate = sharedExp;
            await tx.product.update({ where: { id: product.id }, data: dateData });
          }

          received += delta;
        } else {
          const name = (raw.name ?? "").trim();
          if (!name) throw new Error("Every received item needs a name.");
          const retailPrice = round2(Number(raw.retailPrice ?? 0));
          if (!Number.isFinite(retailPrice) || retailPrice < 0) {
            throw new Error(`Enter a retail price for “${name}”.`);
          }
          if (sharedExp && sharedMfg && sharedExp < sharedMfg) {
            throw new Error(`Expiry cannot be before the manufacturing date for “${name}”.`);
          }

          await tx.product.create({
            data: {
              name,
              category: (raw.category ?? "").trim() || "General",
              barcode: null,
              baseUnit: "pcs",
              retailPrice,
              wholesalePrice: retailPrice,
              lowStockAt: 10,
              stockQuantity: quantity,
              manufacturingDate: sharedMfg,
              expiryDate: sharedExp,
              stockMoves: {
                create: {
                  delta: quantity,
                  reason: "PURCHASE",
                  note,
                  unitName: "pcs",
                  quantity,
                },
              },
            },
          });
          received += quantity;
          newProducts += 1;
        }
      }

      return { received: round2(received), newProducts };
    });

    refreshShopPaths(["/", "/inventory", "/reports"]);
    return { ok: true, data: result };
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
/* Voiding a transaction (fixing mistakes)                             */
/* ------------------------------------------------------------------ */

/**
 * Removes a wrongly-entered transaction and undoes everything it did:
 * items go back on the shelf (with a VOID ledger row), any udharo due is
 * taken off the customer's khata, and a PAYMENT is charged back to the khata.
 * All inside one atomic transaction.
 */
export async function voidTransaction(transactionId: string): Promise<ActionResult<null>> {
  try {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: { items: true },
      });
      if (!transaction) throw new Error("This transaction was already removed.");

      if (transaction.type === "PAYMENT") {
        // Reverse the settlement: the money goes back onto their khata.
        if (transaction.customerId) {
          await tx.customer.update({
            where: { id: transaction.customerId },
            data: { currentBalance: { increment: transaction.totalAmount } },
          });
        }
      } else {
        // A sale: restock every line and reverse any credit given.
        for (const item of transaction.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
          await tx.stockMove.create({
            data: {
              productId: item.productId,
              delta: item.quantity,
              reason: "VOID",
              note: `Voided sale #${transaction.id.slice(-8).toUpperCase()}`,
              refType: "TRANSACTION",
              refId: transaction.id,
            },
          });
        }
        const dueAmount = round2(transaction.totalAmount - transaction.paidAmount);
        if (dueAmount > 0 && transaction.customerId) {
          await tx.customer.update({
            where: { id: transaction.customerId },
            data: { currentBalance: { decrement: dueAmount } },
          });
        }
      }

      await tx.transaction.delete({ where: { id: transaction.id } });
    });

    refreshShopPaths(["/", "/inventory", "/khata", "/reports"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Editing a saved bill (fixing a mistake in place)                    */
/* ------------------------------------------------------------------ */

/**
 * Corrects a wrongly-entered bill IN PLACE — same receipt number, so the
 * paper trail never contradicts itself. Reverses the original line-by-line
 * (items back to the shelf with a VOID ledger row, khata due taken back),
 * then re-prices the edited lines at today's prices (same math as checkout),
 * rewrites the transaction's items/totals, applies the new stock decrement
 * and adjusts each affected customer's khata balance by exactly the delta.
 * All inside one atomic transaction.
 */
export async function editTransaction(
  input: EditTransactionInput,
): Promise<ActionResult<{ transactionId: string; totalAmount: number; paidAmount: number; dueAmount: number }>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const original = await tx.transaction.findUnique({
        where: { id: input.transactionId },
        include: { items: true },
      });
      if (!original) throw new Error("This bill was already removed.");
      if (original.type === "PAYMENT") {
        throw new Error("Khata payments can't be edited — void it and re-record it instead.");
      }

      const cartItems = Array.isArray(input.items) ? input.items : [];
      if (cartItems.length === 0) throw new Error("A bill needs at least one line.");

      const type = original.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
      const oldTotal = original.totalAmount;
      const oldPaid = original.paidAmount;
      const oldDue = round2(oldTotal - oldPaid);
      const oldCustomerId: string | null = original.customerId;

      // 1. Reverse the original bill: restock every line, log a VOID row.
      for (const item of original.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.stockMove.create({
          data: {
            productId: item.productId,
            delta: item.quantity,
            reason: "VOID",
            note: `Edited bill #${original.id.slice(-8).toUpperCase()}`,
            refType: "TRANSACTION",
            refId: original.id,
          },
        });
      }

      // 2. Re-price the corrected lines — trust the database, never the browser.
      const products = await tx.product.findMany({
        where: { id: { in: cartItems.map((i) => i.productId) } },
        include: { units: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      let grossTotal = 0;
      const lines: CheckoutLineResult[] = [];
      for (const item of cartItems) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("Every line needs a quantity greater than zero.");
        }
        const product = productMap.get(item.productId);
        if (!product) throw new Error("A product on this bill is no longer in the catalog.");
        const { unitName, factor } = resolveUnit(product, item.unitName);
        const baseQuantity = round2(quantity * factor);
        if (baseQuantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`);
        const defaultUnitPrice = type === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;
        let unitPrice = defaultUnitPrice;
        if (item.unitPrice != null && Number.isFinite(Number(item.unitPrice))) {
          const override = round2(Number(item.unitPrice));
          if (override < 0) throw new Error(`Rate for ${product.name} cannot be negative.`);
          unitPrice = override;
        }
        // Per-line bhaansi: a flat rupee amount off this line, clamped to its
        // subtotal so a fat-fingered discount can never make a line negative.
        const lineGross = round2(unitPrice * baseQuantity);
        let lineDiscount = 0;
        if (item.discount != null && Number.isFinite(Number(item.discount))) {
          lineDiscount = Math.max(0, round2(Number(item.discount)));
          if (lineDiscount > lineGross) lineDiscount = lineGross;
        }
        const subtotal = round2(lineGross - lineDiscount);
        grossTotal += subtotal;
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
      grossTotal = round2(grossTotal);

      let discountAmount = 0;
      let discountNote: string | null = null;
      if (input.discount) {
        const raw = Number(input.discount.value);
        if (input.discount.type === "percent") {
          if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
            throw new Error("Enter a discount between 0 and 100%.");
          }
          discountAmount = round2((grossTotal * raw) / 100);
        } else {
          if (!Number.isFinite(raw) || raw < 0) throw new Error("Discount amount must be zero or more.");
          discountAmount = Math.min(round2(raw), grossTotal);
        }
        if (discountAmount > 0) discountNote = (input.discount.note ?? "").trim() || null;
      }
      const newTotal = round2(grossTotal - discountAmount);

      // The cash already collected stays; a corrected (smaller) bill just means
      // less was owed, never that the shop owes the customer money back.
      const newPaid = Math.min(oldPaid, newTotal);
      const newDue = round2(newTotal - newPaid);
      const paymentStatus = newDue <= 0 ? "PAID" : newPaid > 0 ? "PARTIAL" : "UDHARO";
      if (newDue > 0 && !input.customerId) {
        throw new Error("A bill with an outstanding amount needs a khata customer.");
      }

      for (const line of lines) {
        const product = productMap.get(line.productId)!;
        if (product.stockQuantity < line.baseQuantity) {
          throw new Error(
            `Not enough stock for ${product.name}. Available: ${product.stockQuantity} ${product.baseUnit}.`,
          );
        }
      }

      // 3. Rewrite the bill in place — same receipt number.
      await tx.transaction.update({
        where: { id: original.id },
        data: {
          customerId: input.customerId,
          totalAmount: newTotal,
          discountAmount,
          discountNote,
          paidAmount: newPaid,
          paymentStatus,
          items: {
            deleteMany: {},
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
            refId: original.id,
          },
        });
      }

      // 4. Khata: the due moves from the old customer to the new one (if any).
      if (input.customerId === oldCustomerId && input.customerId) {
        const delta = round2(newDue - oldDue);
        if (delta !== 0) {
          await tx.customer.update({
            where: { id: input.customerId },
            data: { currentBalance: { increment: delta } },
          });
        }
      } else {
        if (oldCustomerId) {
          await tx.customer.update({
            where: { id: oldCustomerId },
            data: { currentBalance: { decrement: oldDue } },
          });
        }
        if (input.customerId) {
          await tx.customer.update({
            where: { id: input.customerId },
            data: { currentBalance: { increment: newDue } },
          });
        }
      }

      return {
        transactionId: original.id,
        totalAmount: newTotal,
        paidAmount: newPaid,
        dueAmount: newDue,
      };
    });

    refreshShopPaths(["/", "/inventory", "/khata", "/reports"]);
    return { ok: true, data: result };
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

/** Marks a customer as a regular (or un-marks them) so they surface first everywhere. */
export async function setCustomerFavorite(id: string, favorite: boolean): Promise<ActionResult<null>> {
  try {
    await prisma.customer.update({ where: { id }, data: { isFavorite: favorite } });
    refreshShopPaths(["/", "/khata"]);
    return { ok: true, data: null };
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
      let grossTotal = 0;
      const lines: CheckoutLineResult[] = [];
      for (const item of cartItems) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Cart quantities must be greater than zero.");
        const product = productMap.get(item.productId);
        if (!product) throw new Error("A product in the cart was removed from stock. Please start a new bill.");

        const { unitName, factor } = resolveUnit(product, item.unitName);
        const baseQuantity = round2(quantity * factor);
        if (baseQuantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`);

        // Price from the database by default, but honour an explicit per-line
        // rate override (bhaansi, daily vegetable prices, a long-standing
        // customer's rate…) handed up from the counter. The charged rate is
        // what actually lands on the ledger.
        const defaultUnitPrice = type === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;
        let unitPrice = defaultUnitPrice;
        if (item.unitPrice != null && Number.isFinite(Number(item.unitPrice))) {
          const override = round2(Number(item.unitPrice));
          if (override < 0) throw new Error(`Rate for ${product.name} cannot be negative.`);
          unitPrice = override;
        }
        // Per-line bhaansi: a flat rupee amount off this line, clamped to its
        // subtotal so a fat-fingered discount can never make a line negative.
        const lineGross = round2(unitPrice * baseQuantity);
        let lineDiscount = 0;
        if (item.discount != null && Number.isFinite(Number(item.discount))) {
          lineDiscount = Math.max(0, round2(Number(item.discount)));
          if (lineDiscount > lineGross) lineDiscount = lineGross;
        }
        const subtotal = round2(lineGross - lineDiscount);
        grossTotal += subtotal;
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
      grossTotal = round2(grossTotal);

      // Bhaansi: a flat rupee amount or a percent of the gross, folded into the
      // bill before payment so the counter total always matches the drawer.
      let discountAmount = 0;
      let discountNote: string | null = null;
      if (input.discount) {
        const raw = Number(input.discount.value);
        if (input.discount.type === "percent") {
          if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
            throw new Error("Enter a discount between 0 and 100%.");
          }
          discountAmount = round2((grossTotal * raw) / 100);
        } else {
          if (!Number.isFinite(raw) || raw < 0) throw new Error("Discount amount must be zero or more.");
          discountAmount = Math.min(round2(raw), grossTotal);
        }
        if (discountAmount > 0) discountNote = (input.discount.note ?? "").trim() || null;
      }
      const totalAmount = round2(grossTotal - discountAmount);

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
          discountAmount,
          discountNote,
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
        grossTotal,
        discountAmount,
        discountNote,
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
      discountAmount: t.discountAmount,
      discountNote: t.discountNote,
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

const DELIVERY_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
  "SETTLED",
  "RETURNED",
  "CANCELLED",
] as const;

function validateStatus(status: string): boolean {
  return DELIVERY_STATUSES.includes(status as (typeof DELIVERY_STATUSES)[number]);
}

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

    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0) throw new Error("Add at least one product to the delivery.");

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

    const log = await prisma.$transaction(async (tx) => {
      const delivery = await tx.deliveryLog.create({
        data: {
          driverName,
          driverPhone: (input.driverPhone ?? "").trim() || null,
          vehicleNumber: (input.vehicleNumber ?? "").trim() || null,
          destinationClient,
          customerId: input.customerId || null,
          scheduledAt,
          itemsSummary,
          totalValue,
          status: "PENDING",
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitName: item.unitName,
              unitPrice: item.unitPrice,
              subtotal: round2(item.quantity * item.unitPrice),
            })),
          },
        },
        include: { items: true },
      });

      // Decrement stock for each item (reserved for delivery)
      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product ${item.productId} not found.`);
        if (product.stockQuantity < item.quantity) {
          throw new Error(`Not enough stock for ${product.name}. Available: ${product.stockQuantity} ${product.baseUnit}.`);
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        await tx.stockMove.create({
          data: {
            productId: item.productId,
            delta: -item.quantity,
            reason: "DELIVERY",
            note: `Reserved for delivery to ${destinationClient}`,
            unitName: item.unitName,
            quantity: item.quantity,
            refType: "DELIVERY",
            refId: delivery.id,
          },
        });
      }

      return delivery;
    });

    refreshShopPaths(["/delivery", "/reports", "/inventory"]);
    return { ok: true, data: { id: log.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateDeliveryStatus(id: string, status: string): Promise<ActionResult<null>> {
  try {
    if (!validateStatus(status)) throw new Error("Invalid delivery status.");
    const updateData: { status: string; startedAt?: Date; deliveredAt?: Date } = { status };
    if (status === "LOADED" || status === "IN_TRANSIT") updateData.startedAt = new Date();
    if (status === "DELIVERED") updateData.deliveredAt = new Date();
    await prisma.deliveryLog.update({ where: { id }, data: updateData });
    refreshShopPaths(["/delivery", "/reports"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function setDeliveryProof(id: string, proof: string, notes?: string): Promise<ActionResult<null>> {
  try {
    await prisma.deliveryLog.update({
      where: { id },
      data: {
        proofOfDelivery: proof,
        deliveryNotes: notes ? (notes.trim() || null) : undefined,
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });
    refreshShopPaths(["/delivery", "/reports"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function settleDelivery(
  id: string,
  settlementNotes: string,
  paymentType: "CASH" | "KHATA" | "ONLINE",
): Promise<ActionResult<null>> {
  try {
    const log = await prisma.deliveryLog.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!log) throw new Error("Delivery not found.");
    if (log.status !== "DELIVERED") throw new Error("Only delivered orders can be settled.");

    await prisma.$transaction(async (tx) => {
      const notes = `Settled via ${paymentType}. ${settlementNotes?.trim() || ""}`.trim();
      await tx.deliveryLog.update({
        where: { id },
        data: { status: "SETTLED", settlementNotes: notes },
      });

      // If customer linked and payment is KHATA, add to their balance
      if (paymentType === "KHATA" && log.customerId) {
        await tx.customer.update({
          where: { id: log.customerId },
          data: { currentBalance: { increment: log.totalValue } },
        });
        await tx.transaction.create({
          data: {
            customerId: log.customerId,
            type: "WHOLESALE",
            totalAmount: log.totalValue,
            paidAmount: 0,
            paymentStatus: "UDHARO",
            items: { create: [] },
          },
        });
      }
      // If CASH or ONLINE, record as PAYMENT transaction
      if ((paymentType === "CASH" || paymentType === "ONLINE") && log.customerId) {
        await tx.transaction.create({
          data: {
            customerId: log.customerId,
            type: "PAYMENT",
            totalAmount: log.totalValue,
            paidAmount: log.totalValue,
            paymentStatus: "PAID",
          },
        });
        await tx.customer.update({
          where: { id: log.customerId },
          data: { currentBalance: { decrement: log.totalValue } },
        });
      }
    });

    refreshShopPaths(["/delivery", "/reports", "/khata"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function returnDelivery(id: string, notes: string): Promise<ActionResult<null>> {
  try {
    const log = await prisma.deliveryLog.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!log) throw new Error("Delivery not found.");
    if (log.status === "RETURNED" || log.status === "CANCELLED") throw new Error("Already returned or cancelled.");

    await prisma.$transaction(async (tx) => {
      // Return stock
      for (const item of log.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.stockMove.create({
          data: {
            productId: item.productId,
            delta: item.quantity,
            reason: "RETURN",
            note: `Returned from delivery to ${log.destinationClient}: ${notes}`,
            unitName: item.unitName,
            quantity: item.quantity,
            refType: "DELIVERY",
            refId: log.id,
          },
        });
      }
      await tx.deliveryLog.update({
        where: { id },
        data: { status: "RETURNED", deliveryNotes: notes },
      });
    });

    refreshShopPaths(["/delivery", "/reports", "/inventory"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function cancelDelivery(id: string): Promise<ActionResult<null>> {
  try {
    const log = await prisma.deliveryLog.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!log) throw new Error("Delivery not found.");
    if (log.status === "DELIVERED" || log.status === "SETTLED") throw new Error("Cannot cancel a delivered/settled order.");

    await prisma.$transaction(async (tx) => {
      // Return stock
      for (const item of log.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.stockMove.create({
          data: {
            productId: item.productId,
            delta: item.quantity,
            reason: "RETURN",
            note: `Cancelled delivery to ${log.destinationClient}`,
            unitName: item.unitName,
            quantity: item.quantity,
            refType: "DELIVERY",
            refId: log.id,
          },
        });
      }
      await tx.deliveryLog.update({ where: { id }, data: { status: "CANCELLED" } });
    });

    refreshShopPaths(["/delivery", "/reports", "/inventory"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteDeliveryLog(id: string): Promise<ActionResult<null>> {
  try {
    const log = await prisma.deliveryLog.findUnique({ where: { id }, include: { items: true } });
    if (!log) throw new Error("Delivery not found.");

    await prisma.$transaction(async (tx) => {
      // Return stock if not already settled/returned
      if (!["SETTLED", "RETURNED", "CANCELLED"].includes(log.status)) {
        for (const item of log.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
          await tx.stockMove.create({
            data: {
              productId: item.productId,
              delta: item.quantity,
              reason: "RETURN",
              note: `Deleted delivery to ${log.destinationClient} - stock returned`,
              unitName: item.unitName,
              quantity: item.quantity,
              refType: "DELIVERY",
              refId: log.id,
            },
          });
        }
      }
      await tx.deliveryLog.delete({ where: { id } });
    });

    refreshShopPaths(["/delivery", "/reports", "/inventory"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function getDeliveries(): Promise<ActionResult<import("@/lib/types").DeliveryLogData[]>> {
  try {
    const logs = await prisma.deliveryLog.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, phone: true, address: true, currentBalance: true } },
        items: { include: { product: { select: { name: true, baseUnit: true } } } },
      },
    });

    const data: import("@/lib/types").DeliveryLogData[] = logs.map((log) => ({
      id: log.id,
      driverName: log.driverName,
      driverPhone: log.driverPhone,
      vehicleNumber: log.vehicleNumber,
      destinationClient: log.destinationClient,
      customerId: log.customerId,
      customerName: log.customer?.name ?? null,
      customerPhone: log.customer?.phone ?? null,
      customerAddress: log.customer?.address ?? null,
      customerBalance: log.customer?.currentBalance ?? 0,
      scheduledAt: log.scheduledAt?.toISOString() ?? null,
      startedAt: log.startedAt?.toISOString() ?? null,
      deliveredAt: log.deliveredAt?.toISOString() ?? null,
      itemsSummary: log.itemsSummary,
      totalValue: log.totalValue,
      status: log.status,
      proofOfDelivery: log.proofOfDelivery,
      deliveryNotes: log.deliveryNotes,
      settlementNotes: log.settlementNotes,
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString(),
      items: log.items.map((item) => ({
        id: item.id,
        deliveryLogId: item.deliveryLogId,
        productId: item.productId,
        productName: item.product.name,
        productBaseUnit: item.product.baseUnit,
        quantity: item.quantity,
        unitName: item.unitName,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
    }));

    return { ok: true, data };
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
