/**
 * Deterministic formatting helpers. Deliberately implemented by hand (no
 * Intl/locale calls) so server-rendered markup and client hydration always
 * produce byte-identical output, with zero external dependencies.
 */

/** Round to 2 decimal places without floating point drift. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** "Rs. 1,234.50" — Nepali rupees with comma grouping. */
export function formatNPR(value: number): string {
  const sign = value < 0 ? "-" : "";
  const [int, dec] = Math.abs(round2(value)).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}Rs. ${grouped}.${dec}`;
}

/** "1,500" / "2.5" — grouped quantity, decimals only when needed. */
export function formatQuantity(value: number): string {
  const [int, dec] = String(round2(value)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `${grouped}.${dec}` : grouped;
}

/** "37%" — whole-percent margin/share, no floating-point drift. */
export function formatPercentage(value: number): string {
  return `${Math.round((value + Number.EPSILON) * 100)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Sep 2026" */
export function formatDate(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "8:05 PM" */
export function formatTime(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  let hours = d.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} ${ampm}`;
}

/** "12 Sep 2026, 8:05 PM" */
export function formatDateTime(input: Date | string): string {
  return `${formatDate(input)}, ${formatTime(input)}`;
}

/** "1.2 MB" / "840 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
