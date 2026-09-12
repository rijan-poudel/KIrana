"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Plus,
  Trash2,
  Truck,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DeliveryLogData } from "@/lib/types";
import { formatDateTime, formatNPR } from "@/lib/format";
import { createDeliveryLog, deleteDeliveryLog, updateDeliveryStatus } from "@/actions/shop-actions";
import { cn } from "@/lib/utils";

type StatusFilter = "ALL" | "PENDING" | "DELIVERED" | "SETTLED";

const STATUS_VARIANT: Record<string, "warning" | "info" | "success"> = {
  PENDING: "warning",
  DELIVERED: "info",
  SETTLED: "success",
};

const NEXT_ACTION: Record<string, { status: string; label: string }> = {
  PENDING: { status: "DELIVERED", label: "Mark Delivered" },
  DELIVERED: { status: "SETTLED", label: "Mark Settled" },
};

export default function DeliveryClient({ logs }: { logs: DeliveryLogData[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<DeliveryLogData | null>(null);

  const counts: Record<StatusFilter, number> = {
    ALL: logs.length,
    PENDING: logs.filter((l) => l.status === "PENDING").length,
    DELIVERED: logs.filter((l) => l.status === "DELIVERED").length,
    SETTLED: logs.filter((l) => l.status === "SETTLED").length,
  };

  const visible = filter === "ALL" ? logs : logs.filter((l) => l.status === filter);

  async function advance(log: DeliveryLogData, status: string) {
    const response = await updateDeliveryStatus(log.id, status);
    if (response.ok) {
      toast.success(`${log.destinationClient} dispatch marked ${status.toLowerCase()}.`);
    } else {
      toast.error(response.error);
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const response = await deleteDeliveryLog(deleteTarget.id);
    if (response.ok) {
      toast.success(`Dispatch record for ${deleteTarget.destinationClient} deleted.`);
      setDeleteTarget(null);
    } else {
      toast.error(response.error);
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">Deliveries</h1>
        <p className="mt-1 text-muted-foreground">
          Log every wholesale dispatch that leaves the shop, then track it until the money is settled.
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="card self-start p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Truck size={18} /> New Dispatch
          </h2>
          <DispatchForm />
        </section>

        <section>
          <div className="flex flex-wrap gap-2">
            {(["ALL", "PENDING", "DELIVERED", "SETTLED"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                aria-pressed={filter === status}
                className={cn(
                  "h-10 rounded-lg px-4 text-sm font-bold transition-colors",
                  filter === status
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()} ({counts[status]})
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {visible.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-10 text-center">
                <Bike size={32} className="text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  No dispatches {filter === "ALL" ? "recorded yet" : `in "${filter}"`}. Log one from the form.
                </p>
              </div>
            ) : (
              visible.map((log) => {
                const next = NEXT_ACTION[log.status];
                return (
                  <div key={log.id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-foreground">{log.destinationClient}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Driver: {log.driverName} • {formatDateTime(log.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-foreground">{formatNPR(log.totalValue)}</span>
                        <Badge variant={STATUS_VARIANT[log.status] ?? "muted"}>{log.status}</Badge>
                      </div>
                    </div>
                    <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-foreground/90">{log.itemsSummary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {next && (
                        <Button
                          variant={log.status === "PENDING" ? "outline" : "default"}
                          className="h-10"
                          onClick={() => advance(log, next.status)}
                        >
                          {log.status === "PENDING" ? <PackageCheck /> : <CheckCircle2 />}
                          {next.label}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="h-10 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteTarget(log)}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete dispatch to {deleteTarget?.destinationClient}?</DialogTitle>
            <DialogDescription>
              This removes the record permanently. If the goods were already delivered, mark it settled instead of
              deleting it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DispatchForm() {
  const router = useRouter();
  const [driverName, setDriverName] = useState("");
  const [destinationClient, setDestinationClient] = useState("");
  const [itemsSummary, setItemsSummary] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const response = await createDeliveryLog({
      driverName,
      destinationClient,
      itemsSummary,
      totalValue: Number.parseFloat(totalValue) || 0,
    });
    setSubmitting(false);
    if (response.ok) {
      toast.success(`Dispatch to ${destinationClient.trim()} logged — status PENDING.`);
      setDestinationClient("");
      setItemsSummary("");
      setTotalValue("");
    } else {
      toast.error(response.error);
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <Label htmlFor="d-driver">Driver name *</Label>
        <Input
          id="d-driver"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          placeholder="e.g., Father"
          required
        />
      </div>
      <div>
        <Label htmlFor="d-destination">Destination client / shop *</Label>
        <Input
          id="d-destination"
          value={destinationClient}
          onChange={(e) => setDestinationClient(e.target.value)}
          placeholder="e.g., Bishal Store, Dumkibas"
          required
        />
      </div>
      <div>
        <Label htmlFor="d-items">Items summary *</Label>
        <Textarea
          id="d-items"
          value={itemsSummary}
          onChange={(e) => setItemsSummary(e.target.value)}
          className="min-h-[88px] resize-y"
          placeholder={'e.g., "5 sacks rice, 2 cartons oil, 1 box soap"'}
          required
        />
      </div>
      <div>
        <Label htmlFor="d-value">Total estimated value (Rs.)</Label>
        <Input
          id="d-value"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={totalValue}
          onChange={(e) => setTotalValue(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? <Loader2 className="animate-spin" /> : <Plus />} Log Dispatch
      </Button>
    </form>
  );
}
