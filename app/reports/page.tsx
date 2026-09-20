import { headers } from "next/headers";
import os from "os";
import QRCode from "qrcode";
import type { ReactNode } from "react";
import {
  BadgePercent,
  Banknote,
  BarChart3,
  CircleDollarSign,
  HandCoins,
  TrendingUp,
  Wallet,
} from "lucide-react";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { autoBackupIfNeeded, listBackups } from "@/lib/backup";
import { formatNPR, formatPercentage, formatQuantity, round2 } from "@/lib/format";
import { CountUpNpr } from "@/components/number-flow";
import { startOfDay, startOfToday, toDateKey } from "@/lib/utils";
import BackupPanel from "./backup-panel";
import DateNav from "./date-nav";
import DaySummaryPrint, { type DaySummaryData } from "./day-summary-print";
import TransactionsTable from "./transactions-table";
import type { ReportRowData, ProductCardData, CustomerOption } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

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
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const dateKey = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : toDateKey(startOfToday());
  const dayStart = startOfDay(dateKey);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  // The shopkeeper opens Reports at closing time — the natural moment for the
  // daily safety snapshot. Refresh the list afterwards so it shows the new file.
  const autoBackup = await autoBackupIfNeeded();
  const backups = listBackups();

  const [sales, payments, outstanding, products, allCustomers] = await Promise.all([
    prisma.transaction.findMany({
      where: { createdAt: { gte: dayStart, lt: dayEnd }, type: { in: ["RETAIL", "WHOLESALE"] } },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true, baseUnit: true, costPrice: true } } } },
      },
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: dayStart, lt: dayEnd }, type: "PAYMENT" },
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
  const profitToday = round2(salesTotal - cogs);
  const profitMargin = salesTotal > 0 ? formatPercentage(profitToday / salesTotal) : null;
  const missingCostProducts = new Set(
    sales.flatMap((t) => t.items.filter((i) => i.product.costPrice <= 0).map((i) => i.product.name)),
  ).size;
  const outstandingTotal = round2(outstanding._sum.currentBalance ?? 0);
  const lowStock = products.filter((p) => p.stockQuantity <= p.lowStockAt);
  const stockValue = round2(products.reduce((sum, p) => sum + p.stockQuantity * p.retailPrice, 0));
  const stockValueCost = round2(products.reduce((sum, p) => sum + p.stockQuantity * p.costPrice, 0));

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
      label: "Profit Today",
      value: profitToday,
      sub:
        missingCostProducts > 0
          ? `set cost prices — ${missingCostProducts} product${missingCostProducts === 1 ? "" : "s"} sold today have none`
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
      sub: "credit given this day",
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
      sub: "bhaansi off this day",
      icon: <BadgePercent size={20} />,
      iconClass: "bg-rose-100 text-rose-600",
      valueClass: "text-rose-600",
    },
    {
      label: "Total Cash in Hand",
      value: totalCash,
      sub: "count this in the cash drawer",
      icon: <CircleDollarSign size={20} />,
      iconClass: "bg-primary/10 text-primary",
      valueClass: "text-primary",
    },
  ];

  const lanUrl = await getLanUrl();
  const qrDataUrl = await QRCode.toDataURL(lanUrl, { margin: 1, width: 180 });

  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const daySummary: DaySummaryData = {
    dateKey,
    weekday: WEEKDAYS[dayStart.getDay()],
    bills: sales.length,
    salesTotal,
    discountsGiven,
    cashFromSales,
    creditPayments,
    udharoAdded,
    totalCash,
    profitToday: sales.length > 0 && missingCostProducts === 0 ? profitToday : null,
    outstandingTotal,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Reports"
        subtitle="Day-by-day record of everything the shop did — match the cash numbers against the drawer."
        icon={<BarChart3 size={22} />}
        actions={<DateNav dateKey={dateKey} />}
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

      <section className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Transactions of the day</h2>
            <p className="text-xs text-muted-foreground">
              {rows.length} record{rows.length === 1 ? "" : "s"} • sales worth {formatNPR(salesTotal)}
              {discountsGiven > 0 ? ` • ${formatNPR(discountsGiven)} bhaansi given` : ""} • use the ⋯ menu to edit a
              bill&apos;s lines, print a receipt again, or void a wrong bill.
            </p>
          </div>
          <DaySummaryPrint summary={daySummary} rows={rows} />
        </div>
        <TransactionsTable rows={rows} products={productData} customers={customerData} />
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
