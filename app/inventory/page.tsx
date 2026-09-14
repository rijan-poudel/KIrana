import prisma from "@/lib/prisma";
import InventoryClient from "./inventory-client";
import type { ProductCardData, StockMoveData } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stock" };

export default async function InventoryPage() {
  const [products, moves] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { units: { orderBy: { factor: "desc" } } },
    }),
    prisma.stockMove.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { product: { select: { name: true, baseUnit: true } } },
    }),
  ]);

  const productData: ProductCardData[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    barcode: p.barcode,
    retailPrice: p.retailPrice,
    wholesalePrice: p.wholesalePrice,
    costPrice: p.costPrice,
    stockQuantity: p.stockQuantity,
    baseUnit: p.baseUnit,
    lowStockAt: p.lowStockAt,
    units: p.units.map((u) => ({ id: u.id, name: u.name, factor: u.factor })),
  }));

  const moveData: StockMoveData[] = moves.map((m) => ({
    id: m.id,
    productName: m.product.name,
    baseUnit: m.product.baseUnit,
    delta: m.delta,
    reason: m.reason,
    note: m.note,
    unitName: m.unitName,
    quantity: m.quantity,
    createdAt: m.createdAt.toISOString(),
  }));

  return <InventoryClient products={productData} moves={moveData} />;
}
