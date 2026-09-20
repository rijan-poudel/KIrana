import prisma from "@/lib/prisma";
import { billPhotoStats } from "@/lib/bill-photos";
import type { BillData } from "@/lib/types";
import BillsClient from "./bills-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bills" };

export default async function BillsPage() {
  const [bills, vendors, photoStats] = await Promise.all([
    prisma.purchaseBill.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.purchaseBill.findMany({ distinct: ["vendorName"], select: { vendorName: true }, orderBy: { vendorName: "asc" } }),
    Promise.resolve(billPhotoStats()),
  ]);

  const data: BillData[] = bills.map((bill) => ({
    id: bill.id,
    vendorName: bill.vendorName,
    vendorPan: bill.vendorPan,
    billNumber: bill.billNumber,
    billDateBs: bill.billDateBs,
    billDateAd: bill.billDateAd ? bill.billDateAd.toISOString() : null,
    fiscalYear: bill.fiscalYear,
    taxableAmount: bill.taxableAmount,
    vatAmount: bill.vatAmount,
    totalAmount: bill.totalAmount,
    isVatBill: bill.isVatBill,
    source: bill.source,
    rawPayload: bill.rawPayload,
    hasPhoto: bill.photoPath !== null,
    note: bill.note,
    createdAt: bill.createdAt.toISOString(),
  }));

  return (
    <BillsClient
      bills={data}
      vendors={vendors.map((v) => v.vendorName)}
      photoStats={photoStats}
    />
  );
}
