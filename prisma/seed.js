/**
 * Seeds the Milan Grocery database with the everyday staple products stocked at
 * the counter. Idempotent: if any products already exist, it does nothing, so
 * it is always safe to run (`npm run db:seed`).
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/** name, category, barcode, retail (per base unit), wholesale (per base unit), stock, baseUnit, sell units */
const products = [
  // Staples
  { name: "Rice (Mansuli)", category: "Staples", barcode: null, retailPrice: 92, wholesalePrice: 85, stockQuantity: 150, baseUnit: "kg", units: [{ name: "Bora (25kg)", factor: 25 }] },
  { name: "Rice (Jeera Masino)", category: "Staples", barcode: null, retailPrice: 130, wholesalePrice: 122, stockQuantity: 60, baseUnit: "kg", units: [{ name: "Bora (25kg)", factor: 25 }] },
  { name: "Sugar (Sakhar)", category: "Staples", barcode: null, retailPrice: 95, wholesalePrice: 88, stockQuantity: 70, baseUnit: "kg", units: [{ name: "Bora (50kg)", factor: 50 }] },
  { name: "Atta (Flour)", category: "Staples", barcode: null, retailPrice: 75, wholesalePrice: 68, stockQuantity: 80, baseUnit: "kg", units: [{ name: "Bora (25kg)", factor: 25 }] },
  { name: "Musuro Dal (Red Lentil)", category: "Staples", barcode: null, retailPrice: 165, wholesalePrice: 155, stockQuantity: 40, baseUnit: "kg", units: [] },
  { name: "Rahar Dal", category: "Staples", barcode: null, retailPrice: 190, wholesalePrice: 180, stockQuantity: 25, baseUnit: "kg", units: [] },
  { name: "Salt (1kg Packet)", category: "Staples", barcode: "9800000000017", retailPrice: 40, wholesalePrice: 34, stockQuantity: 60, baseUnit: "pcs", units: [{ name: "Carton", factor: 24 }] },
  { name: "Puffed Rice (Chiura)", category: "Staples", barcode: null, retailPrice: 120, wholesalePrice: 112, stockQuantity: 35, baseUnit: "kg", units: [] },
  // Oil & Ghee
  { name: "Mustard Oil", category: "Oil & Ghee", barcode: null, retailPrice: 285, wholesalePrice: 272, stockQuantity: 45, baseUnit: "liter", units: [{ name: "Tin (15L)", factor: 15 }] },
  { name: "Refined Oil (Rara)", category: "Oil & Ghee", barcode: "9800000000024", retailPrice: 240, wholesalePrice: 230, stockQuantity: 30, baseUnit: "liter", units: [{ name: "Carton (12)", factor: 12 }] },
  // Snacks
  { name: "Chiyapati", category: "Snacks", barcode: null, retailPrice: 25, wholesalePrice: 20, stockQuantity: 50, baseUnit: "pcs", units: [] },
  { name: "Parle-G Biscuit", category: "Snacks", barcode: null, retailPrice: 10, wholesalePrice: 8, stockQuantity: 100, baseUnit: "pcs", units: [{ name: "Carton", factor: 100 }] },
  { name: "Wai Wai Noodles", category: "Snacks", barcode: "9800000000031", retailPrice: 20, wholesalePrice: 18, stockQuantity: 90, baseUnit: "pcs", units: [{ name: "Pack", factor: 12 }, { name: "Carton", factor: 30 }] },
  // Dairy
  { name: "Milk (Fresh)", category: "Dairy", barcode: null, retailPrice: 68, wholesalePrice: 64, stockQuantity: 20, baseUnit: "liter", units: [] },
  { name: "Eggs", category: "Dairy", barcode: null, retailPrice: 18, wholesalePrice: 16, stockQuantity: 60, baseUnit: "pcs", units: [{ name: "Dozen", factor: 12 }] },
  // Spices
  { name: "Turmeric Powder (Besar)", category: "Spices", barcode: null, retailPrice: 45, wholesalePrice: 38, stockQuantity: 30, baseUnit: "pcs", units: [] },
  { name: "Tea Powder (Red Label 250g)", category: "Spices", barcode: null, retailPrice: 170, wholesalePrice: 160, stockQuantity: 25, baseUnit: "pcs", units: [] },
  // Household
  { name: "Lifebuoy Soap", category: "Household", barcode: "9800000000048", retailPrice: 65, wholesalePrice: 58, stockQuantity: 40, baseUnit: "pcs", units: [{ name: "Dozen", factor: 12 }] },
  { name: "Surf Excel (500g)", category: "Household", barcode: null, retailPrice: 120, wholesalePrice: 110, stockQuantity: 20, baseUnit: "pcs", units: [] },
  { name: "Candle", category: "Household", barcode: null, retailPrice: 15, wholesalePrice: 12, stockQuantity: 25, baseUnit: "pcs", units: [] },
];

async function main() {
  const existing = await prisma.product.count();
  if (existing > 0) {
    console.log(`Products already exist in the database (${existing} found) — seed skipped.`);
    return;
  }
  for (const { units, ...product } of products) {
    await prisma.product.create({
      data: {
        ...product,
        baseUnit: product.baseUnit,
        lowStockAt: 10,
        stockQuantity: product.stockQuantity,
        units: { create: units },
      },
    });
  }
  console.log(`Seeded ${products.length} staple products for the Milan Grocery counter.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
