import prisma from "@/lib/prisma";
import type { ProductCardData } from "@/lib/types";
import InventoryClient from "./inventory-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stock / Inventory" };

export default async function InventoryPage() {
  const products = await prisma.product.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });

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

  return <InventoryClient products={productCards} />;
}
