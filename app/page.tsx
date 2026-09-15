import prisma from "@/lib/prisma";
import CounterClient from "./counter-client";
import type { CustomerOption, ProductCardData } from "@/lib/types";
import { round2 } from "@/lib/format";
import { startOfToday } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Counter" };

export default async function CounterPage() {
  const dayStart = startOfToday();
  const [products, customers, topSellers, todaySales, todayPayments] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { units: { orderBy: { factor: "desc" } } },
    }),
    prisma.customer.findMany({ orderBy: [{ currentBalance: "desc" }, { name: "asc" }] }),
    prisma.transactionItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 8,
    }),
    prisma.transaction.aggregate({
      where: { createdAt: { gte: dayStart }, type: { in: ["RETAIL", "WHOLESALE"] } },
      _count: true,
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.transaction.aggregate({
      where: { createdAt: { gte: dayStart }, type: "PAYMENT" },
      _count: true,
      _sum: { totalAmount: true },
    }),
  ]);

  const todayStats = {
    bills: todaySales._count,
    salesValue: round2(todaySales._sum.totalAmount ?? 0),
    // Cash that actually lands in the drawer: bills paid now + khata settlements.
    cashCollected: round2((todaySales._sum.paidAmount ?? 0) + (todayPayments._sum.totalAmount ?? 0)),
  };

  const productData: ProductCardData[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    barcode: p.barcode,
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

  const customerData: CustomerOption[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    currentBalance: c.currentBalance,
    isFavorite: c.isFavorite,
  }));

  const quickIds = topSellers.map((t) => t.productId);

  return <CounterClient products={productData} customers={customerData} quickIds={quickIds} todayStats={todayStats} />;
}
