/**
 * One-time cleanup: removes GUI-test residue (test transactions, the test
 * customer, and the test delivery log) so the shop starts with a clean khata.
 * Seeded products are kept. Run: node scripts/clean-test-data.js
 */
const { PrismaClient } = require("/home/rizx/Projects/Milan Grocery/node_modules/@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.deleteMany({});
  const customers = await prisma.customer.deleteMany({});
  const deliveries = await prisma.deliveryLog.deleteMany({});
  console.log(`Removed: ${txs.count} transactions, ${customers.count} customers, ${deliveries.count} delivery logs.`);
  console.log(`Products kept: ${await prisma.product.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
