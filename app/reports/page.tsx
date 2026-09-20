import Link from "next/link";
import { headers } from "next/headers";
import os from "os";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import { Download } from "lucide-react";
import {
  BadgePercent,
  Banknote,
  BarChart3,
  CircleDollarSign,
  HandCoins,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { autoBackupIfNeeded, listBackups } from "@/lib/backup";
import { formatNPR, formatPercentage, formatQuantity, round2 } from "@/lib/format";
import { CountUpNpr } from "@/components/number-flow";
import { describeRange, startOfDay, startOfToday, toDateKey } from "@/lib/utils";
import BackupPanel from "./backup-panel";
import DateNav, { type ReportsView } from "./date-nav";
import DaySummaryPrint, { type DaySummaryData } from "./day-summary-print";
import RangeSummaryPrint, { type RangeSummaryData } from "./range-summary-print";
import TransactionsTable from "./transactions-table";
import type { ProductSalesRow, RangeDayRow, ReportRowData, ProductCardData, CustomerOption } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Range views list the newest 400 records — older ones stay in the CSV export. */
const RANGE_ROW_CAP = 400;
/** The day-by-day breakdown table shows at most this many days. */
const BREAKDOWN_DAY_CAP = 100;

/** The LAN address phones on the same WiFi should use — not localhost. */
async function getLanUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const port = host.includes(":") ? host.slice(host.indexOf(":") + 1) : "3000";

  let lanIp: string | null = null;
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal && !lanIp) lanIp = net.address;
    }
  }
  return `${proto}://${lanIp ?? host}${lanIp ? `:${port}` : ""}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const view: ReportsView =
    params.from && params.to && dateRe.test(params.from) && dateRe.test(params.to)
      ? { mode: "range", fromKey: params.from <= params.to ? params.from : params.to, toKey: params.from <= params.to ? params.to : params.from }
      : { mode: "day", dateKey: params.date && dateRe.test(params.date) ? params.date : toDateKey(startOfToday()) };

  const rangeStart = view.mode === "range" ? startOfDay(view.fromKey) : startOfDay(view.dateKey);
  const rangeEndExclusive = new Date(rangeStart);
  if (view.mode === "range") {
    rangeEndExclusive.setTime(startOfDay(view.toKey).getTime() + DAY_MS);
  } else {
    rangeEndExclusive.setTime(rangeStart.getTime() + DAY_MS);
  }

  // The shopkeeper opens Reports at closing time — the natural moment for the
  // daily safety snapshot. Refresh the list afterwards so it shows the new file.
  const autoBackup = await autoBackupIfNeeded();
  const backups = listBackups();

  const [sales, payments, outstanding, products, allCustomers, purchases] = await Promise.all([
    prisma.transaction.findMany({
      where: { createdAt: { gte: rangeStart, lt: rangeEndExclusive }, type: { in: ["RETAIL", "WHOLESALE"] } },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true, baseUnit: true, costPrice: true, category: true } } } },
      },
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: rangeStart, lt: rangeEndExclusive }, type: "PAYMENT" },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.customer.aggregate({ _sum: { currentBalance: true }, where: { currentBalance: { gt: 0 } } }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        baseUnit: true,
        lowStockAt: true,
        retailPrice: true,
        wholesalePrice: true,
        costPrice: true,
        sellAs: true,
        manufacturingDate: true,
        expiryDate: true,
        units: { select: { id: true, name: true, factor: true }, orderBy: { factor: "desc" } },
      },
      orderBy: { stockQuantity: "asc" },
    }),
    prisma.customer.findMany({ orderBy: [{ currentBalance: "desc" }, { name: "asc" }] }),
    // Vendor bills recorded in this window — the "how much did we buy" side.
    prisma.purchaseBill.aggregate({
      _sum: { totalAmount: true, vatAmount: true },
      _count: { _all: true },
      where: { createdAt: { gte: rangeStart, lt: rangeEndExclusive } },
    }),
  ]);

  const productData: ProductCardData[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: "",
    barcode: null,
    retailPrice: p.retailPrice,
    wholesalePrice: p.wholesalePrice,
    costPrice: p.costPrice,
    sellAs: p.sellAs as ProductCardData["sellAs"],
    stockQuantity: p.stockQuantity,
    baseUnit: p.baseUnit,
    lowStockAt: p.lowStockAt,
    manufacturingDate: p.manufacturingDate?.toISOString() ?? null,
    expiryDate: p.expiryDate?.toISOString() ?? null,
    units: p.units.map((u) => ({ id: u.id, name: u.name, factor: u.factor })),
  }));

  const customerData: CustomerOption[] = allCustomers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    currentBalance: c.currentBalance,
    isFavorite: c.isFavorite,
  }));

  const cashFromSales = round2(sales.reduce((sum, t) => sum + t.paidAmount, 0));
  const udharoAdded = round2(sales.reduce((sum, t) => sum + Math.max(t.totalAmount - t.paidAmount, 0), 0));
  const creditPayments = round2(payments.reduce((sum, p) => sum + p.totalAmount, 0));
  const totalCash = round2(cashFromSales + creditPayments);
  const salesTotal = round2(sales.reduce((sum, t) => sum + t.totalAmount, 0));
  const discountsGiven = round2(sales.reduce((sum, t) => sum + t.discountAmount, 0));
  const cogs = round2(
    sales.reduce((sum, t) => sum + t.items.reduce((lineSum, i) => lineSum + i.quantity * i.product.costPrice, 0), 0),
  );
  const profit = round2(salesTotal - cogs);
  const profitMargin = salesTotal > 0 ? formatPercentage(profit / salesTotal) : null;
  const missingCostProducts = new Set(
    sales.flatMap((t) => t.items.filter((i) => i.product.costPrice <= 0).map((i) => i.product.name)),
  ).size;
  const outstandingTotal = round2(outstanding._sum.currentBalance ?? 0);
  const lowStock = products.filter((p) => p.stockQuantity <= p.lowStockAt);
  const stockValue = round2(products.reduce((sum, p) => sum + p.stockQuantity * p.retailPrice, 0));
  const stockValueCost = round2(products.reduce((sum, p) => sum + p.stockQuantity * p.costPrice, 0));
  const purchasesTotal = round2(purchases._sum.totalAmount ?? 0);
  const purchasesVat = round2(purchases._sum.vatAmount ?? 0);
  const purchasesCount = purchases._count._all;

  const rows: ReportRowData[] = [];
  for (const t of sales) {
    rows.push({
      id: t.id,
      time: t.createdAt.toISOString(),
      typeLabel: t.type,
      customerName: t.customer?.name ?? null,
      customerId: t.customerId,
      items: t.items.map((i) => ({
        productId: i.productId,
        name: i.product.name,
        quantity: i.quantity,
        unitName: i.unitName,
        baseUnit: i.product.baseUnit,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
      totalAmount: t.totalAmount,
      discountAmount: t.discountAmount,
      discountNote: t.discountNote,
      paidAmount: t.paidAmount,
      paymentStatus: t.paymentStatus,
    });
  }
  for (const p of payments) {
    rows.push({
      id: p.id,
      time: p.createdAt.toISOString(),
      typeLabel: "PAYMENT",
      customerName: p.customer?.name ?? null,
      customerId: p.customerId,
      items: [],
      totalAmount: p.totalAmount,
      discountAmount: 0,
      discountNote: null,
      paidAmount: p.totalAmount,
      paymentStatus: "PAID",
    });
  }
  rows.sort((a, b) => (a.time < b.time ? 1 : -1));

  const isRange = view.mode === "range";
  // Day mode lists everything; range mode caps the on-screen table (the CSV
  // export always carries the full range).
  const visibleRows = isRange ? rows.slice(0, RANGE_ROW_CAP) : rows;

  // Day-by-day breakdown for the range closing sheet.
  const dayRows: RangeDayRow[] = [];
  if (isRange) {
    const byDay = new Map<string, { bills: number; sales: number; disc: number; cash: number; udharo: number }>();
    for (const t of sales) {
      const dayKey = toDateKey(t.createdAt);
      const acc = byDay.get(dayKey) ?? { bills: 0, sales: 0, disc: 0, cash: 0, udharo: 0 };
      acc.bills += 1;
      acc.sales += t.totalAmount;
      acc.disc += t.discountAmount;
      acc.cash += t.paidAmount;
      acc.udharo += Math.max(t.totalAmount - t.paidAmount, 0);
      byDay.set(dayKey, acc);
    }
    const paymentByDay = new Map<string, number>();
    for (const p of payments) {
      const dayKey = toDateKey(p.createdAt);
      paymentByDay.set(dayKey, (paymentByDay.get(dayKey) ?? 0) + p.totalAmount);
    }
    for (let time = rangeStart.getTime(); time < rangeEndExclusive.getTime() && dayRows.length < BREAKDOWN_DAY_CAP; time += DAY_MS) {
      const dayKey = toDateKey(new Date(time));
      const acc = byDay.get(dayKey);
      const credit = paymentByDay.get(dayKey) ?? 0;
      if (!acc && credit === 0) continue; // skip silent days in the breakdown
      dayRows.push({
        dateKey: dayKey,
        bills: acc?.bills ?? 0,
        salesTotal: round2(acc?.sales ?? 0),
        discounts: round2(acc?.disc ?? 0),
        cash: round2(acc?.cash ?? 0),
        udharoAdded: round2(acc?.udharo ?? 0),
        creditPayments: round2(credit),
      });
    }
  }

  // "What sold" — per-product quantity and revenue across the range, with
  // category subtotals. Costs give a rough per-product profit where set.
  const productSales: ProductSalesRow[] = [];
  const salesByProduct = new Map<string, ProductSalesRow>();
  for (const t of sales) {
    for (const item of t.items) {
      let row = salesByProduct.get(item.productId);
      if (!row) {
        row = {
          productId: item.productId,
          name: item.product.name,
          category: item.product.category || "General",
          quantitySold: 0,
          revenue: 0,
          cogs: 0,
        };
        salesByProduct.set(item.productId, row);
        productSales.push(row);
      }
      row.quantitySold = round2(row.quantitySold + item.quantity);
      row.revenue = round2(row.revenue + item.subtotal);
      row.cogs = round2(row.cogs + item.quantity * item.product.costPrice);
    }
  }
  productSales.sort((x, y) => y.revenue - x.revenue);
  const categorySales = [...new Set(productSales.map((p) => p.category))].map((category) => {
    const inCat = productSales.filter((p) => p.category === category);
    return {
      category,
      revenue: round2(inCat.reduce((sum, p) => sum + p.revenue, 0)),
      quantitySold: round2(inCat.reduce((sum, p) => sum + p.quantitySold, 0)),
    };
  }).sort((x, y) => y.revenue - x.revenue);

  const rangeSummary: RangeSummaryData = {
    label: describeRange(view.mode === "range" ? view.fromKey : view.dateKey, view.mode === "range" ? view.toKey : view.dateKey),
    bills: sales.length,
    salesTotal,
    discountsGiven,
    cashFromSales,
    creditPayments,
    udharoAdded,
    totalCash,
    profitToday: sales.length > 0 && missingCostProducts === 0 ? profit : null,
    purchasesTotal: purchasesCount > 0 ? purchasesTotal : null,
    outstandingTotal,
    days: dayRows,
  };

  const daySummary: DaySummaryData = {
    dateKey: view.mode === "day" ? view.dateKey : view.fromKey,
    weekday: WEEKDAYS[rangeStart.getDay()],
    bills: sales.length,
    salesTotal,
    discountsGiven,
    cashFromSales,
    creditPayments,
    udharoAdded,
    totalCash,
    profitToday: sales.length > 0 && missingCostProducts === 0 ? profit : null,
    outstandingTotal,
  };

  const exportFrom = view.mode === "range" ? view.fromKey : view.dateKey;
  const exportTo = view.mode === "range" ? view.toKey : view.dateKey;
  const csvHref = `/api/export?from=${exportFrom}&to=${exportTo}`;
  const csvProductsHref = `${csvHref}&kind=products`;

  const metrics: {
    label: string;
    value: number;
    sub: string;
    icon: ReactNode;
    iconClass: string;
    valueClass: string;
  }[] = [
    {
      label: "Cash from Sales",
      value: cashFromSales,
      sub: `${sales.length} bill${sales.length === 1 ? "" : "s"}`,
      icon: <Banknote size={20} />,
      iconClass: "bg-emerald-100 text-emerald-700",
      valueClass: "text-foreground",
    },
    {
      label: isRange ? "Profit in Range" : "Profit Today",
      value: profit,
      sub:
        missingCostProducts > 0
          ? `set cost prices — ${missingCostProducts} product${missingCostProducts === 1 ? "" : "s"} sold have none`
          : profitMargin
            ? `≈ ${profitMargin} margin, after COGS`
            : "no sales to report",
      icon: <TrendingUp size={20} />,
      iconClass: "bg-emerald-100 text-emerald-700",
      valueClass: "text-emerald-700",
    },
    {
      label: "Udharo Added",
      value: udharoAdded,
      sub: isRange ? "credit given in range" : "credit given this day",
      icon: <HandCoins size={20} />,
      iconClass: "bg-amber-100 text-amber-700",
      valueClass: "text-amber-600",
    },
    {
      label: "Credit Payments",
      value: creditPayments,
      sub: `${payments.length} khata settlement${payments.length === 1 ? "" : "s"}`,
      icon: <Wallet size={20} />,
      iconClass: "bg-emerald-100 text-emerald-700",
      valueClass: "text-emerald-700",
    },
    {
      label: "Discounts Given",
      value: discountsGiven,
      sub: isRange ? "bhaansi off in range" : "bhaansi off this day",
      icon: <BadgePercent size={20} />,
      iconClass: "bg-rose-100 text-rose-600",
      valueClass: "text-rose-600",
    },
    {
      label: "Total Cash in Hand",
      value: totalCash,
      sub: isRange ? "cash collected across the range" : "count this in the cash drawer",
      icon: <CircleDollarSign size={20} />,
      iconClass: "bg-primary/10 text-primary",
      valueClass: "text-primary",
    },
  ];

  const lanUrl = await getLanUrl();
  const qrDataUrl = await QRCode.toDataURL(lanUrl, { margin: 1, width: 180 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title={isRange ? "Range Report" : "Reports"}
        subtitle={
          isRange
            ? "Weeks, months or any custom span — totals, the day-by-day closing sheet, and CSV export."
            : "Day-by-day record of everything the shop did — match the cash numbers against the drawer."
        }
        icon={<BarChart3 size={22} />}
        actions={<DateNav view={view} />}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-muted-foreground">{m.label}</p>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.iconClass}`}>
                {m.icon}
              </span>
            </div>
            <p className={`mt-2 text-2xl font-bold ${m.valueClass}`}>
              <CountUpNpr value={m.value} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </section>

      {isRange && (
        <section className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <ReceiptText size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Purchases recorded in this range: {formatNPR(purchasesTotal)}
                {purchasesVat > 0 ? <span className="font-normal text-muted-foreground"> (input VAT {formatNPR(purchasesVat)})</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {purchasesCount > 0
                  ? `${purchasesCount} vendor bill${purchasesCount === 1 ? "" : "s"} captured on the Bills screen.`
                  : "No vendor bills captured in this range yet — scan them on the Bills screen."}
              </p>
            </div>
          </div>
          <Button variant="outline" render={<Link href="/bills" />}>
            <ReceiptText /> Open Bills
          </Button>
        </section>
      )}

      {isRange && dayRows.length > 0 && (
        <section className="card mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Day-by-day</h2>
              <p className="text-xs text-muted-foreground">
                The monthly-closing breakdown — every day with activity in {rangeSummary.label}.
              </p>
            </div>
            <RangeSummaryPrint summary={rangeSummary} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm md:min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Bills</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sales</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Bhaansi</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cash in</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Udharo added</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Credit payments</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((day) => (
                  <tr key={day.dateKey} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <a
                        href={`/reports?date=${day.dateKey}`}
                        className="font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        {formatQuantity(Number(day.dateKey.slice(8, 10)))} {WEEKDAYS[new Date(day.dateKey + "T00:00:00").getDay()].slice(0, 3)}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right">{day.bills}</td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{formatNPR(day.salesTotal)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-rose-600">
                      {day.discounts > 0 ? formatNPR(day.discounts) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{formatNPR(day.cash)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-amber-600">
                      {day.udharoAdded > 0 ? formatNPR(day.udharoAdded) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-emerald-700">
                      {day.creditPayments > 0 ? formatNPR(day.creditPayments) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-bold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right">{sales.length}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatNPR(salesTotal)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-rose-600">{formatNPR(discountsGiven)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatNPR(cashFromSales)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-amber-600">{formatNPR(udharoAdded)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-emerald-700">{formatNPR(creditPayments)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {isRange && dayRows.length === 0 && (
        <section className="card mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-foreground">Day-by-day</h2>
              <p className="text-xs text-muted-foreground">No transactions were recorded in {rangeSummary.label}.</p>
            </div>
            <RangeSummaryPrint summary={rangeSummary} />
          </div>
        </section>
      )}

      {isRange && productSales.length > 0 && (
        <section className="card mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-foreground">What sold</h2>
              <p className="text-xs text-muted-foreground">
                {productSales.length} product{productSales.length === 1 ? "" : "s"} moved in {rangeSummary.label} — sorted by revenue, to see what actually sells.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categorySales.map((c) => (
                <Badge key={c.category} variant="muted">
                  {c.category}: {formatNPR(c.revenue)}
                </Badge>
              ))}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm md:min-w-[560px]">
              <thead>
                <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-semibold">Product</th>
                  <th className="py-2 pr-4 font-semibold">Category</th>
                  <th className="py-2 pr-4 text-right font-semibold">Qty sold</th>
                  <th className="py-2 pr-4 text-right font-semibold">Revenue</th>
                  <th className="py-2 text-right font-semibold">Gross profit*</th>
                </tr>
              </thead>
              <tbody>
                {productSales.slice(0, 25).map((p) => (
                  <tr key={p.productId} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-4 font-semibold text-foreground">{p.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{p.category}</td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">{formatQuantity(p.quantitySold)}</td>
                    <td className="py-2 pr-4 text-right font-semibold whitespace-nowrap">{formatNPR(p.revenue)}</td>
                    <td className="py-2 text-right whitespace-nowrap text-emerald-700">
                      {p.cogs > 0 ? formatNPR(round2(p.revenue - p.cogs)) : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {productSales.length > 25 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the top 25 by revenue — {productSales.length - 25} more in the CSV export.
              </p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              *Gross profit needs cost prices set on products (Stock → Edit); “—” means the cost is unknown.
            </p>
          </div>
        </section>
      )}

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{isRange ? "Transactions in the range" : "Transactions of the day"}</h2>
            <p className="text-xs text-muted-foreground">
              {rows.length} record{rows.length === 1 ? "" : "s"} • sales worth {formatNPR(salesTotal)}
              {discountsGiven > 0 ? ` • ${formatNPR(discountsGiven)} bhaansi given` : ""} • use the ⋯ menu to edit a
              bill&apos;s lines, print a receipt again, or void a wrong bill.
              {isRange && rows.length > visibleRows.length ? ` Showing the newest ${RANGE_ROW_CAP} — the CSV export has all ${rows.length}.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" render={<a href={csvHref} download />}>
              <Download /> Transactions CSV
            </Button>
            {isRange && (
              <Button variant="outline" render={<a href={csvProductsHref} download />}>
                <Download /> Products CSV
              </Button>
            )}
            {isRange ? <RangeSummaryPrint summary={rangeSummary} /> : <DaySummaryPrint summary={daySummary} rows={visibleRows} />}
          </div>
        </div>
        <TransactionsTable rows={visibleRows} products={productData} customers={customerData} />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-lg font-bold text-foreground">Stock health</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Outstanding khata</p>
              <p className="mt-0.5 text-lg font-bold text-red-600">
                <CountUpNpr value={outstandingTotal} />
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Stock value</p>
              <p className="mt-0.5 text-lg font-bold">
                <CountUpNpr value={stockValue} />
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">retail • cost {formatNPR(stockValueCost)}</p>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-sm font-semibold text-foreground">Low stock ({lowStock.length})</p>
            <div className="mt-2 space-y-1.5">
              {lowStock.length === 0 ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  All products are well stocked. राम्रो!
                </p>
              ) : (
                lowStock.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    <Badge variant={p.stockQuantity <= 0 ? "destructive" : "warning"}>
                      {formatQuantity(p.stockQuantity)} {p.baseUnit} left
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-bold text-foreground">Open on phone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan this with the shop phone (same WiFi). For <strong>camera barcode scanning</strong>, run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run phone</code> on the computer and
            open the <strong>https://</strong> address it prints — browsers hide the camera on http:// addresses.
          </p>
          <div className="mt-3 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code with the app address" className="h-36 w-36 rounded-lg border border-border bg-white p-1" />
            <code className="min-w-0 break-all rounded-lg bg-muted px-3 py-2 text-sm">{lanUrl}</code>
          </div>
        </div>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="text-lg font-bold text-foreground">Database backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {autoBackup
            ? "An automatic safety copy was saved just now when you opened this page. "
            : "A safety copy is taken automatically at least once a day when this page is opened. "}
          Copies land in the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">backups/</code> folder next to the app —
          copy that folder to a pen drive weekly.
        </p>
        <BackupPanel backups={backups} />
      </section>
    </div>
  );
}
