import prisma from "@/lib/prisma";
import { getDeliveries } from "@/actions/shop-actions";
import type { DeliveryLogData, CustomerOption, ProductCardData } from "@/lib/types";
import DeliveryClient from "./delivery-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Delivery Tracker" };

export default async function DeliveryPage() {
  const [deliveryResult, customersRaw, productsRaw] = await Promise.all([
    getDeliveries(),
    prisma.customer.findMany({ orderBy: [{ currentBalance: "desc" }, { name: "asc" }] }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: { units: true },
    }),
  ]);

  const logs: DeliveryLogData[] = deliveryResult.ok ? deliveryResult.data : [];

  const customers: CustomerOption[] = customersRaw.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    currentBalance: c.currentBalance,
    isFavorite: c.isFavorite,
  }));

  const products: ProductCardData[] = productsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    barcode: p.barcode,
    retailPrice: p.retailPrice,
    wholesalePrice: p.wholesalePrice,
    costPrice: p.costPrice,
    sellAs: p.sellAs as "RETAIL" | "WHOLESALE" | "BOTH",
    stockQuantity: p.stockQuantity,
    baseUnit: p.baseUnit,
    lowStockAt: p.lowStockAt,
    manufacturingDate: p.manufacturingDate?.toISOString() ?? null,
    expiryDate: p.expiryDate?.toISOString() ?? null,
    units: p.units.map((u) => ({ id: u.id, name: u.name, factor: u.factor })),
  }));

  return <DeliveryClient logs={logs} customers={customers} products={products} />;
}
