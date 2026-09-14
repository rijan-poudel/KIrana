/** Small shared helpers used by pages, client components and server actions. */

export { cn } from "cn";

/** Local midnight of today — the boundary for all "today" summaries. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local midnight of the given calendar date ("2026-09-13" or a Date). */
export function startOfDay(input: Date | string): Date {
  if (typeof input === "string") {
    const [y, m, d] = input.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    return startOfToday();
  }
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "2026-09-13" — the query-param form of a date. */
export function toDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Human-readable message for any thrown error (Prisma or otherwise). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong. Please try again.";
}
