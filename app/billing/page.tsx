import prisma from "@/lib/prisma";
import type { CustomerOption, ProductCardData } from "@/lib/types";
import BillingClient from "./billing-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Counter Billing" };

export default async function BillingPage() {
  const [products, customers] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
  ]);

  const productCards: ProductCardData[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    barcode: p.barcode,
    retailPrice: p.retailPrice,
    wholesalePrice: p.wholesalePrice,
    stockQuantity: p.stockQuantity,
    unit: p.unit,
  }));

  const customerOptions: CustomerOption[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    currentBalance: c.currentBalance,
  }));

  return <BillingClient products={productCards} customers={customerOptions} />;
}
