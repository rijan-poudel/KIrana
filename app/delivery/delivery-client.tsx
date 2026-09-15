"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  RotateCcw,
  Trash2,
  Truck,
  UserRound,
  XCircle,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, parseInputNumber, parseOptionalNumber } from "@/components/form-field";
import type { CustomerOption, DeliveryLogData, DeliveryItemData, ProductCardData } from "@/lib/types";
import { formatDateTime, formatDate, formatNPR, formatTime } from "@/lib/format";
import {
  createDeliveryLog,
  deleteDeliveryLog,
  updateDeliveryStatus,
  setDeliveryProof,
  settleDelivery,
  returnDelivery,
  cancelDelivery,
} from "@/actions/shop-actions";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

/* ── Status helpers ──────────────────────────────────────────────── */

/** Safe numeric coercion using the parse helper — returns 0 for invalid/empty input. */
function num(s: string): number {
  const r = parseOptionalNumber(s);
  return "error" in r || r.value === null ? 0 : r.value;
}

type StatusFilter = "ALL" | "TODAY" | "OVERDUE" | "UPCOMING" | DeliveryLogData["status"];

const STATUS_VARIANT: Record<string, "warning" | "info" | "success" | "destructive" | "muted"> = {
  PENDING: "muted",
  ASSIGNED: "info",
  LOADED: "info",
  IN_TRANSIT: "warning",
  DELIVERED: "info",
  SETTLED: "success",
  RETURNED: "destructive",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  ASSIGNED: "Assigned",
  LOADED: "Loaded",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  SETTLED: "Settled",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

const NEXT_ACTION: Record<string, { status: string; label: string } | undefined> = {
  PENDING: { status: "ASSIGNED", label: "Assign Driver" },
  ASSIGNED: { status: "LOADED", label: "Mark Loaded" },
  LOADED: { status: "IN_TRANSIT", label: "Start Delivery" },
  IN_TRANSIT: { status: "DELIVERED", label: "Mark Delivered" },
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "border-l-gray-400",
  ASSIGNED: "border-l-blue-400",
  LOADED: "border-l-indigo-400",
  IN_TRANSIT: "border-l-amber-400",
  DELIVERED: "border-l-emerald-400",
  SETTLED: "border-l-emerald-600",
  RETURNED: "border-l-red-400",
  CANCELLED: "border-l-gray-500",
};

function isOverdue(log: DeliveryLogData): boolean {
  if (!log.scheduledAt) return false;
  if (["SETTLED", "RETURNED", "CANCELLED"].includes(log.status)) return false;
  return new Date(log.scheduledAt) < new Date();
}

function isToday(log: DeliveryLogData): boolean {
  const d = log.scheduledAt ? new Date(log.scheduledAt) : new Date(log.createdAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isUpcoming(log: DeliveryLogData): boolean {
  if (!log.scheduledAt) return false;
  if (["SETTLED", "RETURNED", "CANCELLED"].includes(log.status)) return false;
  const d = new Date(log.scheduledAt);
  const now = new Date();
  return d > now && d <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/* ── Main component ──────────────────────────────────────────────── */

export default function DeliveryClient({
  logs,
  customers,
  products,
}: {
  logs: DeliveryLogData[];
  customers: CustomerOption[];
  products: ProductCardData[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<DeliveryLogData | null>(null);
  const [proofTarget, setProofTarget] = useState<DeliveryLogData | null>(null);
  const [settleTarget, setSettleTarget] = useState<DeliveryLogData | null>(null);
  const [returnTarget, setReturnTarget] = useState<DeliveryLogData | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      ALL: logs.length,
      TODAY: 0,
      OVERDUE: 0,
      UPCOMING: 0,
      PENDING: 0,
      ASSIGNED: 0,
      LOADED: 0,
      IN_TRANSIT: 0,
      DELIVERED: 0,
      SETTLED: 0,
      RETURNED: 0,
      CANCELLED: 0,
    };
    for (const l of logs) {
      if (l.status in c) c[l.status as StatusFilter]++;
      if (isToday(l)) c.TODAY++;
      if (isOverdue(l)) c.OVERDUE++;
      if (isUpcoming(l)) c.UPCOMING++;
    }
    return c;
  }, [logs]);

  const visible = useMemo(() => {
    switch (filter) {
      case "ALL":
        return logs;
      case "TODAY":
        return logs.filter(isToday);
      case "OVERDUE":
        return logs.filter(isOverdue);
      case "UPCOMING":
        return logs.filter(isUpcoming);
      default:
        return logs.filter((l) => l.status === filter);
    }
  }, [logs, filter]);

  async function advance(log: DeliveryLogData, status: string) {
    const response = await updateDeliveryStatus(log.id, status);
    if (response.ok) toast.success(`${log.destinationClient} → ${STATUS_LABEL[status] ?? status}`);
    else toast.error(response.error);
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const response = await deleteDeliveryLog(deleteTarget.id);
    if (response.ok) {
      toast.success(`Delivery to ${deleteTarget.destinationClient} deleted.`);
      setDeleteTarget(null);
    } else {
      toast.error(response.error);
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <PageHeader
        title="Deliveries"
        subtitle="Track every wholesale dispatch from the shop until the money is settled."
        icon={<Truck size={22} />}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── Form ──────────────────────────────────────── */}
        <section className="card self-start p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Truck size={18} /> New Dispatch
          </h2>
          <DispatchForm customers={customers} products={products} />
        </section>

        {/* ── List ──────────────────────────────────────── */}
        <section>
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {(["ALL", "TODAY", "OVERDUE", "UPCOMING", "PENDING", "ASSIGNED", "LOADED", "IN_TRANSIT", "DELIVERED", "SETTLED", "RETURNED", "CANCELLED"] as StatusFilter[]).map((s) => (
              <Button
                key={s}
                type="button"
                variant={filter === s ? "default" : "outline"}
                size="lg"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={cn(
                  "h-9 text-xs font-bold",
                  s === "OVERDUE" && counts.OVERDUE > 0 && filter !== "OVERDUE" && "border-red-400 text-red-600",
                )}
              >
                {s === "ALL"
                  ? "All"
                  : s === "TODAY"
                    ? "Today"
                    : s === "OVERDUE"
                      ? "Overdue"
                      : s === "UPCOMING"
                        ? "Upcoming"
                        : STATUS_LABEL[s] ?? s}{" "}
                ({counts[s]})
              </Button>
            ))}
          </div>

          {/* Delivery cards */}
          <div className="mt-4 space-y-3">
            {visible.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-10 text-center">
                <Bike size={32} className="text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  {filter === "OVERDUE"
                    ? "No overdue deliveries."
                    : filter === "TODAY"
                      ? "No deliveries scheduled for today."
                      : filter === "UPCOMING"
                        ? "No upcoming deliveries this week."
                        : filter === "ALL"
                          ? "No dispatches recorded yet. Log one from the form."
                          : `No deliveries with status "${STATUS_LABEL[filter] ?? filter}".`}
                </p>
              </div>
            ) : (
              visible.map((log) => {
                const next = NEXT_ACTION[log.status];
                const expanded = expandedId === log.id;
                const overdue = isOverdue(log);
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "card border-l-4 p-4 transition-shadow hover:shadow-md",
                      STATUS_COLORS[log.status],
                      overdue && "ring-1 ring-red-300",
                    )}
                  >
                    {/* Header row */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-foreground">{log.destinationClient}</p>
                          {log.customerName && (
                            <Badge variant="info" className="text-[10px]">
                              <UserRound size={10} className="mr-0.5" />
                              Khata
                            </Badge>
                          )}
                          {overdue && (
                            <Badge variant="destructive" className="text-[10px]">
                              OVERDUE
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Driver: {log.driverName}
                          {log.driverPhone ? ` (${log.driverPhone})` : ""}
                          {log.vehicleNumber ? ` · ${log.vehicleNumber}` : ""}
                          {log.scheduledAt ? ` · Due: ${formatDate(log.scheduledAt)}` : ""}
                          {` · ${formatDateTime(log.createdAt)}`}
                        </p>
                        {/* Customer info if linked */}
                        {log.customerName && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {log.customerName}
                            {log.customerAddress ? ` · ${log.customerAddress}` : ""}
                            {log.customerBalance > 0 ? ` · Khata: ${formatNPR(log.customerBalance)}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-foreground">{formatNPR(log.totalValue)}</span>
                        <Badge variant={STATUS_VARIANT[log.status] ?? "muted"}>{STATUS_LABEL[log.status] ?? log.status}</Badge>
                      </div>
                    </div>

                    {/* Items summary */}
                    <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground/90">{log.itemsSummary}</p>

                    {/* Expandable line items */}
                    {log.items.length > 0 && (
                      <button
                        type="button"
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedId(expanded ? null : log.id)}
                      >
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {expanded ? "Hide" : "Show"} {log.items.length} item{log.items.length !== 1 ? "s" : ""}
                      </button>
                    )}
                    {expanded && log.items.length > 0 && (
                      <div className="mt-2 rounded-lg border border-border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                              <th className="px-2 py-1.5 font-semibold">Product</th>
                              <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                              <th className="px-2 py-1.5 text-right font-semibold">Price</th>
                              <th className="px-2 py-1.5 text-right font-semibold">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {log.items.map((item) => (
                              <tr key={item.id} className="border-b border-border/50 last:border-0">
                                <td className="px-2 py-1.5 font-medium">{item.productName}</td>
                                <td className="px-2 py-1.5 text-right">
                                  {item.quantity} {item.unitName || item.productBaseUnit}
                                </td>
                                <td className="px-2 py-1.5 text-right">{formatNPR(item.unitPrice)}</td>
                                <td className="px-2 py-1.5 text-right font-semibold">{formatNPR(item.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Timestamps */}
                    {(log.startedAt || log.deliveredAt) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        {log.startedAt && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} /> Departed: {formatDateTime(log.startedAt)}
                          </span>
                        )}
                        {log.deliveredAt && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={11} /> Delivered: {formatDateTime(log.deliveredAt)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Settlement notes */}
                    {log.settlementNotes && (
                      <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        💰 {log.settlementNotes}
                      </p>
                    )}

                    {/* Delivery notes */}
                    {log.deliveryNotes && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        <FileText size={12} className="mr-1 inline" />
                        {log.deliveryNotes}
                      </p>
                    )}

                    {/* Proof of delivery indicator */}
                    {log.proofOfDelivery && (
                      <p className="mt-2 text-[11px] text-emerald-600 font-medium">✓ Proof recorded</p>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {next && (
                        <Button
                          variant={log.status === "PENDING" || log.status === "ASSIGNED" ? "outline" : "default"}
                          className="h-9 text-xs"
                          onClick={() => advance(log, next.status)}
                        >
                          {log.status === "IN_TRANSIT" ? <CheckCircle2 size={14} /> : <PackageCheck size={14} />}
                          {next.label}
                        </Button>
                      )}
                      {log.status === "IN_TRANSIT" && (
                        <Button
                          variant="default"
                          className="h-9 text-xs"
                          onClick={() => setProofTarget(log)}
                        >
                          <CheckCircle2 size={14} /> Record Delivery
                        </Button>
                      )}
                      {log.status === "DELIVERED" && (
                        <Button variant="default" className="h-9 text-xs" onClick={() => setSettleTarget(log)}>
                          💰 Settle Payment
                        </Button>
                      )}
                      {!["SETTLED", "RETURNED", "CANCELLED"].includes(log.status) && (
                        <Button
                          variant="ghost"
                          className="h-9 text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                          onClick={() => setReturnTarget(log)}
                        >
                          <RotateCcw size={14} /> Return
                        </Button>
                      )}
                      {!["SETTLED", "RETURNED", "CANCELLED"].includes(log.status) && (
                        <Button
                          variant="ghost"
                          className="h-9 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setDeleteTarget(log)}
                        >
                          <Trash2 size={14} /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ── Delete dialog ────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete delivery to {deleteTarget?.destinationClient}?</DialogTitle>
            <DialogDescription>
              Stock will be returned to inventory. If the goods were already delivered, use Return or Settle instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 /> Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Proof of delivery dialog ─────────────────────────── */}
      {proofTarget && (
        <ProofDialog
          log={proofTarget}
          onClose={() => setProofTarget(null)}
          onComplete={() => {
            setProofTarget(null);
            router.refresh();
          }}
        />
      )}

      {/* ── Settlement dialog ────────────────────────────────── */}
      {settleTarget && (
        <SettleDialog
          log={settleTarget}
          onClose={() => setSettleTarget(null)}
          onComplete={() => {
            setSettleTarget(null);
            router.refresh();
          }}
        />
      )}

      {/* ── Return dialog ────────────────────────────────────── */}
      {returnTarget && (
        <ReturnDialog
          log={returnTarget}
          onClose={() => setReturnTarget(null)}
          onComplete={() => {
            setReturnTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Dispatch Form ──────────────────────────────────────────────── */

function DispatchForm({
  customers,
  products,
}: {
  customers: CustomerOption[];
  products: ProductCardData[];
}) {
  const router = useRouter();
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [manualDestination, setManualDestination] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [itemsSummary, setItemsSummary] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    { productId: string; productName: string; quantity: string; unit: string; price: number }[]
  >([]);
  const [productSearch, setProductSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .filter((p) => p.wholesalePrice > 0)
      .filter((p) => !selectedItems.some((s) => s.productId === p.id))
      .slice(0, 5);
  }, [products, productSearch, selectedItems]);

  function addItem(product: ProductCardData) {
    setSelectedItems((prev) => [
      ...prev,
      { productId: product.id, productName: product.name, quantity: "1", unit: product.baseUnit, price: product.wholesalePrice },
    ]);
    setProductSearch("");
  }

  function removeItem(idx: number) {
    setSelectedItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItemQty(idx: number, qty: string) {
    setSelectedItems((prev) => prev.map((item, i) => (i === idx ? { ...item, quantity: qty } : item)));
  }

  function computeTotal(): number {
    let total = 0;
    for (const item of selectedItems) {
      const qty = parseFloat(item.quantity);
      if (!isNaN(qty) && qty > 0) total += qty * item.price;
    }
    return total;
  }

  function getDestination(): string {
    if (selectedCustomer) return selectedCustomer.name;
    if (useManual && manualDestination.trim()) return manualDestination.trim();
    return "";
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!driverName.trim()) errs.driver = "Driver name is required.";
    if (!getDestination()) errs.destination = "Select a customer or type a destination name.";
    if (selectedItems.length === 0 && !itemsSummary.trim()) errs.items = "Add products or enter an items summary.";
    if (selectedItems.length > 0) {
      for (const item of selectedItems) {
        const q = parseInputNumber(item.quantity);
        if ("error" in q) {
          errs.items = "Every item needs a valid quantity.";
          break;
        }
        if (q.value <= 0) {
          errs.items = "Quantities must be greater than zero.";
          break;
        }
      }
    }
    if (totalValue.trim() !== "") {
      const parsed = parseInputNumber(totalValue);
      if ("error" in parsed) errs.value = parsed.error;
      else if (parsed.value < 0) errs.value = "Value cannot be negative.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    const computedTotal = selectedItems.length > 0 ? computeTotal() : num(totalValue);
    const summary =
      selectedItems.length > 0
        ? selectedItems.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join(", ")
        : itemsSummary.trim();

    const destination = getDestination();

    const response = await createDeliveryLog({
      driverName,
      driverPhone: driverPhone || null,
      vehicleNumber: vehicleNumber || null,
      destinationClient: destination,
      customerId: customerId || null,
      scheduledAt: scheduledAt || null,
      itemsSummary: summary,
      totalValue: computedTotal,
      items: selectedItems.map((i) => ({
        productId: i.productId,
        quantity: num(i.quantity),
        unitName: i.unit,
        unitPrice: i.price,
      })),
    });
    setSubmitting(false);
    if (response.ok) {
      toast.success(`Dispatch to ${destination} logged — status PENDING.`);
      setDriverName("");
      setDriverPhone("");
      setVehicleNumber("");
      setCustomerId(null);
      setManualDestination("");
      setUseManual(false);
      setScheduledAt("");
      setItemsSummary("");
      setTotalValue("");
      setSelectedItems([]);
      setErrors({});
    } else {
      toast.error(response.error);
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      {/* Driver */}
      <FormField label="Driver name *" htmlFor="d-driver" error={errors.driver}>
        <Input
          id="d-driver"
          value={driverName}
          onChange={(e) => { setDriverName(e.target.value); setErrors((p) => ({ ...p, driver: "" })); }}
          placeholder="e.g., Father"
          aria-invalid={!!errors.driver}
          required
        />
      </FormField>

      {/* Driver phone & vehicle */}
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Driver phone" htmlFor="d-phone">
          <Input id="d-phone" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Optional" />
        </FormField>
        <FormField label="Vehicle # " htmlFor="d-vehicle">
          <Input id="d-vehicle" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g., Ba 12 Pa 3456" />
        </FormField>
      </div>

      {/* Destination */}
      <FormField label="Destination *" error={errors.destination}>
        {customers.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <Button
              type="button"
              variant={!useManual ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setUseManual(false); setManualDestination(""); setErrors((p) => ({ ...p, destination: "" })); }}
            >
              <UserRound size={13} /> From Khata
            </Button>
            <Button
              type="button"
              variant={useManual ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setUseManual(true); setCustomerId(null); setErrors((p) => ({ ...p, destination: "" })); }}
            >
              <MapPin size={13} /> Manual
            </Button>
          </div>
        )}

        {!useManual && customers.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    customerId === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
                  )}
                  onClick={() => {
                    setCustomerId(c.id);
                    setManualDestination("");
                    setErrors((p) => ({ ...p, destination: "" }));
                  }}
                >
                  {c.name}
                  {c.currentBalance > 0 && (
                    <span className="ml-1 opacity-60">{formatNPR(c.currentBalance)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Input
            id="d-destination"
            value={manualDestination}
            onChange={(e) => {
              setManualDestination(e.target.value);
              setErrors((p) => ({ ...p, destination: "" }));
            }}
            placeholder="e.g., Bishal Store, Dumkibas"
            aria-invalid={!!errors.destination}
          />
        )}

        {selectedCustomer && (
          <div className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
            {selectedCustomer.address && <span>{selectedCustomer.address}</span>}
            {selectedCustomer.phone && <span> · {selectedCustomer.phone}</span>}
            {selectedCustomer.currentBalance > 0 && (
              <span className="ml-1 font-semibold text-amber-700">
                · Outstanding: {formatNPR(selectedCustomer.currentBalance)}
              </span>
            )}
          </div>
        )}
      </FormField>

      {/* Scheduled date */}
      <FormField label="Scheduled delivery date" htmlFor="d-scheduled" hint="Optional — for planning">
        <Input
          id="d-scheduled"
          type="date"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
        />
      </FormField>

      {/* Products */}
      <FormField label="Add products" hint="Search by name">
        <Input
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Search products..."
        />
        {filteredProducts.length > 0 && (
          <div className="mt-1 rounded-lg border border-border bg-popover max-h-40 overflow-y-auto">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => addItem(p)}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatNPR(p.wholesalePrice)} / {p.baseUnit} · Stock: {p.stockQuantity}
                </span>
              </button>
            ))}
          </div>
        )}
      </FormField>

      {/* Selected items */}
      {selectedItems.length > 0 && (
        <div className="rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <th className="px-2 py-1.5">Product</th>
                <th className="px-2 py-1.5 w-20 text-right">Qty</th>
                <th className="px-2 py-1.5 text-right">Price</th>
                <th className="px-2 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item, idx) => (
                <tr key={item.productId} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-1.5 font-medium">{item.productName}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => updateItemQty(idx, e.target.value)}
                      aria-label={`Quantity of ${item.productName}`}
                      aria-invalid={!!errors.items}
                      className="h-8 w-20 rounded border border-border bg-background px-1.5 py-0.5 text-right text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">{formatNPR(item.price)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                      <XCircle size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-xs font-bold">
            <span>Total</span>
            <span>{formatNPR(computeTotal())}</span>
          </div>
          {errors.items && selectedItems.length > 0 && (
            <p role="alert" className="border-t border-border px-3 py-1.5 text-xs text-destructive">
              {errors.items}
            </p>
          )}
        </div>
      )}

      {/* Items summary (free text fallback) */}
      <FormField label="Items summary *" htmlFor="d-items" error={errors.items}>
        <Textarea
          id="d-items"
          value={itemsSummary}
          onChange={(e) => { setItemsSummary(e.target.value); setErrors((p) => ({ ...p, items: "" })); }}
          className="min-h-[80px] resize-y"
          placeholder={selectedItems.length > 0 ? "Auto-filled from products above" : "e.g., 5 sacks rice, 2 cartons oil"}
          aria-invalid={!!errors.items}
        />
      </FormField>

      {/* Total value */}
      <FormField
        label="Total estimated value (Rs.)"
        htmlFor="d-value"
        error={errors.value}
        hint={selectedItems.length > 0 ? `Auto: ${formatNPR(computeTotal())}` : "Optional — used for reference"}
      >
        <Input
          id="d-value"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={totalValue}
          onChange={(e) => { setTotalValue(e.target.value); setErrors((p) => ({ ...p, value: "" })); }}
          placeholder="0.00"
          disabled={selectedItems.length > 0}
          aria-invalid={!!errors.value}
        />
      </FormField>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? <Loader2 className="animate-spin" /> : <Plus />} Log Dispatch
      </Button>
    </form>
  );
}

/* ── Proof of Delivery Dialog ────────────────────────────────────── */

function ProofDialog({
  log,
  onClose,
  onComplete,
}: {
  log: DeliveryLogData;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [proof, setProof] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!proof.trim()) {
      toast.error("Enter proof of delivery (signature, OTP, or notes).");
      return;
    }
    setSubmitting(true);
    const response = await setDeliveryProof(log.id, proof.trim(), notes);
    setSubmitting(false);
    if (response.ok) {
      toast.success(`Delivery to ${log.destinationClient} confirmed.`);
      onComplete();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 size={18} /> Confirm Delivery
          </DialogTitle>
          <DialogDescription>
            Record proof of delivery for {log.destinationClient}. This marks the delivery as DELIVERED.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label="Proof of delivery *" hint="OTP, signature description, or recipient name">
            <Input
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder="e.g., OTP 1234, Received by Ram"
              autoFocus
            />
          </FormField>
          <FormField label="Delivery notes" hint="Optional — damages, short items, etc.">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., 2 items damaged, partial delivery"
              className="min-h-[60px] resize-y"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Confirm Delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Settle Dialog ──────────────────────────────────────────────── */

function SettleDialog({
  log,
  onClose,
  onComplete,
}: {
  log: DeliveryLogData;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [paymentType, setPaymentType] = useState<"CASH" | "KHATA" | "ONLINE">("CASH");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const response = await settleDelivery(log.id, notes, paymentType);
    setSubmitting(false);
    if (response.ok) {
      toast.success(`Delivery to ${log.destinationClient} settled (${paymentType}).`);
      onComplete();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle Payment — {log.destinationClient}</DialogTitle>
          <DialogDescription>
            Total: {formatNPR(log.totalValue)}
            {log.customerName && ` · ${log.customerName}'s khata balance: ${formatNPR(log.customerBalance)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormField label="Payment type">
            <div className="flex gap-2">
              {(["CASH", "KHATA", "ONLINE"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={paymentType === t ? "default" : "outline"}
                  onClick={() => setPaymentType(t)}
                  className="flex-1"
                >
                  {t === "CASH" ? "💵 Cash" : t === "KHATA" ? "📒 Khata (Credit)" : "📱 Online"}
                </Button>
              ))}
            </div>
          </FormField>
          {paymentType === "KHATA" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              This will add {formatNPR(log.totalValue)} to {log.customerName ?? "the customer"}&apos;s khata balance.
            </p>
          )}
          <FormField label="Notes" hint="Optional">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Paid in full, half paid..."
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Settle {formatNPR(log.totalValue)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Return Dialog ──────────────────────────────────────────────── */

function ReturnDialog({
  log,
  onClose,
  onComplete,
}: {
  log: DeliveryLogData;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!notes.trim()) {
      toast.error("Enter a reason for the return.");
      return;
    }
    setSubmitting(true);
    const response = await returnDelivery(log.id, notes.trim());
    setSubmitting(false);
    if (response.ok) {
      toast.success(`Delivery to ${log.destinationClient} returned — stock restored.`);
      onComplete();
    } else {
      toast.error(response.error);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <RotateCcw size={18} /> Return Delivery?
          </DialogTitle>
          <DialogDescription>
            All {log.items.length} item{log.items.length !== 1 ? "s" : ""} will be restored to inventory. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <FormField label="Return reason *" hint="Why is this being returned?">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Customer refused delivery, wrong items sent"
            className="min-h-[80px] resize-y"
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Return &amp; Restore Stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
