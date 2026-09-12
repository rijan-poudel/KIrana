import { headers } from "next/headers";
import os from "os";
import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { listBackups } from "@/lib/backup";
import { formatDateTime, formatNPR, formatQuantity, round2 } from "@/lib/format";
import { startOfToday } from "@/lib/utils";
import BackupPanel from "./backup-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reports" };

type ReportRow = {
  id: string;
  time: string;
  typeLabel: string;
  customerName: string | null;
  details: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
};

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

export default async function ReportsPage() {
  const todayStart = startOfToday();
  const backups = listBackups();

  const [sales, payments, outstanding, products] = await Promise.all([
    prisma.transaction.findMany({
      where: { createdAt: { gte: todayStart }, type: { in: ["RETAIL", "WHOLESALE"] } },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true, baseUnit: true } } } },
      },
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: todayStart }, type: "PAYMENT" },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.customer.aggregate({ _sum: { currentBalance: true }, where: { currentBalance: { gt: 0 } } }),
    prisma.product.findMany({
      select: { id: true, name: true, stockQuantity: true, baseUnit: true, lowStockAt: true, retailPrice: true },
      orderBy: { stockQuantity: "asc" },
    }),
  ]);

  const cashFromSales = round2(sales.reduce((sum, t) => sum + t.paidAmount, 0));
  const udharoAdded = round2(sales.reduce((sum, t) => sum + Math.max(t.totalAmount - t.paidAmount, 0), 0));
  const creditPayments = round2(payments.reduce((sum, p) => sum + p.totalAmount, 0));
  const totalCashToday = round2(cashFromSales + creditPayments);
  const outstandingTotal = round2(outstanding._sum.currentBalance ?? 0);
  const lowStock = products.filter((p) => p.stockQuantity <= p.lowStockAt);
  const stockValue = round2(products.reduce((sum, p) => sum + p.stockQuantity * p.retailPrice, 0));

  const rows: ReportRow[] = [];
  for (const t of sales) {
    rows.push({
      id: t.id,
      time: t.createdAt.toISOString(),
      typeLabel: t.type,
      customerName: t.customer?.name ?? null,
      details:
        t.items.map((i) => `${formatQuantity(i.quantity)} ${i.product.name}`).join(", ") || "—",
      totalAmount: t.totalAmount,
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
      details: "Khata credit payment received",
      totalAmount: p.totalAmount,
      paidAmount: p.totalAmount,
      paymentStatus: "PAID",
    });
  }
  rows.sort((a, b) => (a.time < b.time ? 1 : -1));

  const metrics = [
    { label: "Cash from Sales", value: cashFromSales, sub: `${sales.length} bills today`, tone: "text-emerald-700" },
    { label: "Udharo Added", value: udharoAdded, sub: "credit given today", tone: "text-amber-600" },
    {
      label: "Credit Payments Received",
      value: creditPayments,
      sub: `${payments.length} khata settlements`,
      tone: "text-emerald-700",
    },
    { label: "Total Cash in Hand", value: totalCashToday, sub: "count this in the cash drawer", tone: "text-foreground" },
  ];

  const lanUrl = await getLanUrl();
  const qrDataUrl = await QRCode.toDataURL(lanUrl, { margin: 1, width: 180 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">Reports</h1>
        <p className="mt-1 text-muted-foreground">
          Daily khata summary — match the cash numbers against the drawer, then take a backup.
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card p-4">
            <p className="text-sm font-semibold text-muted-foreground">{m.label}</p>
            <p className={`mt-2 text-2xl font-bold ${m.tone}`}>
              Rs. {m.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-lg font-bold text-foreground">Stock health</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Outstanding khata</p>
              <p className="mt-0.5 text-lg font-bold text-red-600">{formatNPR(outstandingTotal)}</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Stock value (retail)</p>
              <p className="mt-0.5 text-lg font-bold">{formatNPR(stockValue)}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Low stock ({lowStock.length})</p>
            </div>
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
            Scan this with the shop phone (same WiFi) to bill from the counter camera. For camera scanning, start the
            app with <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run dev:phone</code> and use
            the HTTPS address it prints.
          </p>
          <div className="mt-3 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code with the app address" className="h-36 w-36 rounded-lg border border-border bg-white p-1" />
            <code className="min-w-0 break-all rounded-lg bg-muted px-3 py-2 text-sm">{lanUrl}</code>
          </div>
        </div>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold text-foreground">Today&apos;s transactions</h2>
          <p className="text-xs text-muted-foreground">Sales and khata payments recorded since midnight, newest first.</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No transactions today yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-5 py-2.5 font-semibold">Time</th>
                  <th className="px-5 py-2.5 font-semibold">Type</th>
                  <th className="px-5 py-2.5 font-semibold">Customer</th>
                  <th className="px-5 py-2.5 font-semibold">Details</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Paid</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    <td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(row.time)}</td>
                    <td className="px-5 py-2.5">
                      <Badge
                        variant={
                          row.typeLabel === "PAYMENT" ? "success" : row.typeLabel === "WHOLESALE" ? "info" : "muted"
                        }
                      >
                        {row.typeLabel}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 font-medium text-foreground">
                      {row.customerName ?? <span className="text-muted-foreground">Cash walk-in</span>}
                    </td>
                    <td className="max-w-[260px] truncate px-5 py-2.5 text-muted-foreground">{row.details}</td>
                    <td className="px-5 py-2.5 text-right font-bold whitespace-nowrap text-foreground">
                      Rs. {row.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap text-foreground/80">Rs. {row.paidAmount.toFixed(2)}</td>
                    <td className="px-5 py-2.5">
                      <Badge
                        variant={
                          row.paymentStatus === "PAID" ? "success" : row.paymentStatus === "PARTIAL" ? "warning" : "destructive"
                        }
                      >
                        {row.paymentStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="text-lg font-bold text-foreground">Database backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Take a backup every night after closing. Copies land in the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">backups/</code> folder next to the app —
          copy that folder to a pen drive weekly.
        </p>
        <BackupPanel backups={backups} />
      </section>
    </div>
  );
}
