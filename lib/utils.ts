/** Small server-side helpers shared by pages and server actions. */

/** Local midnight of today — the boundary for all "today" summaries. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Human-readable message for any thrown error (Prisma or otherwise). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong. Please try again.";
}
