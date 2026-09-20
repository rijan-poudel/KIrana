"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleAlert, ImageIcon, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { attachBillPhoto, removeBillPhoto, saveBill, updateBill } from "@/actions/bill-actions";
import { compressBillPhoto } from "@/lib/image-compress";
import { formatNPR } from "@/lib/format";
import { fiscalYearForBs, type VatQrFields } from "@/lib/vat-qr";
import type { BillData, BillInput } from "@/lib/types";

type FormState = {
  vendorName: string;
  vendorPan: string;
  billNumber: string;
  isVatBill: boolean;
  billDateBs: string;
  billDateAd: string; // yyyy-mm-dd for the date input
  taxable: string;
  vat: string;
  total: string;
  note: string;
};

/**
 * The one human checkpoint in the QR flow: the scan pre-fills everything it
 * could read deterministically, the shopkeeper glances, fixes, saves. Also
 * serves as the manual entry form for plain (non-QR) bills and as the editor.
 */
export default function BillReviewDialog({
  open,
  onOpenChange,
  mode,
  bill,
  initialFields,
  rawPayload,
  photoFile,
  vendors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  bill: BillData | null;
  initialFields: VatQrFields | null;
  rawPayload: string | null;
  photoFile: File | null;
  vendors: string[];
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [attachPhoto, setAttachPhoto] = useState(true);
  const [replacePhoto, setReplacePhoto] = useState<File | null>(null);
  const [wantsNewPhoto, setWantsNewPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<{ match: "pan" | "name"; vendorName: string; billNumber: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [bsError, setBsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDuplicate(null);
    setFormError(null);
    setBsError(null);
    setReplacePhoto(null);
    setWantsNewPhoto(false);
    setAttachPhoto(true);
    if (mode === "edit" && bill) {
      setForm({
        vendorName: bill.vendorName,
        vendorPan: bill.vendorPan ?? "",
        billNumber: bill.billNumber,
        isVatBill: bill.isVatBill,
        billDateBs: bill.billDateBs ?? "",
        billDateAd: bill.billDateAd ? bill.billDateAd.slice(0, 10) : "",
        taxable: bill.isVatBill ? String(bill.taxableAmount) : "",
        vat: bill.isVatBill ? String(bill.vatAmount) : "",
        total: String(bill.totalAmount),
        note: bill.note ?? "",
      });
    } else if (initialFields) {
      setForm({
        ...emptyForm(),
        vendorName: initialFields.vendorName ?? "",
        vendorPan: initialFields.vendorPan ?? "",
        billNumber: initialFields.billNumber ?? "",
        isVatBill: initialFields.vatAmount !== undefined || initialFields.taxableAmount !== undefined,
        billDateBs: initialFields.billDateBs ?? "",
        billDateAd: initialFields.billDateAd ?? "",
        taxable: initialFields.taxableAmount !== undefined ? String(initialFields.taxableAmount) : "",
        vat: initialFields.vatAmount !== undefined ? String(initialFields.vatAmount) : "",
        total: initialFields.totalAmount !== undefined ? String(initialFields.totalAmount) : "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, mode, bill, initialFields]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const vatCheck = useMemo(() => {
    if (!form.isVatBill) return null;
    const taxable = Number(form.taxable);
    const vat = Number(form.vat);
    if (!Number.isFinite(taxable) || !Number.isFinite(vat) || taxable <= 0 || form.vat === "") return null;
    const expected = taxable * 0.13;
    const ok = Math.abs(expected - vat) <= Math.max(1, expected * 0.01);
    return { ok, message: ok ? `Checks out: 13% of ${formatNPR(taxable)} ≈ ${formatNPR(vat)}` : `13% of ${formatNPR(taxable)} is about ${formatNPR(expected)} — the bill says ${formatNPR(vat)}` };
  }, [form.isVatBill, form.taxable, form.vat]);

  const totalCheck = useMemo(() => {
    if (!form.isVatBill) return null;
    const taxable = Number(form.taxable);
    const vat = Number(form.vat);
    const total = Number(form.total);
    if (!Number.isFinite(taxable) || !Number.isFinite(vat) || !Number.isFinite(total) || form.taxable === "" || form.vat === "" || form.total === "") return null;
    const expected = taxable + vat;
    const ok = Math.abs(expected - total) <= Math.max(1, expected * 0.01);
    return { ok, message: ok ? `Total = taxable + VAT ✓` : `Taxable + VAT is ${formatNPR(expected)}, but the total says ${formatNPR(total)}` };
  }, [form.isVatBill, form.taxable, form.vat, form.total]);

  const fyPreview = useMemo(() => {
    const match = form.billDateBs.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
    if (!match) return undefined;
    const bs = `${match[1]}.${match[2].padStart(2, "0")}.${match[3].padStart(2, "0")}`;
    return fiscalYearForBs(bs);
  }, [form.billDateBs]);

  function validate(): BillInput | null {
    if (!form.vendorName.trim()) {
      setFormError("Who is the bill from? Enter the vendor name.");
      return null;
    }
    if (!form.billNumber.trim()) {
      setFormError("Enter the bill number printed on the bill.");
      return null;
    }
    const pan = form.vendorPan.trim();
    if (pan && !/^\d{6,12}$/.test(pan)) {
      setFormError("A PAN is 9 digits — check the number printed on the bill.");
      return null;
    }
    if (bsError) {
      setFormError(bsError);
      return null;
    }
    const taxable = form.isVatBill ? Number(form.taxable || 0) : 0;
    const vat = form.isVatBill ? Number(form.vat || 0) : 0;
    const total = Number(form.total || 0);
    for (const [label, value, raw] of [
      ["Taxable amount", taxable, form.taxable],
      ["VAT amount", vat, form.vat],
      ["Total amount", total, form.total],
    ] as const) {
      if (raw.trim() !== "" && (!Number.isFinite(value) || value < 0)) {
        setFormError(`${label} must be a number, 0 or more.`);
        return null;
      }
    }
    if (form.isVatBill && total <= 0 && taxable <= 0) {
      setFormError("Enter at least the bill total (or taxable + VAT).");
      return null;
    }
    return {
      vendorName: form.vendorName.trim(),
      vendorPan: pan || null,
      billNumber: form.billNumber.trim(),
      billDateBs: form.billDateBs.trim() || null,
      billDateAd: form.billDateAd || null,
      taxableAmount: taxable,
      vatAmount: vat,
      totalAmount: total,
      isVatBill: form.isVatBill,
      note: form.note.trim() || null,
      rawPayload: mode === "create" ? rawPayload : null,
      source: mode === "create" && rawPayload ? "QR" : "MANUAL",
    };
  }

  async function handlePhotoFor(id: string, file: File | null) {
    if (!file) return;
    const compressed = await compressBillPhoto(file);
    const result = await attachBillPhoto(id, compressed.dataUrl);
    if (!result.ok) throw new Error(result.error);
  }

  async function handleSave(force = false) {
    const input = validate();
    if (!input) return;
    setSaving(true);
    try {
      if (mode === "create") {
        const result = await saveBill(input, { allowDuplicate: force });
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        if (result.data.status === "duplicate") {
          setDuplicate({ match: result.data.match, vendorName: result.data.existing.vendorName, billNumber: result.data.existing.billNumber });
          return;
        }
        if (photoFile && attachPhoto) {
          try {
            await handlePhotoFor(result.data.id, photoFile);
          } catch (error) {
            toast.warning("Bill saved, but the photo failed.", { description: error instanceof Error ? error.message : undefined });
          }
        }
        toast.success("Bill recorded.");
        onOpenChange(false);
      } else {
        const result = await updateBill(bill!.id, input);
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        try {
          if (replacePhoto) await handlePhotoFor(bill!.id, replacePhoto);
        } catch (error) {
          toast.warning("Bill updated, but the photo failed.", { description: error instanceof Error ? error.message : undefined });
        }
        toast.success("Bill updated.");
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePhoto() {
    if (!bill) return;
    const result = await removeBillPhoto(bill.id);
    if (!result.ok) return toast.error(result.error);
    setWantsNewPhoto(false);
    setReplacePhoto(null);
    toast.success("Photo removed — the record stays.");
  }

  function handleBsDate(value: string) {
    set("billDateBs", value);
    const trimmed = value.trim();
    if (!trimmed) {
      setBsError(null);
      return;
    }
    const match = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
    if (!match) {
      setBsError("Use the date as printed, e.g. 2082.05.12.");
      return;
    }
    const year = Number(match[1]);
    if (year < 2000 || year > 2100) {
      setBsError("That year looks off — bills print Bikram Sambat years like 2082.");
      return;
    }
    setBsError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit bill" : rawPayload ? "Check the scanned bill" : "New bill"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Correct anything the record got wrong — history stays honest."
              : rawPayload
                ? "Everything below was read from the QR's own data — confirm or fix it, then save."
                : "No QR? Type the details from the paper bill."}
          </DialogDescription>
        </DialogHeader>

        {duplicate && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-bold text-amber-900">
              <CircleAlert size={15} /> Already recorded?
            </p>
            <p className="mt-1 text-amber-900/80">
              Bill {duplicate.billNumber} from {duplicate.vendorName} is in the list.
              {duplicate.match === "pan"
                ? " The vendor PAN + bill number pair is recorded once only — this is the same physical bill."
                : " Saving again would keep two copies."}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                Check the list
              </Button>
              {duplicate.match === "name" && (
                <Button size="sm" variant="secondary" onClick={() => void handleSave(true)} disabled={saving}>
                  Save anyway
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <FormField label="Vendor (bill from)" htmlFor="bill-vendor">
            <Input
              id="bill-vendor"
              value={form.vendorName}
              onChange={(e) => set("vendorName", e.target.value)}
              list="vendor-name-options"
              placeholder="e.g. Nepal Distribution"
              autoFocus={mode === "create" && !initialFields?.vendorName}
            />
            <datalist id="vendor-name-options">
              {vendors.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </FormField>

          <FormField label="Vendor PAN" htmlFor="bill-pan" hint={form.vendorPan ? undefined : "9 digits, on the bill's header"}>
            <Input
              id="bill-pan"
              value={form.vendorPan}
              onChange={(e) => set("vendorPan", e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
              inputMode="numeric"
              placeholder="e.g. 301234567"
              className="font-mono"
            />
          </FormField>

          <FormField label="Bill number" htmlFor="bill-number">
            <Input
              id="bill-number"
              value={form.billNumber}
              onChange={(e) => set("billNumber", e.target.value)}
              placeholder="e.g. INV-0042"
              className="font-mono"
            />
          </FormField>

          <FormField
            label="Bill date (as printed, BS)"
            htmlFor="bill-bs"
            error={bsError}
            hint={fyPreview ? `Fiscal year ${fyPreview}` : "Shrawan–Ashadh year, e.g. 2082.05.12"}
          >
            <Input
              id="bill-bs"
              value={form.billDateBs}
              onChange={(e) => handleBsDate(e.target.value)}
              placeholder="2082.05.12"
              className="font-mono"
            />
          </FormField>

          <FormField label="Date (AD, optional)" htmlFor="bill-ad">
            <Input id="bill-ad" type="date" value={form.billDateAd} onChange={(e) => set("billDateAd", e.target.value)} />
          </FormField>

          <FormField label="Bill type" htmlFor="bill-type">
            <Select
              value={form.isVatBill ? "vat" : "plain"}
              items={{ vat: "VAT bill (with 13% VAT)", plain: "Plain bill (no VAT)" }}
              onValueChange={(v) => v && set("isVatBill", v === "vat")}
            >
              <SelectTrigger id="bill-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vat">VAT bill (pancha/nana — with 13% VAT)</SelectItem>
                <SelectItem value="plain">Plain bill (kachcha — no VAT)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {form.isVatBill && (
            <>
              <FormField label="Taxable amount (Rs.)" htmlFor="bill-taxable">
                <Input
                  id="bill-taxable"
                  value={form.taxable}
                  onChange={(e) => set("taxable", e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder="1000.00"
                  className="text-right tabular-nums"
                />
              </FormField>
              <FormField
                label="VAT (Rs.)"
                htmlFor="bill-vat"
                error={vatCheck && !vatCheck.ok ? vatCheck.message : null}
                hint={vatCheck?.ok ? vatCheck.message : undefined}
              >
                <Input
                  id="bill-vat"
                  value={form.vat}
                  onChange={(e) => set("vat", e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder="130.00"
                  className="text-right tabular-nums"
                />
              </FormField>
            </>
          )}

          <FormField
            label="Bill total (Rs.)"
            htmlFor="bill-total"
            error={totalCheck && !totalCheck.ok ? totalCheck.message : null}
            hint={totalCheck?.ok ? totalCheck.message : undefined}
          >
            <Input
              id="bill-total"
              value={form.total}
              onChange={(e) => set("total", e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="1130.00"
              className="text-right tabular-nums"
            />
          </FormField>

          <FormField label="Note (optional)" htmlFor="bill-note" className="sm:col-span-2">
            <Textarea id="bill-note" value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="e.g. monthly stock from Sita Ram Bhai" />
          </FormField>
        </div>

        {vatCheck?.ok && totalCheck?.ok && (
          <p className="flex items-center gap-1.5 rounded-xl border-2 border-eager-green/30 bg-storybook-green/60 px-3 py-2 text-xs font-bold text-eager-green">
            <CircleCheck size={14} /> The amounts agree with 13% VAT arithmetic.
          </p>
        )}

        {/* ── Photo ─────────────────────────────────────────────────────── */}
        {mode === "create" ? (
          photoFile && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={attachPhoto} onChange={(e) => setAttachPhoto(e.target.checked)} className="size-4 accent-eager-green" />
              Keep the scanned photo with this record (compressed, ~100 KB)
            </label>
          )
        ) : (
          <div className="rounded-xl border-2 border-border p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
              <ImageIcon size={13} /> Photo
            </p>
            {bill?.hasPhoto && !replacePhoto ? (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/bill-photo/${bill.id}`} alt="Bill photo" className="h-16 w-24 rounded-lg border-2 border-border object-cover" />
                <Button variant="ghost" size="sm" onClick={() => void handleRemovePhoto()}>
                  <Trash2 data-icon="inline-start" /> Remove photo
                </Button>
              </div>
            ) : replacePhoto ? (
              <p className="mt-2 text-sm">{replacePhoto.name} — saved with the bill.</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No photo.</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setReplacePhoto(file);
                setWantsNewPhoto(!!file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" className="mt-2" onClick={() => fileInputRef.current?.click()}>
              {bill?.hasPhoto ? "Replace photo" : "Attach a photo"}
            </Button>
            {wantsNewPhoto && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">Compressed to ~100 KB before saving — records stay tiny.</p>
            )}
          </div>
        )}

        {rawPayload && (
          <details className="rounded-xl border-2 border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-muted-foreground select-none">Raw QR data (kept with the record)</summary>
            <pre className="overflow-x-auto border-t-2 border-border px-3 py-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">{rawPayload}</pre>
          </details>
        )}

        {formError && (
          <p className="rounded-xl border-2 border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">{formError}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyForm(): FormState {
  return { vendorName: "", vendorPan: "", billNumber: "", isVatBill: true, billDateBs: "", billDateAd: "", taxable: "", vat: "", total: "", note: "" };
}
