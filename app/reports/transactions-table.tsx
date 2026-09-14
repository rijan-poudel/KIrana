"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MoreHorizontal, Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { voidTransaction } from "@/actions/shop-actions";
import { formatNPR, formatQuantity, formatTime } from "@/lib/format";
import type { ReportRowData } from "@/lib/types";
import Receipt from "../receipt";

/**
 * The day's transactions with per-row fixes: print the receipt again, or void
 * a wrongly-entered bill (restocks items and reverses the khata automatically).
 */
export default function TransactionsTable({ rows }: { rows: ReportRowData[] }) {
  const router = useRouter();
  const [voidTarget, setVoidTarget] = useState<ReportRowData | null>(null);
  const [printTarget, setPrintTarget] = useState<ReportRowData | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleVoid() {
    if (!voidTarget) return;
    setBusy(true);
    const response = await voidTransaction(voidTarget.id);
    setBusy(false);
    if (response.ok) {
      toast.success(`Bill removed — stock and khata were rolled back.`);
      setVoidTarget(null);
      router.refresh();
    } else {
      toast.error(response.error);
    }
  }

  if (rows.length === 0) {
    return <p className="px-5 py-8 text-sm text-muted-foreground">No transactions on this day yet.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-semibold">Time</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Customer</th>
              <th className="px-4 py-2.5 font-semibold">Details</th>
              <th className="px-4 py-2.5 text-right font-semibold">Total</th>
              <th className="hidden px-4 py-2.5 text-right font-semibold md:table-cell">Paid</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatTime(row.time)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={row.typeLabel === "PAYMENT" ? "success" : row.typeLabel === "WHOLESALE" ? "info" : "muted"}>
                    {row.typeLabel}
                  </Badge>
                </td>
                <td className="max-w-[140px] truncate px-4 py-2.5 font-medium text-foreground">
                  {row.customerName ?? <span className="text-muted-foreground">Cash walk-in</span>}
                </td>
                <td className="max-w-[240px] truncate px-4 py-2.5 text-muted-foreground">
                  {row.items.map((item) => `${formatQuantity(item.quantity)} ${item.name}`).join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap text-foreground">
                  {formatNPR(row.totalAmount)}
                </td>
                <td className="hidden px-4 py-2.5 text-right whitespace-nowrap text-foreground/80 md:table-cell">
                  {formatNPR(row.paidAmount)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={
                      row.paymentStatus === "PAID" ? "success" : row.paymentStatus === "PARTIAL" ? "warning" : "destructive"
                    }
                  >
                    {row.paymentStatus}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for bill at ${row.time}`}>
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPrintTarget(row)}>
                        <Printer /> Print receipt again
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setVoidTarget(row)}>
                        <Undo2 /> Void bill (fix mistake)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Void confirmation */}
      <Dialog open={!!voidTarget} onOpenChange={(next) => !next && setVoidTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void this {voidTarget?.typeLabel === "PAYMENT" ? "payment" : "bill"}?</DialogTitle>
            <DialogDescription>
              {voidTarget?.typeLabel === "PAYMENT"
                ? "The payment amount goes back onto the customer's khata and the record is removed."
                : "Everything is rolled back: items return to the shelf, any udharo amount leaves the customer's khata, and the record is removed. Use this for wrong bills."}
            </DialogDescription>
          </DialogHeader>
          {voidTarget && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-semibold text-foreground">
                {voidTarget.customerName ?? "Cash walk-in"} — {formatNPR(voidTarget.totalAmount)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {voidTarget.items.map((item) => `${formatQuantity(item.quantity)} ${item.name}`).join(", ")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={handleVoid} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <AlertTriangle />} Void bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprint */}
      <Dialog open={!!printTarget} onOpenChange={(next) => !next && setPrintTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Receipt #{printTarget?.id.slice(-8).toUpperCase()}</DialogTitle>
            <DialogDescription>Print this saved bill again on the receipt printer.</DialogDescription>
          </DialogHeader>
          {printTarget && (
            <>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-white p-3">
                <div id="receipt-print">
                  <Receipt
                    data={{
                      id: printTarget.id,
                      createdAt: printTarget.time,
                      type: printTarget.typeLabel,
                      totalAmount: printTarget.totalAmount,
                      paidAmount: printTarget.paidAmount,
                      paymentStatus: printTarget.paymentStatus,
                      customerLabel: printTarget.customerName,
                      items: printTarget.items,
                    }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPrintTarget(null)}>
                  Close
                </Button>
                <Button onClick={() => window.print()}>
                  <Printer /> Print
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
