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
  CheckoutResult,
  CustomerInput,
  DeliveryInput,
  HistoryEntry,
  ProductInput,
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

/* ------------------------------------------------------------------ */
/* Products (Module B: Inventory)                                      */
/* ------------------------------------------------------------------ */

function parseProductInput(input: ProductInput) {
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Product name is required.");

  const category = (input.category ?? "").trim() || "General";
  const unit = (input.unit ?? "").trim() || "pcs";
  const barcode = (input.barcode ?? "").trim() || null;

  const retailPrice = round2(Number(input.retailPrice));
  const wholesalePrice = round2(Number(input.wholesalePrice));
  const stockQuantity = Number(input.stockQuantity);

  if (!Number.isFinite(retailPrice) || retailPrice < 0) throw new Error("Retail price must be zero or more.");
  if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) throw new Error("Wholesale price must be zero or more.");
  if (!Number.isFinite(stockQuantity) || stockQuantity < 0) throw new Error("Stock quantity must be zero or more.");

  return { name, category, barcode, retailPrice, wholesalePrice, stockQuantity, unit };
}

export async function createProduct(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseProductInput(input);
    const product = await prisma.product.create({ data });
    refreshShopPaths(["/", "/billing", "/inventory"]);
    return { ok: true, data: { id: product.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseProductInput(input);
    const product = await prisma.product.update({ where: { id }, data });
    refreshShopPaths(["/", "/billing", "/inventory"]);
    return { ok: true, data: { id: product.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteProduct(id: string): Promise<ActionResult<null>> {
  try {
    await prisma.product.delete({ where: { id } });
    refreshShopPaths(["/", "/billing", "/inventory"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Customers (Module C: Khata)                                         */
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
    refreshShopPaths(["/", "/billing", "/khata"]);
    return { ok: true, data: { id: customer.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  try {
    const data = parseCustomerInput(input);
    const customer = await prisma.customer.update({ where: { id }, data });
    refreshShopPaths(["/", "/billing", "/khata"]);
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
    refreshShopPaths(["/", "/billing", "/khata"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Billing (Module A: Counter Billing)                                 */
/* ------------------------------------------------------------------ */

/**
 * Atomically: creates the Transaction + TransactionItems, decrements stock for
 * every purchased product, and (for udharo/partial) adds the outstanding due to
 * the customer's khata balance. All inside one Prisma interactive transaction
 * so a power cut mid-sale can never leave the books half-written.
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
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Price every line from the database — never trust totals sent by the browser.
      let totalAmount = 0;
      const lines: { productId: string; name: string; quantity: number; unitPrice: number; subtotal: number }[] = [];
      for (const item of cartItems) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Cart quantities must be greater than zero.");
        const product = productMap.get(item.productId);
        if (!product) throw new Error("A product in the cart was removed from inventory. Please start a new bill.");
        const unitPrice = type === "WHOLESALE" ? product.wholesalePrice : product.retailPrice;
        const subtotal = round2(unitPrice * quantity);
        totalAmount += subtotal;
        lines.push({ productId: product.id, name: product.name, quantity, unitPrice, subtotal });
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
        if (product.stockQuantity < line.quantity) {
          throw new Error(
            `Not enough stock for ${product.name}. Available: ${product.stockQuantity} ${product.unit}, requested: ${line.quantity}.`,
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
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
            })),
          },
        },
      });

      for (const line of lines) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQuantity: { decrement: line.quantity } },
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
      } satisfies CheckoutResult;
    });

    refreshShopPaths(["/", "/billing", "/inventory", "/khata", "/closing"]);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Khata payments (Module C)                                           */
/* ------------------------------------------------------------------ */

/**
 * Records a cash settlement from a customer: decrements their balance and
 * writes a PAYMENT transaction so the night closing report can total the cash.
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

    refreshShopPaths(["/", "/khata", "/closing"]);
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
        unit: item.product.unit,
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
/* Deliveries (Module D: Honda Splendor tracker)                       */
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
    if (!itemsSummary) throw new Error("Describe the items loaded on the bike.");

    const totalValue = round2(Number(input.totalValue));
    if (!Number.isFinite(totalValue) || totalValue < 0) throw new Error("Total value must be zero or more.");

    const log = await prisma.deliveryLog.create({
      data: { driverName, destinationClient, itemsSummary, totalValue, status: "PENDING" },
    });
    refreshShopPaths(["/", "/delivery"]);
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
    refreshShopPaths(["/", "/delivery"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteDeliveryLog(id: string): Promise<ActionResult<null>> {
  try {
    await prisma.deliveryLog.delete({ where: { id } });
    refreshShopPaths(["/", "/delivery"]);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Backups (Module E: Night closing)                                   */
/* ------------------------------------------------------------------ */

export async function saveBackup(): Promise<ActionResult<{ filename: string; sizeBytes: number }>> {
  try {
    const backup = await createBackupFile();
    refreshShopPaths(["/closing"]);
    return { ok: true, data: { filename: backup.filename, sizeBytes: backup.sizeBytes } };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
