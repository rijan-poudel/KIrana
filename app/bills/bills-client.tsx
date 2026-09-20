"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Download,
  FileText,
  HardDrive,
  ImageOff,
  ReceiptText,
  ScanLine,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteBill, pruneBillPhotos } from "@/actions/bill-actions";
import { formatBytes, formatDate, formatNPR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parseVatQr, type VatQrFields } from "@/lib/vat-qr";
import type { BillData } from "@/lib/types";
import BillReviewDialog from "./bill-review-dialog";
import ScanBillDialog from "./scan-bill-dialog";

type ReviewState =
  | { mode: "create"; fields: VatQrFields | null; raw: string | null; photoFile: File | null }
  | { mode: "edit"; bill: BillData }
  | null;

const RETENTION_KEY = "milan-bills-photo-retention-days";
const DEFAULT_RETENTION_DAYS = 365; // photos are conveniences; the records stay forever

const RETENTION_OPTIONS = [
  { days: 0, label: "Keep forever" },
  { days: 365, label: "Keep 1 year" },
  { days: 90, label: "Keep 90 days" },
  { days: 30, label: "Keep 30 days" },
];

const RETENTION_ITEMS = Object.fromEntries(RETENTION_OPTIONS.map((o) => [String(o.days), o.label]));

export default function BillsClient({
  bills,
  vendors,
  photoStats,
}: {
  bills: BillData[];
  vendors: string[];
  photoStats: { count: number; bytes: number };
}) {
  const [query, setQuery] = useState("");
  const [fyFilter, setFyFilter] = useState("all");
  const [vatOnly, setVatOnly] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [review, setReview] = useState<ReviewState>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number>(DEFAULT_RETENTION_DAYS);
  const prunedOnce = useRef(false);

  // The photo-retention choice persists locally; the prune runs quietly on open.
  useEffect(() => {
    const raw = window.localStorage.getItem(RETENTION_KEY);
    if (raw !== null && Number.isFinite(Number(raw))) {
      setRetentionDays(Number(raw));
    } else {
      window.localStorage.setItem(RETENTION_KEY, String(DEFAULT_RETENTION_DAYS));
    }
  }, []);
  useEffect(() => {
    if (prunedOnce.current) return;
    prunedOnce.current = true;
    const raw = Number(window.localStorage.getItem(RETENTION_KEY));
    const days = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RETENTION_DAYS;
    void pruneBillPhotos(days).then((result) => {
      if (result.ok && result.data.removed > 0) {
        toast.info(`Cleaned ${result.data.removed} old bill photo${result.data.removed === 1 ? "" : "s"} — records kept.`, {
          description: `${formatBytes(result.data.freedBytes)} of disk freed.`,
        });
      }
    });
  }, []);

  const fiscalYears = useMemo(() => {
    const years = new Set<string>();
    for (const bill of bills) if (bill.fiscalYear) years.add(bill.fiscalYear);
    return [...years].sort().reverse();
  }, [bills]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bills.filter((bill) => {
      if (vatOnly && !bill.isVatBill) return false;
      if (fyFilter === "none" && bill.fiscalYear !== null) return false;
      if (fyFilter !== "all" && fyFilter !== "none" && bill.fiscalYear !== fyFilter) return false;
      if (!needle) return true;
      return [bill.vendorName, bill.vendorPan, bill.billNumber, bill.note]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [bills, query, fyFilter, vatOnly]);

  const totals = useMemo(
    () => ({
      vat: filtered.reduce((sum, b) => sum + (b.isVatBill ? b.vatAmount : 0), 0),
      total: filtered.reduce((sum, b) => sum + b.totalAmount, 0),
    }),
    [filtered],
  );

  const detailBill = detailId ? bills.find((b) => b.id === detailId) ?? null : null;

  function handleQrCaptured(raw: string, photoFile: File | null) {
    setScanOpen(false);
    const parsed = parseVatQr(raw);
    if (parsed.kind === "payment") {
      toast.error("That is a payment QR (Khalti / eSewa / Fonepay), not a bill QR.", {
        description: "Scan the square QR printed on the bill itself.",
      });
      return;
    }
    const empty = Object.keys(parsed.fields).length === 0;
    if (empty) {
      toast.info("The QR data could not be read as bill data.", {
        description: "Fill the details by hand below — the raw scan is kept with the record.",
      });
    }
    setReview({ mode: "create", fields: empty ? null : parsed.fields, raw: parsed.raw || raw, photoFile });
  }

  function changeRetention(days: number) {
    setRetentionDays(days);
    window.localStorage.setItem(RETENTION_KEY, String(days));
  }

  async function cleanPhotosNow() {
    const result = await pruneBillPhotos(retentionDays);
    if (!result.ok) return toast.error(result.error);
    if (result.data.removed === 0) return toast.info("Nothing to clean — every photo is inside the retention window.");
    toast.success(`Removed ${result.data.removed} photo${result.data.removed === 1 ? "" : "s"} (${formatBytes(result.data.freedBytes)} freed).`);
  }

  function exportCsv() {
    const escape = (value: string | number | null | undefined) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["Fiscal Year", "Bill Date (BS)", "Bill Date (AD)", "Vendor", "Vendor PAN", "Bill No", "Taxable", "VAT", "Total", "VAT Bill", "Source", "Note"];
    const rows = filtered.map((b) =>
      [
        b.fiscalYear,
        b.billDateBs,
        b.billDateAd ? b.billDateAd.slice(0, 10) : "",
        b.vendorName,
        b.vendorPan,
        b.billNumber,
        b.taxableAmount.toFixed(2),
        b.vatAmount.toFixed(2),
        b.totalAmount.toFixed(2),
        b.isVatBill ? "yes" : "no",
        b.source,
        b.note,
      ]
        .map(escape)
        .join(","),
    );
    // BOM + CRLF so Excel opens it cleanly.
    const csv = `\uFEFF${header.map(escape).join(",")}\r\n${rows.join("\r\n")}\r\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bills-${fyFilter === "all" ? "all" : fyFilter.replace("/", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const scopeLabel = fyFilter === "all" ? "all records" : fyFilter === "none" ? "undated bills" : `FY ${fyFilter}`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <PageHeader
        title="Bills"
        icon={<ReceiptText size={22} />}
        subtitle="Every bill the shop receives — QR in, record kept, VAT tallied."
        actions={
          <>
            <Button onClick={() => setScanOpen(true)}>
              <ScanLine data-icon="inline-start" /> Scan bill QR
            </Button>
            <Button variant="outline" onClick={() => setReview({ mode: "create", fields: null, raw: null, photoFile: null })}>
              <FileText data-icon="inline-start" /> Add manually
            </Button>
          </>
        }
      />

      {/* ── Totals for the current filter ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-eager-green/30">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">Input VAT</p>
            <p className="mt-1 text-xl font-extrabold text-eager-green md:text-2xl">{formatNPR(totals.vat)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">13% paid on purchases · {scopeLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">Billed total</p>
            <p className="mt-1 text-xl font-extrabold md:text-2xl">{formatNPR(totals.total)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{filtered.length} bill{filtered.length === 1 ? "" : "s"} · {scopeLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">VAT bills</p>
            <p className="mt-1 text-xl font-extrabold md:text-2xl">{filtered.filter((b) => b.isVatBill).length}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">carry a PAN + bill number</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
              <HardDrive size={13} /> Photos on disk
            </p>
            <p className="mt-1 text-xl font-extrabold md:text-2xl">{photoStats.count === 0 ? "None" : formatBytes(photoStats.bytes)}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Select value={String(retentionDays)} items={RETENTION_ITEMS} onValueChange={(v) => v && changeRetention(Number(v))}>
                <SelectTrigger className="h-7 w-[132px] text-xs" aria-label="Photo retention">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((option) => (
                    <SelectItem key={option.days} value={String(option.days)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {photoStats.count > 0 && (
                <Button variant="ghost" size="xs" onClick={cleanPhotosNow}>
                  Clean now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendor, PAN, bill number…"
            className="pl-9"
            aria-label="Search bills"
          />
        </div>
        <Select
          value={fyFilter}
          items={{ all: "All fiscal years", none: "No fiscal year", ...Object.fromEntries(fiscalYears.map((fy) => [fy, `FY ${fy}`])) }}
          onValueChange={(v) => v && setFyFilter(v)}
        >
          <SelectTrigger className="w-[160px]" aria-label="Filter by fiscal year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fiscal years</SelectItem>
            {fiscalYears.map((fy) => (
              <SelectItem key={fy} value={fy}>
                FY {fy}
              </SelectItem>
            ))}
            <SelectItem value="none">No fiscal year</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={vatOnly ? "default" : "outline"}
          size="sm"
          aria-pressed={vatOnly}
          onClick={() => setVatOnly((v) => !v)}
        >
          VAT bills only
        </Button>
        <Button variant="ghost" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download data-icon="inline-start" /> Export CSV
        </Button>
      </div>

      {/* ── List ────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState hasBills={bills.length > 0} onScan={() => setScanOpen(true)} onManual={() => setReview({ mode: "create", fields: null, raw: null, photoFile: null })} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border-2 border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date (BS)</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill no.</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((bill) => (
                  <TableRow key={bill.id} className="cursor-pointer" onClick={() => setDetailId(bill.id)}>
                    <TableCell className="font-semibold">
                      {bill.billDateBs ?? <span className="text-muted-foreground">—</span>}
                      {bill.billDateAd && <span className="block text-[11px] font-normal text-muted-foreground">{formatDate(bill.billDateAd)}</span>}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{bill.vendorName}</span>
                      {bill.vendorPan && <span className="block text-[11px] text-muted-foreground">PAN {bill.vendorPan}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">{bill.billNumber}</TableCell>
                    <TableCell className="text-right tabular-nums">{bill.isVatBill ? formatNPR(bill.taxableAmount) : "—"}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-eager-green">{bill.isVatBill ? formatNPR(bill.vatAmount) : "—"}</TableCell>
                    <TableCell className="text-right font-extrabold tabular-nums">{formatNPR(bill.totalAmount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <BillBadges bill={bill} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-2.5 md:hidden">
            {filtered.map((bill) => (
              <button
                key={bill.id}
                onClick={() => setDetailId(bill.id)}
                className="w-full rounded-2xl border-2 border-border bg-card p-3.5 text-left transition-colors active:bg-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{bill.vendorName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {bill.billDateBs ?? "No date"} · {bill.billNumber}
                    </p>
                  </div>
                  <p className="shrink-0 font-extrabold">{formatNPR(bill.totalAmount)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <BillBadges bill={bill} />
                  {bill.isVatBill && (
                    <p className="text-xs font-bold text-eager-green">VAT {formatNPR(bill.vatAmount)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <ScanBillDialog open={scanOpen} onOpenChange={setScanOpen} onCaptured={handleQrCaptured} />

      {review && (
        <BillReviewDialog
          key={review.mode === "edit" ? `edit-${review.bill.id}` : "create"}
          open
          onOpenChange={(open) => !open && setReview(null)}
          mode={review.mode}
          bill={review.mode === "edit" ? review.bill : null}
          initialFields={review.mode === "create" ? review.fields : null}
          rawPayload={review.mode === "create" ? review.raw : null}
          photoFile={review.mode === "create" ? review.photoFile : null}
          vendors={vendors}
        />
      )}

      <BillDetailDialog bill={detailBill} onOpenChange={(open) => !open && setDetailId(null)} onEdit={(bill) => { setDetailId(null); setReview({ mode: "edit", bill }); }} />
    </div>
  );
}

function BillBadges({ bill }: { bill: BillData }) {
  return (
    <>
      {bill.isVatBill ? (
        <Badge className="h-5 px-1.5 text-[10px]">VAT</Badge>
      ) : (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          plain
        </Badge>
      )}
      {bill.source === "QR" ? (
        <Badge variant="outline" className="h-5 gap-0.5 px-1.5 text-[10px]">
          <ScanLine size={9} /> QR
        </Badge>
      ) : (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
          manual
        </Badge>
      )}
      {!bill.hasPhoto && (
        <span title="No photo — record only">
          <ImageOff size={13} className="text-muted-foreground/50" />
        </span>
      )}
    </>
  );
}

function EmptyState({ hasBills, onScan, onManual }: { hasBills: boolean; onScan: () => void; onManual: () => void }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-storybook-green text-eager-green">
        <ReceiptText size={26} />
      </span>
      <div className="max-w-md">
        <p className="text-lg font-extrabold">{hasBills ? "Nothing matches this filter" : "No bills recorded yet"}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {hasBills
            ? "Try clearing the search or the fiscal-year filter."
            : "Point the camera at the QR printed on a vendor's VAT bill — the details fill themselves and the record is ~300 bytes. Photos are optional and compressed; the data stays forever."}
        </p>
      </div>
      {!hasBills && (
        <div className="flex gap-2">
          <Button onClick={onScan}>
            <Camera data-icon="inline-start" /> Scan your first bill
          </Button>
          <Button variant="outline" onClick={onManual}>
            Type it manually
          </Button>
        </div>
      )}
    </div>
  );
}

function BillDetailDialog({
  bill,
  onOpenChange,
  onEdit,
}: {
  bill: BillData | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (bill: BillData) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!bill) {
      setConfirmDelete(false);
      setDeleting(false);
    }
  }, [bill?.id]);

  if (!bill) return null;

  async function handleDelete() {
    if (!bill) return;
    setDeleting(true);
    const result = await deleteBill(bill.id);
    setDeleting(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Bill deleted.");
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText size={18} /> {bill.vendorName}
          </DialogTitle>
          <DialogDescription>
            Bill {bill.billNumber}
            {bill.fiscalYear ? ` · FY ${bill.fiscalYear}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <DetailRow label="Vendor PAN" value={bill.vendorPan ?? "—"} mono />
            <DetailRow label="Bill no." value={bill.billNumber} mono />
            <DetailRow label="Date (BS)" value={bill.billDateBs ?? "—"} mono />
            <DetailRow label="Date (AD)" value={bill.billDateAd ? formatDate(bill.billDateAd) : "—"} />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border-2 border-border bg-storybook-green/50 p-3 text-center">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Taxable</p>
              <p className="text-sm font-bold tabular-nums">{bill.isVatBill ? formatNPR(bill.taxableAmount) : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">VAT 13%</p>
              <p className="text-sm font-extrabold tabular-nums text-eager-green">{bill.isVatBill ? formatNPR(bill.vatAmount) : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Total</p>
              <p className="text-sm font-extrabold tabular-nums">{formatNPR(bill.totalAmount)}</p>
            </div>
          </div>

          {bill.note && <p className="text-sm text-muted-foreground">📝 {bill.note}</p>}

          {bill.hasPhoto ? (
            <a href={`/api/bill-photo/${bill.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border-2 border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/bill-photo/${bill.id}`} alt={`Photo of bill ${bill.billNumber}`} className="max-h-64 w-full object-contain" />
            </a>
          ) : (
            <p className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              <ImageOff size={13} /> No photo kept — the record itself is the archive.
            </p>
          )}

          {bill.rawPayload && (
            <details className="rounded-xl border-2 border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-muted-foreground select-none">
                Raw QR data
              </summary>
              <pre className="overflow-x-auto border-t-2 border-border px-3 py-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">{bill.rawPayload}</pre>
            </details>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {confirmDelete ? (
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 data-icon="inline-start" /> {deleting ? "Deleting…" : "Really delete?"}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 data-icon="inline-start" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onEdit(bill)}>
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase">{label}</p>
      <p className={cn("font-semibold", mono && "font-mono text-[13px]")}>{value}</p>
    </div>
  );
}
