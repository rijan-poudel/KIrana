import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in development so the SQLite
// connection pool is never exhausted.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
