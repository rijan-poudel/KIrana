import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma must stay external so its query engine binary is loaded from
  // node_modules instead of being bundled — required for reliable offline runs.
  serverExternalPackages: ["@prisma/client"],
  // Separate build outputs: `next build`/`next start` use .next-prod while
  // `next dev` uses .next-dev. Sharing one folder let a production build leave
  // stale chunks behind that made every dev page load unstyled and dead
  // (hydration 404s) until the folder was deleted by hand.
  distDir: process.env.NODE_ENV === "production" ? ".next-prod" : ".next-dev",
};

export default nextConfig;
