"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Boxes, ChevronRight, PackagePlus, Printer, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { formatNPR, formatQuantity, round2 } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/lib/types";

const LEAD_TIME_DAYS = 7;

type VelocityMap = Map<string, number>;

export default function ReorderClient({
  products,
  velocity,
}: {
  products: ProductCardData[];
  velocity: VelocityMap;
}) {
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return products.filter((p) =>
      term
        ? p.name.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          (p.barcode ?? "").includes(term)
        : true,
    );
  }, [products, term]);

  const outCount = products.filter((p) => p.stockQuantity <= 0).length;
  const lowCount = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockAt).length;

  function suggestedOrder(product: ProductCardData): number {
    const daily = (velocity.get(product.id) ?? 0) / 30;
    const needed = Math.ceil(daily * LEAD_TIME_DAYS);
    const shortfall = needed - product.stockQuantity;
    return Math.max(0, round2(shortfall));
  }

  function printSheet() {
    window.print();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Boxes size={24} /> Reorder Sheet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Products below their low-stock threshold with suggested quantities based on the last 30 days of sales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={printSheet}>
            <Printer size={18} /> Print
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative min-w-[200px] flex-1">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Badge variant={outCount > 0 ? "destructive" : "default"} className="px-3 py-1.5">
            Out of stock: {outCount}
          </Badge>
          <Badge variant={lowCount > 0 ? "warning" : "default"} className="px-3 py-1.5">
            Low stock: {lowCount}
          </Badge>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted-foreground">
          {products.length === 0 ? "All products are well stocked. राम्रो!" : "No products match the search."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm md:min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">On hand</th>
                <th className="px-4 py-3 text-right font-semibold">Alert</th>
                <th className="px-4 py-3 text-right font-semibold">Daily avg</th>
                <th className="px-4 py-3 text-right font-semibold">Suggested order</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const daily = (velocity.get(p.id) ?? 0) / 30;
                const suggest = suggestedOrder(p);
                const out = p.stockQuantity <= 0;
                const low = !out && p.stockQuantity <= p.lowStockAt;
                return (
                  <tr key={p.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{p.name}</p>
                      {p.barcode && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.barcode}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Badge variant={out ? "destructive" : low ? "warning" : "success"}>
                        {formatQuantity(p.stockQuantity)} {p.baseUnit}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatQuantity(p.lowStockAt)} {p.baseUnit}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm font-mono">
                      {daily > 0 ? `${formatQuantity(round2(daily))} ${p.baseUnit}/day` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {suggest > 0 ? (
                        <span className="font-bold text-emerald-700">{formatQuantity(suggest)} {p.baseUnit}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {suggest > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            const url = `/inventory?receive=${p.id}&qty=${suggest}&unit=${p.baseUnit}`;
                            window.open(url, "_blank");
                          }}
                        >
                          <PackagePlus /> Receive
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        @media print {
          .no-print { display: none !important; }
          .card { box-shadow: none; border: 1px solid #e5e7eb; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}