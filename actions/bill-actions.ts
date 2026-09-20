"use server";

import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { BILL_PHOTOS_DIR, deleteBillPhoto, saveBillPhoto } from "@/lib/bill-photos";
import { round2 } from "@/lib/format";
import { fiscalYearForBs } from "@/lib/vat-qr";
import { errorMessage } from "@/lib/utils";
import type { ActionResult, BillInput, SaveBillResult } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Bills — the paper trail of everything the shop buys                 */
/* ------------------------------------------------------------------ */

/** Canonical BS date "YYYY.MM.DD" from whatever the QR/typing produced. */
function normalizeBsDate(value?: string | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 32) return null;
  return `${y}.${m.padStart(2, "0")}.${d.padStart(2, "0")}`;
}

function parseAdDate(value?: string | null): Date | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseBillInput(input: BillInput) {
  const vendorName = (input.vendorName ?? "").trim();
  if (!vendorName) throw new Error("Vendor name is required.");
  const billNumber = (input.billNumber ?? "").trim();
  if (!billNumber) throw new Error("Bill number is required.");

  const vendorPan = (input.vendorPan ?? "").trim() || null;
  if (vendorPan && !/^\d{6,12}$/.test(vendorPan)) {
    throw new Error("A PAN is 9 digits — check the number printed on the bill.");
  }

  const taxableAmount = round2(Number(input.taxableAmount) || 0);
  const vatAmount = round2(Number(input.vatAmount) || 0);
  const totalAmount = round2(Number(input.totalAmount) || 0);
  if (taxableAmount < 0 || vatAmount < 0 || totalAmount < 0) {
    throw new Error("Amounts cannot be negative.");
  }

  const billDateBs = normalizeBsDate(input.billDateBs);
  const billDateAd = parseAdDate(input.billDateAd);
  const fiscalYear = billDateBs ? (fiscalYearForBs(billDateBs) ?? null) : null;

  return {
    vendorName,
    vendorPan,
    billNumber,
    billDateBs,
    billDateAd,
    fiscalYear,
    taxableAmount,
    vatAmount,
    totalAmount,
    isVatBill: input.isVatBill === true,
    note: (input.note ?? "").trim() || null,
  };
}

function refreshBills() {
  revalidatePath("/bills");
}

function toActionError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "This vendor + bill number is already recorded — check the list before saving again.";
  }
  return errorMessage(error);
}

/** The same physical bill: same vendor PAN + bill number (the CBMS identity),
 *  or — when the PAN was never captured — same vendor name + number. SQLite has
 *  no case-insensitive filter, so name matching happens on the small result set.
 *  The `match` kind decides whether "save anyway" can ever succeed: the DB's
 *  unique index enforces the PAN identity, the name match is advisory only. */
async function findDuplicate(
  values: { vendorName: string; vendorPan: string | null; billNumber: string },
  ignoreId?: string,
): Promise<{ bill: { id: string; vendorName: string; billNumber: string; createdAt: Date }; match: "pan" | "name" } | null> {
  const notIgnored = ignoreId ? { id: { not: ignoreId } } : {};
  if (values.vendorPan) {
    const byPan = await prisma.purchaseBill.findFirst({
      where: { vendorPan: values.vendorPan, billNumber: values.billNumber, ...notIgnored },
    });
    if (byPan) return { bill: byPan, match: "pan" };
  }
  if (values.vendorName) {
    const candidates = await prisma.purchaseBill.findMany({
      where: { vendorPan: null, billNumber: values.billNumber, ...notIgnored },
      take: 20,
    });
    const wanted = values.vendorName.toLowerCase();
    const byName = candidates.find((bill) => bill.vendorName.toLowerCase() === wanted);
    if (byName) return { bill: byName, match: "name" };
  }
  return null;
}

export async function saveBill(input: BillInput, options?: { allowDuplicate?: boolean }): Promise<ActionResult<SaveBillResult>> {
  try {
    const parsed = parseBillInput(input);
    const duplicate = await findDuplicate(parsed);
    if (duplicate && !options?.allowDuplicate) {
      return {
        ok: true,
        data: {
          status: "duplicate",
          match: duplicate.match,
          existing: {
            id: duplicate.bill.id,
            vendorName: duplicate.bill.vendorName,
            billNumber: duplicate.bill.billNumber,
            createdAt: duplicate.bill.createdAt.toISOString(),
          },
        },
      };
    }
    const created = await prisma.purchaseBill.create({
      data: {
        ...parsed,
        source: input.source === "MANUAL" ? "MANUAL" : "QR",
        rawPayload: (input.rawPayload ?? "").trim() || null,
      },
    });
    refreshBills();
    return { ok: true, data: { status: "saved", id: created.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateBill(id: string, input: BillInput): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = parseBillInput(input);
    const duplicate = await findDuplicate(parsed, id);
    if (duplicate) {
      return { ok: false, error: `Bill ${duplicate.bill.billNumber} from ${duplicate.bill.vendorName} is already recorded.` };
    }
    await prisma.purchaseBill.update({ where: { id }, data: parsed });
    refreshBills();
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteBill(id: string): Promise<ActionResult<null>> {
  try {
    const bill = await prisma.purchaseBill.delete({ where: { id } });
    deleteBillPhoto(bill.photoPath);
    refreshBills();
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Attach a compressed photo (client-side WebP/JPEG data URL) to a saved bill. */
export async function attachBillPhoto(id: string, dataUrl: string): Promise<ActionResult<{ photoPath: string }>> {
  try {
    const filename = saveBillPhoto(id, dataUrl);
    await prisma.purchaseBill.update({ where: { id }, data: { photoPath: filename } });
    refreshBills();
    return { ok: true, data: { photoPath: filename } };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function removeBillPhoto(id: string): Promise<ActionResult<null>> {
  try {
    const bill = await prisma.purchaseBill.update({ where: { id }, data: { photoPath: null } });
    deleteBillPhoto(bill.photoPath);
    refreshBills();
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * Storage keeps itself small: photos older than the retention window are
 * deleted, the bill records stay forever. Runs on page open with the
 * shopkeeper's saved choice (0 or less = keep forever, nothing happens).
 */
export async function pruneBillPhotos(retentionDays: number): Promise<ActionResult<{ removed: number; freedBytes: number }>> {
  try {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return { ok: true, data: { removed: 0, freedBytes: 0 } };
    }
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const stale = await prisma.purchaseBill.findMany({
      where: { photoPath: { not: null }, createdAt: { lt: cutoff } },
      select: { id: true, photoPath: true },
    });
    let removed = 0;
    let freedBytes = 0;
    for (const bill of stale) {
      try {
        freedBytes += fs.statSync(path.join(BILL_PHOTOS_DIR, path.basename(bill.photoPath ?? ""))).size;
      } catch {
        // The file may already be gone; the record still gets cleaned.
      }
      await prisma.purchaseBill.update({ where: { id: bill.id }, data: { photoPath: null } });
      deleteBillPhoto(bill.photoPath);
      removed += 1;
    }
    refreshBills();
    return { ok: true, data: { removed, freedBytes } };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
