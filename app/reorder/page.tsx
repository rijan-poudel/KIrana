import prisma from "@/lib/prisma";
import ReorderClient from "./reorder-client";
import type { ProductCardData } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reorder Sheet" };

const LOOKBACK_DAYS = 30;
const LEAD_TIME_DAYS = 7;

export default async function ReorderPage() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  const [products, sales] = await Promise.all([
    prisma.product.findMany({
      where: { stockQuantity: { lte: prisma.product.fields.lowStockAt } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { units: { orderBy: { factor: "desc" } } },
    }),
    prisma.transactionItem.findMany({
      where: {
        transaction: {
          createdAt: { gte: cutoff },
          type: { in: ["RETAIL", "WHOLESALE"] },
        },
      },
      select: { productId: true, quantity: true },
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
    sellAs: p.sellAs as ProductCardData["sellAs"],
    stockQuantity: p.stockQuantity,
    baseUnit: p.baseUnit,
    lowStockAt: p.lowStockAt,
    manufacturingDate: p.manufacturingDate ? p.manufacturingDate.toISOString() : null,
    expiryDate: p.expiryDate ? p.expiryDate.toISOString() : null,
    units: p.units.map((u) => ({ id: u.id, name: u.name, factor: u.factor })),
  }));

  const velocity = new Map<string, number>();
  for (const item of sales) {
    velocity.set(item.productId, (velocity.get(item.productId) ?? 0) + item.quantity);
  }

  return <ReorderClient products={productData} velocity={velocity} />;
}