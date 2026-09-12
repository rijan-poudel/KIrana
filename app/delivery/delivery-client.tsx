"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bike, CheckCircle2, Loader2, PackageCheck, Plus, Trash2, Truck, X } from "lucide-react";
import type { DeliveryLogData } from "@/lib/types";
import { formatDateTime, formatNPR } from "@/lib/format";
import { createDeliveryLog, deleteDeliveryLog, updateDeliveryStatus } from "@/actions/shop-actions";

type StatusFilter = "ALL" | "PENDING" | "DELIVERED" | "SETTLED";
type Banner = { kind: "success" | "error"; message: string } | null;

const STATUS_STYLES: Record<string, string> = {
  PENDING: "badge-amber",
  DELIVERED: "badge-blue",
  SETTLED: "badge-emerald",
};

const NEXT_ACTION: Record<string, { status: string; label: string }> = {
  PENDING: { status: "DELIVERED", label: "Mark Delivered" },
  DELIVERED: { status: "SETTLED", label: "Mark Settled" },
};

export default function DeliveryClient({ logs }: { logs: DeliveryLogData[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [banner, setBanner] = useState<Banner>(null);

  const counts: Record<StatusFilter, number> = {
    ALL: logs.length,
    PENDING: logs.filter((l) => l.status === "PENDING").length,
    DELIVERED: logs.filter((l) => l.status === "DELIVERED").length,
    SETTLED: logs.filter((l) => l.status === "SETTLED").length,
  };

  const visible = filter === "ALL" ? logs : logs.filter((l) => l.status === filter);

  async function advance(log: DeliveryLogData, status: string) {
    const response = await updateDeliveryStatus(log.id, status);
    setBanner(
      response.ok
        ? { kind: "success", message: `${log.destinationClient} dispatch marked ${status.toLowerCase()}.` }
        : { kind: "error", message: response.error },
    );
    router.refresh();
  }

  async function remove(log: DeliveryLogData) {
    const response = await deleteDeliveryLog(log.id);
    setBanner(
      response.ok
        ? { kind: "success", message: `Dispatch record for ${log.destinationClient} deleted.` }
        : { kind: "error", message: response.error },
    );
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Honda Splendor Delivery Tracker</h1>
        <p className="mt-1 text-slate-500">
          Log every wholesale dispatch loaded onto the bike, then track it until the money is settled.
        </p>
      </header>

      {banner && (
        <div
          className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <span className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {banner.message}
          </span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss message" className="shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="card self-start p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Truck size={18} /> New Dispatch
          </h2>
          <DispatchForm
            onSaved={(message) => {
              setBanner({ kind: "success", message });
              router.refresh();
            }}
          />
        </section>

        <section>
          <div className="flex flex-wrap gap-2">
            {(["ALL", "PENDING", "DELIVERED", "SETTLED"] as StatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`h-10 rounded-lg px-4 text-sm font-bold transition-colors ${
                  filter === status ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()} ({counts[status]})
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {visible.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-10 text-center">
                <Bike size={32} className="text-slate-300" />
                <p className="text-sm font-medium text-slate-500">
                  No dispatches {filter === "ALL" ? "recorded yet" : `in "${filter}"`}. Use the form to log a delivery.
                </p>
              </div>
            ) : (
              visible.map((log) => {
                const next = NEXT_ACTION[log.status];
                return (
                  <div key={log.id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-900">{log.destinationClient}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Driver: {log.driverName} • {formatDateTime(log.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">{formatNPR(log.totalValue)}</span>
                        <span className={STATUS_STYLES[log.status] ?? "badge-slate"}>{log.status}</span>
                      </div>
                    </div>
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{log.itemsSummary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {next && (
                        <button
                          type="button"
                          onClick={() => advance(log, next.status)}
                          className={log.status === "PENDING" ? "btn-secondary h-10 text-sm" : "btn-primary h-10 text-sm"}
                        >
                          {log.status === "PENDING" ? <PackageCheck size={15} /> : <CheckCircle2 size={15} />}
                          {next.label}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(log)}
                        className="flex h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DispatchForm({ onSaved }: { onSaved: (message: string) => void }) {
  const [driverName, setDriverName] = useState("Father");
  const [destinationClient, setDestinationClient] = useState("");
  const [itemsSummary, setItemsSummary] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const response = await createDeliveryLog({
      driverName,
      destinationClient,
      itemsSummary,
      totalValue: Number.parseFloat(totalValue) || 0,
    });
    setSubmitting(false);
    if (response.ok) {
      onSaved(`Dispatch to ${destinationClient.trim()} logged — status PENDING.`);
      setDestinationClient("");
      setItemsSummary("");
      setTotalValue("");
    } else {
      setError(response.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label className="label" htmlFor="d-driver">
          Driver name *
        </label>
        <input id="d-driver" value={driverName} onChange={(e) => setDriverName(e.target.value)} className="input" placeholder="e.g., Father" required />
      </div>
      <div>
        <label className="label" htmlFor="d-destination">
          Destination client / shop *
        </label>
        <input
          id="d-destination"
          value={destinationClient}
          onChange={(e) => setDestinationClient(e.target.value)}
          className="input"
          placeholder="e.g., Bishal Store, Dumkibas"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="d-items">
          Items summary *
        </label>
        <textarea
          id="d-items"
          value={itemsSummary}
          onChange={(e) => setItemsSummary(e.target.value)}
          className="input min-h-[88px] resize-y"
          placeholder={'e.g., "5 sacks rice, 2 cartons oil, 1 box soap"'}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="d-value">
          Total estimated value (Rs.)
        </label>
        <input
          id="d-value"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={totalValue}
          onChange={(e) => setTotalValue(e.target.value)}
          className="input"
          placeholder="0.00"
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Log Dispatch
      </button>
    </form>
  );
}
