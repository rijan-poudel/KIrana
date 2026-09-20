import { APP_NAME } from "@/lib/constants";
import { formatDate, formatNPR, formatQuantity, round2 } from "@/lib/format";
import type { CustomerOption, HistoryEntry } from "@/lib/types";

/** Nepal country code prefix for wa.me deep links. */
const CC = "977";

/**
 * Normalize a Nepali mobile number for wa.me: strip everything but digits,
 * drop a leading 0, and prefix the country code for 10-digit numbers.
 * Returns null when nothing usable remains.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = CC + digits;
  return digits.length >= 10 && digits.startsWith(CC) ? digits : null;
}

/** WhatsApp deep link with a pre-filled message (the user sends it themselves). */
export function whatsappLink(phoneRaw: string | null | undefined, text: string): string | null {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** Short nudge for the customer card menu — balance only, no full ledger. */
export function buildReminderText(customer: CustomerOption): string {
  return [
    `Namaste ${customer.name}!`,
    "",
    `This is a friendly reminder from ${APP_NAME}, Gaindakot.`,
    `Your khata (udharo) balance is: ${formatNPR(Math.max(customer.currentBalance, 0))}`,
    customer.currentBalance <= 0
      ? "Your khata is clear — dhanyabad!"
      : "Please clear it when convenient. Dhanyabad!",
  ].join("\n");
}

/**
 * Plain-text khata statement — for WhatsApp, clipboard or printing. Reads like
 * the paper notebook the shop replaced: entries newest first, then totals.
 */
export function buildStatementText(customer: CustomerOption, entries: HistoryEntry[]): string {
  const sales = entries.filter((e) => e.type !== "PAYMENT");
  const billed = round2(sales.reduce((sum, e) => sum + e.totalAmount, 0));
  const paid = round2(entries.reduce((sum, e) => sum + e.paidAmount, 0));
  const outstanding = round2(Math.max(customer.currentBalance, 0));

  const lines: string[] = [
    `${APP_NAME} — Gaindakot`,
    `Khata statement: ${customer.name}`,
    customer.address ? `Ward/Area: ${customer.address}` : "",
    `As of ${formatDate(new Date())}`,
    "------------------------------",
  ].filter((l) => l !== "");

  if (entries.length === 0) {
    lines.push("No transactions on this khata yet.");
  }
  for (const entry of entries.slice(0, 30)) {
    const when = formatDate(entry.createdAt);
    if (entry.type === "PAYMENT") {
      lines.push(`${when} — PAYMENT received ${formatNPR(entry.totalAmount)}`);
    } else {
      const items = entry.items
        .map((i) => `${formatQuantity(i.quantity)} ${i.unitName || i.baseUnit} ${i.productName}`.trim())
        .slice(0, 4)
        .join(", ");
      const due = round2(entry.totalAmount - entry.paidAmount);
      lines.push(
        `${when} — ${items} — bill ${formatNPR(entry.totalAmount)}, paid ${formatNPR(entry.paidAmount)}` +
          (due > 0 ? ` (due ${formatNPR(due)})` : ""),
      );
    }
  }
  if (entries.length > 30) {
    lines.push(`… and ${entries.length - 30} older entries (ask at the counter for the full history).`);
  }
  lines.push(
    "------------------------------",
    `Total billed: ${formatNPR(billed)}`,
    `Total paid: ${formatNPR(paid)}`,
    `OUTSTANDING: ${formatNPR(outstanding)}`,
    "",
    outgoingLine(outstanding),
  );
  return lines.join("\n");
}

function outgoingLine(outstanding: number): string {
  if (outstanding <= 0) return "Your khata is fully clear. Dhanyabad! 🙏";
  return "Please clear this balance when convenient. Dhanyabad! 🙏";
}
