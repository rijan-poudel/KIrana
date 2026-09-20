"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";
import { formatDate, formatNPR } from "@/lib/format";
import type { RangeDayRow } from "@/lib/types";

export type RangeSummaryData = {
  label: string; // e.g. "This month (1–20 September 2026)"
  bills: number;
  salesTotal: number;
  discountsGiven: number;
  cashFromSales: number;
  creditPayments: number;
  udharoAdded: number;
  totalCash: number;
  profitToday: number | null;
  purchasesTotal: number | null; // vendor bills recorded in the range, if any
  outstandingTotal: number;
  days: RangeDayRow[];
};

/**
 * "Print range summary" — the weekly/monthly closing sheet: range totals, the
 * day-by-day breakdown, and drawer-signature lines. Same print mechanism as
 * the day summary (portalled #print-sheet + body.print-sheet class).
 */
export default function RangeSummaryPrint({ summary }: { summary: RangeSummaryData }) {
  const [printing, setPrinting] = useState(false);
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("print-sheet");
    function finish() {
      setPrinting(false);
      if (cleanupTimer.current) {
        clearTimeout(cleanupTimer.current);
        cleanupTimer.current = null;
      }
    }
    window.addEventListener("afterprint", finish);
    // Some browsers never fire afterprint — always unmount eventually.
    cleanupTimer.current = setTimeout(finish, 5000);
    const raf = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("print-sheet");
      window.removeEventListener("afterprint", finish);
      if (cleanupTimer.current) clearTimeout(cleanupTimer.current);
    };
  }, [printing]);

  return (
    <>
      <Button variant="outline" onClick={() => setPrinting(true)} aria-label="Print the range summary">
        <Printer /> Print range summary
      </Button>

      {printing &&
        createPortal(
          <div id="print-sheet">
            <RangeSummarySheet summary={summary} />
          </div>,
          document.body,
        )}
    </>
  );
}

function RangeSummarySheet({ summary }: { summary: RangeSummaryData }) {
  const totals: [string, string][] = [
    ["Sales (after bhaansi)", formatNPR(summary.salesTotal)],
    ["Bhaansi (discounts) given", formatNPR(summary.discountsGiven)],
    ["Cash from sales", formatNPR(summary.cashFromSales)],
    ["Credit payments received", formatNPR(summary.creditPayments)],
    ["Total cash in hand", formatNPR(summary.totalCash)],
    ["Udharo added", formatNPR(summary.udharoAdded)],
  ];
  if (summary.purchasesTotal !== null) {
    totals.push(["Purchases recorded", formatNPR(summary.purchasesTotal)]);
  }

  return (
    <div className="font-sans text-black">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{APP_NAME}</h1>
        <p className="text-sm">{APP_LOCATION}</p>
      </div>
      <p className="mt-1 text-lg font-bold">Range Summary — {summary.label}</p>
      <p className="text-xs">
        {summary.bills} bill{summary.bills === 1 ? "" : "s"}
        {summary.profitToday !== null ? ` • profit after cost ≈ ${formatNPR(summary.profitToday)}` : ""} • printed{" "}
        {formatDate(new Date())}
      </p>

      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-1 text-left">Date</th>
            <th className="py-1 text-right">Bills</th>
            <th className="py-1 text-right">Sales</th>
            <th className="py-1 text-right">Bhaansi</th>
            <th className="py-1 text-right">Cash in</th>
            <th className="py-1 text-right">Udharo added</th>
            <th className="py-1 text-right">Credit payments</th>
          </tr>
        </thead>
        <tbody>
          {summary.days.map((day) => (
            <tr key={day.dateKey} className="border-b border-black/20">
              <td className="py-1 whitespace-nowrap">{formatDate(day.dateKey + "T00:00:00")}</td>
              <td className="py-1 text-right">{day.bills}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatNPR(day.salesTotal)}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatNPR(day.discounts)}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatNPR(day.cash)}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatNPR(day.udharoAdded)}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatNPR(day.creditPayments)}</td>
            </tr>
          ))}
          {summary.days.length === 0 && (
            <tr>
              <td colSpan={7} className="py-2 text-center text-black/60">
                No transactions recorded in this range.
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

      <div className="mt-8 flex gap-8 text-xs">
        <p className="flex-1 border-t border-black pt-1">Prepared by</p>
        <p className="flex-1 border-t border-black pt-1">Checked by</p>
        <p className="flex-1 border-t border-black pt-1">Date</p>
      </div>
    </div>
  );
}
