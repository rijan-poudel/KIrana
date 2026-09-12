import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpen, MoonStar, Package, Receipt, Truck, Wallet } from "lucide-react";
import StatusBadge from "@/components/status-badge";
import prisma from "@/lib/prisma";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { formatDateTime, formatNPR, formatQuantity, round2 } from "@/lib/format";
import { startOfToday } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

const QUICK_ACTIONS = [
  { href: "/billing", label: "New Counter Bill", icon: Receipt, tone: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  { href: "/khata", label: "Khata & Payments", icon: BookOpen, tone: "bg-white hover:bg-slate-50 text-slate-800 border border-slate-300" },
  { href: "/inventory", label: "Add / Check Stock", icon: Package, tone: "bg-white hover:bg-slate-50 text-slate-800 border border-slate-300" },
  { href: "/closing", label: "Night Closing", icon: MoonStar, tone: "bg-white hover:bg-slate-50 text-slate-800 border border-slate-300" },
];

export default async function DashboardPage() {
  const todayStart = startOfToday();

  const [salesToday, paymentsToday, outstanding, products, recentTransactions, pendingDeliveries] = await Promise.all([
    prisma.transaction.findMany({
      where: { createdAt: { gte: todayStart }, type: { in: ["RETAIL", "WHOLESALE"] } },
      select: { totalAmount: true, paidAmount: true },
    }),
    prisma.transaction.aggregate({
      _sum: { totalAmount: true },
      where: { createdAt: { gte: todayStart }, type: "PAYMENT" },
    }),
    prisma.customer.aggregate({ _sum: { currentBalance: true }, where: { currentBalance: { gt: 0 } } }),
    prisma.product.findMany({
      select: { id: true, name: true, stockQuantity: true, unit: true, retailPrice: true },
      orderBy: { stockQuantity: "asc" },
    }),
    prisma.transaction.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } }, items: { include: { product: { select: { name: true } } } } },
    }),
    prisma.deliveryLog.count({ where: { status: { in: ["PENDING", "DELIVERED"] } } }),
  ]);

  const cashFromSales = round2(salesToday.reduce((sum, t) => sum + t.paidAmount, 0));
  const udharoAdded = round2(salesToday.reduce((sum, t) => sum + Math.max(t.totalAmount - t.paidAmount, 0), 0));
  const creditPayments = round2(paymentsToday._sum.totalAmount ?? 0);
  const totalCashToday = round2(cashFromSales + creditPayments);
  const outstandingTotal = round2(outstanding._sum.currentBalance ?? 0);
  const lowStock = products.filter((p) => p.stockQuantity <= LOW_STOCK_THRESHOLD);
  const stockValue = round2(products.reduce((sum, p) => sum + p.stockQuantity * p.retailPrice, 0));

  const metrics = [
    { label: "Cash Collected Today", value: formatNPR(totalCashToday), sub: "Sales cash + khata payments", tone: "text-emerald-700" },
    { label: "Udharo Added Today", value: formatNPR(udharoAdded), sub: `${salesToday.length} bills today`, tone: "text-amber-600" },
    { label: "Outstanding Khata", value: formatNPR(outstandingTotal), sub: "Owed by all customers", tone: "text-red-600" },
    { label: "Stock Value", value: formatNPR(stockValue), sub: `${products.length} products on shelf`, tone: "text-slate-900" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Shop Dashboard</h1>
        <p className="mt-1 text-slate-500">{formatDate(new Date())} — everything at a glance, updated live.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card p-4">
            <p className="text-sm font-semibold text-slate-500">{m.label}</p>
            <p className={`mt-2 text-2xl font-bold ${m.tone}`}>{m.value}</p>
            <p className="mt-1 text-xs text-slate-400">{m.sub}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={`flex h-16 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold shadow-sm transition-colors ${action.tone}`}
            >
              <Icon size={20} />
              {action.label}
            </Link>
          );
        })}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <AlertTriangle size={18} className={lowStock.length > 0 ? "text-amber-500" : "text-emerald-600"} />
              Low Stock Alerts
            </h2>
            <span className="badge-slate">{lowStock.length} items</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Items at or below {LOW_STOCK_THRESHOLD} units remaining.</p>
          <div className="mt-3 space-y-2">
            {lowStock.length === 0 ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                All products are well stocked. राम्रो!
              </p>
            ) : (
              lowStock.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                  <span className={p.stockQuantity <= 0 ? "badge-red" : "badge-amber"}>
                    {formatQuantity(p.stockQuantity)} {p.unit} left
                  </span>
                </div>
              ))
            )}
            {lowStock.length > 6 && (
              <Link href="/inventory" className="flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
                View all in Inventory <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Truck size={18} className="text-slate-500" /> Operations
          </h2>
          <div className="mt-3 space-y-2">
            <Link href="/delivery" className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Truck size={16} className="text-slate-400" /> Honda Splendor dispatches in progress
              </span>
              <span className={pendingDeliveries > 0 ? "badge-amber" : "badge-slate"}>{pendingDeliveries}</span>
            </Link>
            <Link href="/khata" className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Wallet size={16} className="text-slate-400" /> Customers with active udharo
              </span>
              <span className={outstandingTotal > 0 ? "badge-red" : "badge-slate"}>
                {formatNPR(outstandingTotal)}
              </span>
            </Link>
            <Link href="/billing" className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Receipt size={16} className="text-slate-400" /> Start a new counter bill
              </span>
              <ArrowRight size={16} className="text-slate-400" />
            </Link>
          </div>
        </div>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Recent Transactions</h2>
          <Link href="/closing" className="flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
            Daily closing report <ArrowRight size={14} />
          </Link>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No transactions yet — the first bill of the day will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-semibold">Time</th>
                  <th className="px-5 py-2.5 font-semibold">Customer</th>
                  <th className="px-5 py-2.5 font-semibold">Items</th>
                  <th className="px-5 py-2.5 font-semibold">Type</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{formatDateTime(t.createdAt)}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-800">
                      {t.type === "PAYMENT" ? `Payment — ${t.customer?.name ?? "Unknown"}` : t.customer?.name ?? "Cash Walk-in"}
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-2.5 text-slate-500">
                      {t.type === "PAYMENT"
                        ? "Khata settlement"
                        : t.items.map((i) => i.product.name).join(", ") || "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={t.type === "WHOLESALE" ? "badge-blue" : t.type === "PAYMENT" ? "badge-emerald" : "badge-slate"}>
                        {t.type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-bold text-slate-900">{formatNPR(t.totalAmount)}</td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={t.paymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
