"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { updateProductPrices } from "@/actions/shop-actions";
import type { ProductCardData } from "@/lib/types";
import { formatNPR, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Today's-rate editor for the counter shelf. Sugar, potato and friends change
 * price every morning — tap the product's name on the shelf and fix both rates
 * here without walking to the Stock screen.
 */
export default function PriceEditorDialog({
  product,
  onClose,
}: {
  product: ProductCardData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [retailText, setRetailText] = useState(product.retailPrice ? String(product.retailPrice) : "");
  const [wholesaleText, setWholesaleText] = useState(product.wholesalePrice ? String(product.wholesalePrice) : "");
  const [saving, setSaving] = useState(false);
  const retailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => retailRef.current?.select(), 50);
    return () => window.clearTimeout(id);
  }, []);

  const retail = Number.parseFloat(retailText);
  const wholesale = Number.parseFloat(wholesaleText);
  const retailInvalid = retailText.trim() !== "" && (!Number.isFinite(retail) || retail < 0);
  const wholesaleInvalid = wholesaleText.trim() !== "" && (!Number.isFinite(wholesale) || wholesale < 0);
  const changed =
    (Number.isFinite(retail) && round2(retail) !== product.retailPrice) ||
    (Number.isFinite(wholesale) && round2(wholesale) !== product.wholesalePrice);

  async function save() {
    if (retailInvalid || wholesaleInvalid) return;
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    const response = await updateProductPrices(product.id, {
      retailPrice: retailText.trim() === "" ? product.retailPrice : retail,
      wholesalePrice: wholesaleText.trim() === "" ? product.wholesalePrice : wholesale,
    });
    setSaving(false);
    if (response.ok) {
      toast.success(`${product.name} — today's prices saved.`);
      router.refresh();
      onClose();
    } else {
      toast.error(response.error);
    }
  }

  const retailValue = retailText.trim() === "" ? product.retailPrice : retail;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag size={16} className="text-eager-green" /> {product.name}
          </DialogTitle>
          <DialogDescription>
            Per {product.baseUnit}. Stock on hand: {product.stockQuantity} {product.baseUnit}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wider text-pencil-gray uppercase">Retail rate</span>
            <Input
              ref={retailRef}
              value={retailText}
              onChange={(e) => setRetailText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              inputMode="decimal"
              placeholder="e.g. 85"
              aria-invalid={retailInvalid}
              className={cn("h-11 text-lg font-bold", retailInvalid && "border-destructive")}
            />
            <span className="mt-1 block text-[11px] text-pencil-gray">Walk-in counter price per {product.baseUnit}.</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wider text-pencil-gray uppercase">Wholesale rate</span>
            <Input
              value={wholesaleText}
              onChange={(e) => setWholesaleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              inputMode="decimal"
              placeholder="e.g. 80"
              aria-invalid={wholesaleInvalid}
              className={cn("h-11 text-lg font-bold", wholesaleInvalid && "border-destructive")}
            />
            <span className="mt-1 block text-[11px] text-pencil-gray">Bulk / bora buyers per {product.baseUnit}.</span>
          </label>

          {Number.isFinite(retailValue) && (
            <p className="rounded-xl bg-storybook-green/50 px-3 py-2 text-xs font-semibold text-charcoal">
              New shelf price: {formatNPR(retailValue)} / {product.baseUnit}
            </p>
          )}
          {(retailInvalid || wholesaleInvalid) && (
            <p role="alert" className="text-xs font-bold text-destructive">
              Enter a valid amount (0 or more).
            </p>
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || retailInvalid || wholesaleInvalid} className="min-w-28">
            {saving ? <Loader2 className="animate-spin" /> : null} Save prices
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
