/**
 * Seeds the Milan Grocery database with the everyday staple products stocked at
 * the counter. Idempotent: if any products already exist, it does nothing, so
 * it is always safe to run (`npm run db:seed`).
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const products = [
  // Staples
  { name: "Rice (Mansuli)", category: "Staples", barcode: null, retailPrice: 92, wholesalePrice: 85, stockQuantity: 150, unit: "kg" },
  { name: "Rice (Jeera Masino)", category: "Staples", barcode: null, retailPrice: 130, wholesalePrice: 122, stockQuantity: 60, unit: "kg" },
  { name: "Sugar (Sakhar)", category: "Staples", barcode: null, retailPrice: 95, wholesalePrice: 88, stockQuantity: 70, unit: "kg" },
  { name: "Atta (Flour)", category: "Staples", barcode: null, retailPrice: 75, wholesalePrice: 68, stockQuantity: 80, unit: "kg" },
  { name: "Musuro Dal (Red Lentil)", category: "Staples", barcode: null, retailPrice: 165, wholesalePrice: 155, stockQuantity: 40, unit: "kg" },
  { name: "Rahar Dal", category: "Staples", barcode: null, retailPrice: 190, wholesalePrice: 180, stockQuantity: 25, unit: "kg" },
  { name: "Salt (1kg Packet)", category: "Staples", barcode: "9800000000017", retailPrice: 40, wholesalePrice: 34, stockQuantity: 60, unit: "packet" },
  { name: "Puffed Rice (Chiura)", category: "Staples", barcode: null, retailPrice: 120, wholesalePrice: 112, stockQuantity: 35, unit: "kg" },
  // Oil & Ghee
  { name: "Mustard Oil", category: "Oil & Ghee", barcode: null, retailPrice: 285, wholesalePrice: 272, stockQuantity: 45, unit: "liter" },
  { name: "Refined Oil (Rara)", category: "Oil & Ghee", barcode: "9800000000024", retailPrice: 240, wholesalePrice: 230, stockQuantity: 30, unit: "liter" },
  // Snacks
  { name: "Chiyapati", category: "Snacks", barcode: null, retailPrice: 25, wholesalePrice: 20, stockQuantity: 50, unit: "packet" },
  { name: "Parle-G Biscuit", category: "Snacks", barcode: null, retailPrice: 10, wholesalePrice: 8, stockQuantity: 100, unit: "pcs" },
  { name: "Wai Wai Noodles", category: "Snacks", barcode: "9800000000031", retailPrice: 20, wholesalePrice: 18, stockQuantity: 90, unit: "pcs" },
  // Dairy
  { name: "Milk (Fresh)", category: "Dairy", barcode: null, retailPrice: 68, wholesalePrice: 64, stockQuantity: 20, unit: "liter" },
  { name: "Eggs", category: "Dairy", barcode: null, retailPrice: 18, wholesalePrice: 16, stockQuantity: 60, unit: "pcs" },
  // Spices
  { name: "Turmeric Powder (Besar)", category: "Spices", barcode: null, retailPrice: 45, wholesalePrice: 38, stockQuantity: 30, unit: "packet" },
  { name: "Tea Powder (Red Label 250g)", category: "Spices", barcode: null, retailPrice: 170, wholesalePrice: 160, stockQuantity: 25, unit: "packet" },
  // Household
  { name: "Lifebuoy Soap", category: "Household", barcode: "9800000000048", retailPrice: 65, wholesalePrice: 58, stockQuantity: 40, unit: "pcs" },
  { name: "Surf Excel (500g)", category: "Household", barcode: null, retailPrice: 120, wholesalePrice: 110, stockQuantity: 20, unit: "packet" },
  { name: "Candle", category: "Household", barcode: null, retailPrice: 15, wholesalePrice: 12, stockQuantity: 25, unit: "pcs" },
];

async function main() {
  const existing = await prisma.product.count();
  if (existing > 0) {
    console.log(`Products already exist in the database (${existing} found) — seed skipped.`);
    return;
  }
  for (const product of products) {
    await prisma.product.create({ data: product });
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
