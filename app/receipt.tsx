import { APP_LOCATION, APP_NAME } from "@/lib/constants";
import { formatDateTime, formatNPR, formatQuantity } from "@/lib/format";
import type { ReceiptData } from "@/lib/types";

/**
 * The 80mm thermal receipt body. Pure markup so both the checkout success
 * dialog and the Reports "print again" dialog can render it; the print CSS in
 * globals.css makes `#receipt-print` the only visible thing on paper.
 */
export default function Receipt({ data }: { data: ReceiptData }) {
  const dueAmount = Math.max(data.totalAmount - data.paidAmount, 0);
  return (
    <div className="font-mono text-[11px] leading-snug text-black">
      <p className="text-center text-sm font-bold uppercase">{APP_NAME}</p>
      <p className="text-center">{APP_LOCATION}</p>
      <p className="mt-1 text-center">
        Receipt #{data.id.slice(-8).toUpperCase()} — {formatDateTime(data.createdAt)}
      </p>
      <p className="text-center">{data.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL"}</p>
      <div className="my-1 border-t border-dashed border-black/40" />
      {data.items.map((item, index) => (
        <div key={index} className="flex justify-between gap-2">
          <span className="min-w-0">
            {formatQuantity(item.quantity)} {item.unitName || item.baseUnit} × {formatNPR(item.unitPrice)} {item.name}
          </span>
          <span className="shrink-0">{formatNPR(item.subtotal)}</span>
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-black/40" />
      <div className="flex justify-between font-bold">
        <span>TOTAL</span>
        <span>{formatNPR(data.totalAmount)}</span>
      </div>
      <div className="flex justify-between">
        <span>PAID</span>
        <span>{formatNPR(data.paidAmount)}</span>
      </div>
      {dueAmount > 0 && (
        <div className="flex justify-between font-bold">
          <span>UDHARO{data.customerLabel ? ` (${data.customerLabel})` : ""}</span>
          <span>{formatNPR(dueAmount)}</span>
        </div>
      )}
      <p className="mt-2 text-center">धन्यवाद! Please come again.</p>
    </div>
  );
}
