"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";
import { formatDate, formatNPR, formatTime } from "@/lib/format";
import type { ReportRowData } from "@/lib/types";

export type DaySummaryData = {
  dateKey: string;
  weekday: string;
  bills: number;
  salesTotal: number;
  discountsGiven: number;
  cashFromSales: number;
  creditPayments: number;
  udharoAdded: number;
  totalCash: number;
  profitToday: number | null;
  outstandingTotal: number;
};

/**
 * "Print day summary" — the closing-time sheet for the drawer reconciliation
 * file: the day's totals plus every transaction, on plain A4.
 *
 * While printing, the sheet is portalled to <body> (marked with a
 * `print-day-summary` body class) so the print CSS can hide the whole app with
 * display:none and let the sheet flow across pages normally. It never overlaps
 * a receipt being re-printed from the transactions dialog (which owns the
 * separate #receipt-print flow).
 */
export default function DaySummaryPrint({ summary, rows }: { summary: DaySummaryData; rows: ReportRowData[] }) {
  const [printing, setPrinting] = useState(false);
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("print-day-summary");
    function finish() {
      setPrinting(false);
      if (cleanupTimer.current) {
        clearTimeout(cleanupTimer.current);
        cleanupTimer.current = null;
      }
    }
    window.addEventListener("afterprint", finish);
    // Some browsers never fire afterprint (or the pane stubs window.print) —
    // always unmount eventually so the sheet can't linger in the DOM.
    cleanupTimer.current = setTimeout(finish, 5000);
    // Let the sheet paint once before the (blocking) print dialog opens.
    const raf = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("print-day-summary");
      window.removeEventListener("afterprint", finish);
      if (cleanupTimer.current) clearTimeout(cleanupTimer.current);
    };
  }, [printing]);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setPrinting(true)}
        aria-label={`Print the day summary for ${formatDate(summary.dateKey + "T00:00:00")}`}
      >
        <Printer /> Print day summary
      </Button>

      {printing &&
        createPortal(
          <div id="day-summary-print">
            <DaySummarySheet summary={summary} rows={rows} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** The printable sheet itself — plain black on white, A4. */
function DaySummarySheet({ summary, rows }: { summary: DaySummaryData; rows: ReportRowData[] }) {
  const totals: [string, string][] = [
    ["Cash from sales", formatNPR(summary.cashFromSales)],
    ["Credit payments received", formatNPR(summary.creditPayments)],
    ["Total cash in hand", formatNPR(summary.totalCash)],
    ["Udharo added today", formatNPR(summary.udharoAdded)],
    ["Bhaansi (discounts) given", formatNPR(summary.discountsGiven)],
  ];

  return (
    <div className="font-sans text-black">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{APP_NAME}</h1>
        <p className="text-sm">{APP_LOCATION}</p>
      </div>
      <p className="mt-1 text-lg font-bold">
        Day Summary — {summary.weekday}, {formatDate(summary.dateKey + "T00:00:00")}
      </p>
      <p className="text-xs">
        {summary.bills} bill{summary.bills === 1 ? "" : "s"} • sales worth {formatNPR(summary.salesTotal)}
        {summary.profitToday !== null ? ` • profit after cost ≈ ${formatNPR(summary.profitToday)}` : ""} • printed{" "}
        {formatTime(new Date())}
      </p>

      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-1 text-left">Time</th>
            <th className="py-1 text-left">Type</th>
            <th className="py-1 text-left">Customer</th>
            <th className="py-1 text-left">Items</th>
            <th className="py-1 text-right">Total</th>
            <th className="py-1 text-right">Paid</th>
            <th className="py-1 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-black/20 align-top">
              <td className="py-1 whitespace-nowrap">{formatTime(row.time)}</td>
              <td className="py-1">{row.typeLabel}</td>
              <td className="py-1">{row.customerName ?? "Cash walk-in"}</td>
              <td className="py-1">
                {row.items
                  .map((i) => `${Number.isInteger(i.quantity) ? i.quantity : i.quantity.toFixed(2)} ${i.name}`)
                  .join(", ") || "—"}
              </td>
              <td className="py-1 text-right whitespace-nowrap">{formatNPR(row.totalAmount)}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatNPR(row.paidAmount)}</td>
              <td className="py-1">{row.paymentStatus}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-2 text-center text-black/60">
                No transactions recorded this day.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="mt-4 w-1/2 border-collapse text-sm">
        <tbody>
          {totals.map(([label, value]) => (
            <tr key={label} className="border-b border-black/20">
              <td className="py-1 font-semibold">{label}</td>
              <td className="py-1 text-right whitespace-nowrap">{value}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-black">
            <td className="py-1 font-bold">Total khata outstanding (all days)</td>
            <td className="py-1 text-right font-bold whitespace-nowrap">{formatNPR(summary.outstandingTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* The reconciliation ritual: count the drawer, sign, file it. */}
      <div className="mt-8 flex gap-8 text-xs">
        <p className="flex-1 border-t border-black pt-1">Cash counted in drawer</p>
        <p className="flex-1 border-t border-black pt-1">Difference (if any)</p>
        <p className="flex-1 border-t border-black pt-1">Signature</p>
      </div>
    </div>
  );
}
