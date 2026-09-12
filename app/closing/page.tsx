import prisma from "@/lib/prisma";
import { listBackups } from "@/lib/backup";
import { formatDateTime, formatQuantity, round2 } from "@/lib/format";
import { startOfToday } from "@/lib/utils";
import BackupPanel from "./backup-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Night Closing" };

type ClosingRow = {
  id: string;
  time: string;
  kind: "SALE" | "PAYMENT";
  typeLabel: string;
  customerName: string | null;
  details: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
};

export default async function ClosingPage() {
  const todayStart = startOfToday();
  const backups = listBackups();

  const [sales, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { createdAt: { gte: todayStart }, type: { in: ["RETAIL", "WHOLESALE"] } },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true, unit: true } } } },
      },
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: todayStart }, type: "PAYMENT" },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  const cashFromSales = round2(sales.reduce((sum, t) => sum + t.paidAmount, 0));
  const udharoAdded = round2(sales.reduce((sum, t) => sum + Math.max(t.totalAmount - t.paidAmount, 0), 0));
  const creditPayments = round2(payments.reduce((sum, p) => sum + p.totalAmount, 0));
  const totalCashToday = round2(cashFromSales + creditPayments);

  const rows: ClosingRow[] = [];
  for (const t of sales) {
    rows.push({
      id: t.id,
      time: t.createdAt.toISOString(),
      kind: "SALE",
      typeLabel: t.type,
      customerName: t.customer?.name ?? null,
      details: t.items.map((i) => `${formatQuantity(i.quantity)} ${i.product.name}`).join(", ") || "—",
      totalAmount: t.totalAmount,
      paidAmount: t.paidAmount,
      paymentStatus: t.paymentStatus,
    });
  }
  for (const p of payments) {
    rows.push({
      id: p.id,
      time: p.createdAt.toISOString(),
      kind: "PAYMENT",
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
    { label: "Credit Payments Received", value: creditPayments, sub: `${payments.length} khata settlements`, tone: "text-emerald-700" },
    { label: "Total Cash in Hand", value: totalCashToday, sub: "count this in the cash drawer", tone: "text-slate-900" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Night Closing</h1>
        <p className="mt-1 text-slate-500">
          End-of-day khata summary — match these numbers against the cash drawer, then take a backup.
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card p-4">
            <p className="text-sm font-semibold text-slate-500">{m.label}</p>
            <p className={`mt-2 text-2xl font-bold ${m.tone}`}>Rs. {m.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="mt-1 text-xs text-slate-400">{m.sub}</p>
          </div>
        ))}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Today&apos;s Transactions</h2>
          <p className="text-xs text-slate-400">Sales and khata payments recorded since midnight, newest first.</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No transactions today yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
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
                  <tr key={row.id} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{formatDateTime(row.time)}</td>
                    <td className="px-5 py-2.5">
                      <span className={row.kind === "PAYMENT" ? "badge-emerald" : row.typeLabel === "WHOLESALE" ? "badge-blue" : "badge-slate"}>
                        {row.typeLabel}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-medium text-slate-800">
                      {row.customerName ?? <span className="text-slate-400">Cash Walk-in</span>}
                    </td>
                    <td className="max-w-[260px] truncate px-5 py-2.5 text-slate-500">{row.details}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-bold text-slate-900">Rs. {row.totalAmount.toFixed(2)}</td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-slate-700">Rs. {row.paidAmount.toFixed(2)}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={
                          row.paymentStatus === "PAID"
                            ? "badge-emerald"
                            : row.paymentStatus === "PARTIAL"
                              ? "badge-amber"
                              : "badge-red"
                        }
                      >
                        {row.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="text-lg font-bold text-slate-900">Database Backup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Take a backup every night after closing. Copies land in the{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">backups/</code> folder next to the app —
          copy that folder to a pen drive weekly.
        </p>
        <BackupPanel backups={backups} />
      </section>
    </div>
  );
}
