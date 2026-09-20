import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { formatQuantity, round2 } from "@/lib/format";
import { startOfDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * CSV export of the report data for any day or range — the accountant/tax
 * download behind the "Download CSV" button on Reports.
 *
 *   /api/export?from=2026-09-01&to=2026-09-30            → transaction rows
 *   /api/export?from=…&to=…&kind=products                 → what-sold rows
 *
 * No auth by design: the app runs on the shop's own LAN, like the rest of it.
 */

function parseDateKey(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return startOfDay(value);
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // Quote anything with a comma, quote or newline; double the quotes inside.
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = parseDateKey(params.get("from"));
  const to = parseDateKey(params.get("to"));
  if (!from || !to) {
    return new Response("from and to must be YYYY-MM-DD dates", { status: 400 });
  }
  const rangeEnd = new Date(to);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const kind = params.get("kind") === "products" ? "products" : "transactions";
  const rows: string[] = [];

  if (kind === "transactions") {
    const [sales, payments] = await Promise.all([
      prisma.transaction.findMany({
        where: { createdAt: { gte: from, lt: rangeEnd }, type: { in: ["RETAIL", "WHOLESALE"] } },
        orderBy: { createdAt: "asc" },
        include: {
          customer: { select: { name: true } },
          items: { include: { product: { select: { name: true, baseUnit: true } } } },
        },
      }),
      prisma.transaction.findMany({
        where: { createdAt: { gte: from, lt: rangeEnd }, type: "PAYMENT" },
        orderBy: { createdAt: "asc" },
        include: { customer: { select: { name: true } } },
      }),
    ]);

    rows.push(
      [
        "Date",
        "Time",
        "Receipt #",
        "Type",
        "Customer",
        "Items",
        "Gross total",
        "Discount",
        "Discount note",
        "Net total",
        "Paid",
        "Due",
        "Status",
      ].join(","),
    );
    for (const t of sales) {
      const itemsText = t.items
        .map((i) => `${formatQuantity(i.quantity)} ${i.product.name}${i.unitName ? ` (${i.unitName})` : ""}`)
        .join("; ");
      const gross = round2(t.totalAmount + t.discountAmount);
      const date = t.createdAt;
      rows.push(
        [
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
          `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
          `#${t.id.slice(-8).toUpperCase()}`,
          t.type,
          t.customer?.name ?? "Cash walk-in",
          itemsText,
          gross.toFixed(2),
          t.discountAmount.toFixed(2),
          t.discountNote ?? "",
          t.totalAmount.toFixed(2),
          t.paidAmount.toFixed(2),
          round2(t.totalAmount - t.paidAmount).toFixed(2),
          t.paymentStatus,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    for (const p of payments) {
      const date = p.createdAt;
      rows.push(
        [
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
          `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
          `#${p.id.slice(-8).toUpperCase()}`,
          "PAYMENT",
          p.customer?.name ?? "",
          "Khata settlement",
          "",
          "",
          "",
          p.totalAmount.toFixed(2),
          p.totalAmount.toFixed(2),
          "0.00",
          "PAID",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  } else {
    // What-sold export: per-product totals for the range.
    const sales = await prisma.transaction.findMany({
      where: { createdAt: { gte: from, lt: rangeEnd }, type: { in: ["RETAIL", "WHOLESALE"] } },
      include: { items: { include: { product: { select: { name: true, category: true, costPrice: true } } } } },
    });
    const byProduct = new Map<string, { name: string; category: string; qty: number; revenue: number; cogs: number }>();
    for (const t of sales) {
      for (const item of t.items) {
        const row = byProduct.get(item.productId) ?? {
          name: item.product.name,
          category: item.product.category || "General",
          qty: 0,
          revenue: 0,
          cogs: 0,
        };
        row.qty = round2(row.qty + item.quantity);
        row.revenue = round2(row.revenue + item.subtotal);
        row.cogs = round2(row.cogs + item.quantity * item.product.costPrice);
        byProduct.set(item.productId, row);
      }
    }
    rows.push(["Product", "Category", "Qty sold", "Revenue", "Cost of goods", "Gross profit"].join(","));
    for (const row of [...byProduct.values()].sort((a, b) => b.revenue - a.revenue)) {
      rows.push(
        [
          row.name,
          row.category,
          formatQuantity(row.qty),
          row.revenue.toFixed(2),
          row.cogs.toFixed(2),
          round2(row.revenue - row.cogs).toFixed(2),
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  // BOM first so Excel opens the UTF-8 accents/barcodes correctly.
  const body = "\ufeff" + rows.join("\r\n") + "\r\n";
  const filename = `milan-reports-${kind}-${params.get("from")}-to-${params.get("to")}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
