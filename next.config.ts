import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma must stay external so its query engine binary is loaded from
  // node_modules instead of being bundled — required for reliable offline runs.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
