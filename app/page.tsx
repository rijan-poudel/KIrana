import prisma from "@/lib/prisma";
import CounterClient from "./counter-client";
import type { CustomerOption, ProductCardData } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Counter" };

export default async function CounterPage() {
  const [products, customers, topSellers] = await Promise.all([
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
  ]);

  const productData: ProductCardData[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    barcode: p.barcode,
    retailPrice: p.retailPrice,
    wholesalePrice: p.wholesalePrice,
    stockQuantity: p.stockQuantity,
    baseUnit: p.baseUnit,
    lowStockAt: p.lowStockAt,
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

  return <CounterClient products={productData} customers={customerData} quickIds={quickIds} />;
}
