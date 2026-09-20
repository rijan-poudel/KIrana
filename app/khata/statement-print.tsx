"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";
import { formatDate, formatNPR, formatQuantity, round2 } from "@/lib/format";
import type { CustomerOption, HistoryEntry } from "@/lib/types";

/**
 * "Print statement" — an A4 khata statement for one customer: header, balance,
 * every entry, totals, signature lines. Same print mechanism as the report
 * sheets (portalled #print-sheet + body.print-sheet class).
 */
export default function StatementPrint({ customer, entries }: { customer: CustomerOption; entries: HistoryEntry[] }) {
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
    cleanupTimer.current = setTimeout(finish, 5000);
    const raf = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("print-sheet");
      window.removeEventListener("afterprint", finish);
      if (cleanupTimer.current) clearTimeout(cleanupTimer.current);
    };
  }, [printing]);

  const sales = entries.filter((e) => e.type !== "PAYMENT");
  const billed = round2(sales.reduce((sum, e) => sum + e.totalAmount, 0));
  const paid = round2(entries.reduce((sum, e) => sum + e.paidAmount, 0));

  return (
    <>
      <Button variant="outline" className="flex-1" onClick={() => setPrinting(true)}>
        <Printer /> Print
      </Button>

      {printing &&
        createPortal(
          <div id="print-sheet">
            <StatementSheet customer={customer} entries={entries} billed={billed} paid={paid} />
          </div>,
          document.body,
        )}
    </>
  );
}

function StatementSheet({
  customer,
  entries,
  billed,
  paid,
}: {
  customer: CustomerOption;
  entries: HistoryEntry[];
  billed: number;
  paid: number;
}) {
  const outstanding = round2(Math.max(customer.currentBalance, 0));
  return (
    <div className="font-sans text-black">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{APP_NAME}</h1>
        <p className="text-sm">{APP_LOCATION}</p>
      </div>
      <p className="mt-1 text-lg font-bold">Khata Statement — {customer.name}</p>
      <p className="text-xs">
        {customer.phone ? `Phone ${customer.phone} • ` : ""}
        {customer.address ? `${customer.address} • ` : ""}as of {formatDate(new Date())}
      </p>

      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-1 text-left">Date</th>
            <th className="py-1 text-left">Details</th>
            <th className="py-1 text-right">Bill</th>
            <th className="py-1 text-right">Paid</th>
            <th className="py-1 text-right">Due</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const when = formatDate(entry.createdAt);
            if (entry.type === "PAYMENT") {
              return (
                <tr key={entry.id} className="border-b border-black/20">
                  <td className="py-1 whitespace-nowrap">{when}</td>
                  <td className="py-1 font-semibold">Payment received — thank you</td>
                  <td className="py-1 text-right">—</td>
                  <td className="py-1 text-right whitespace-nowrap">{formatNPR(entry.totalAmount)}</td>
                  <td className="py-1 text-right">—</td>
                </tr>
              );
            }
            const items = entry.items
              .map((i) => `${formatQuantity(i.quantity)} ${i.unitName || i.baseUnit} ${i.productName}`.trim())
              .join(", ");
            const due = round2(entry.totalAmount - entry.paidAmount);
            return (
              <tr key={entry.id} className="border-b border-black/20 align-top">
                <td className="py-1 whitespace-nowrap">{when}</td>
                <td className="py-1">{items}</td>
                <td className="py-1 text-right whitespace-nowrap">{formatNPR(entry.totalAmount)}</td>
                <td className="py-1 text-right whitespace-nowrap">{formatNPR(entry.paidAmount)}</td>
                <td className={`py-1 text-right whitespace-nowrap ${due > 0 ? "font-bold" : ""}`}>
                  {due > 0 ? formatNPR(due) : "—"}
                </td>
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-center text-black/60">
                No transactions on this khata yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="mt-4 w-1/2 border-collapse text-sm">
        <tbody>
          <tr className="border-b border-black/20">
            <td className="py-1 font-semibold">Total billed</td>
            <td className="py-1 text-right whitespace-nowrap">{formatNPR(billed)}</td>
          </tr>
          <tr className="border-b border-black/20">
            <td className="py-1 font-semibold">Total paid</td>
            <td className="py-1 text-right whitespace-nowrap">{formatNPR(paid)}</td>
          </tr>
          <tr className="border-t-2 border-black">
            <td className="py-1 font-bold">Outstanding balance</td>
            <td className="py-1 text-right font-bold whitespace-nowrap">{formatNPR(outstanding)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8 flex gap-8 text-xs">
        <p className="flex-1 border-t border-black pt-1">Customer signature</p>
        <p className="flex-1 border-t border-black pt-1">For {APP_NAME}</p>
      </div>
    </div>
  );
}
