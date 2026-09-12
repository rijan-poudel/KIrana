"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Package, PackagePlus, Pencil, Search, Trash2, X } from "lucide-react";
import type { ProductCardData, ProductInput } from "@/lib/types";
import { formatNPR, formatQuantity } from "@/lib/format";
import { LOW_STOCK_THRESHOLD, UNITS } from "@/lib/constants";
import { createProduct, deleteProduct, updateProduct } from "@/actions/shop-actions";

type Banner = { kind: "success" | "error"; message: string } | null;

export default function InventoryClient({ products }: { products: ProductCardData[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCardData | null>(null);
  const [deleting, setDeleting] = useState<ProductCardData | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        (p.barcode ?? "").toLowerCase().includes(term),
    );
  }, [products, term]);

  const lowCount = products.filter((p) => p.stockQuantity <= LOW_STOCK_THRESHOLD).length;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: ProductCardData) {
    setEditing(product);
    setFormOpen(true);
  }

  function handleSaved(message: string) {
    setFormOpen(false);
    setBanner({ kind: "success", message });
    router.refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    const response = await deleteProduct(deleting.id);
    if (response.ok) {
      setDeleting(null);
      setBanner({ kind: "success", message: `${deleting.name} removed from inventory.` });
      router.refresh();
    } else {
      setDeleting(null);
      setBanner({ kind: "error", message: response.error });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Stock / Inventory</h1>
          <p className="mt-1 text-slate-500">
            {products.length} products • {lowCount} low on stock (alert at ≤ {LOW_STOCK_THRESHOLD} units)
          </p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary h-12 text-base">
          <PackagePlus size={18} /> Add Product
        </button>
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

      <div className="relative mt-5">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="text"
          placeholder="Search by name, category or barcode…"
          className="input pl-10"
        />
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Stock</th>
                <th className="px-4 py-3 text-right font-semibold">Retail Price</th>
                <th className="px-4 py-3 text-right font-semibold">Wholesale Price</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    <Package size={28} className="mx-auto mb-2 text-slate-300" />
                    No products found. {products.length === 0 ? "Add your first product to get started." : ""}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const out = p.stockQuantity <= 0;
                  const low = !out && p.stockQuantity <= LOW_STOCK_THRESHOLD;
                  return (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{p.name}</p>
                        {p.barcode && <p className="font-mono text-xs text-slate-400">{p.barcode}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.category}</td>
                      <td className="px-4 py-3">
                        {out ? (
                          <span className="badge-red">Out of stock</span>
                        ) : low ? (
                          <span className="badge-amber">Low — {formatQuantity(p.stockQuantity)} {p.unit}</span>
                        ) : (
                          <span className="badge-emerald">
                            {formatQuantity(p.stockQuantity)} {p.unit}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNPR(p.retailPrice)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNPR(p.wholesalePrice)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            aria-label={`Edit ${p.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(p)}
                            aria-label={`Delete ${p.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <ProductFormModal product={editing} onClose={() => setFormOpen(false)} onSaved={handleSaved} />
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)} role="dialog" aria-modal="true">
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">Delete product?</h2>
            <p className="mt-2 text-sm text-slate-600">
              <strong>{deleting.name}</strong> will be removed from the inventory. This cannot be undone. Products with
              past sales history cannot be deleted — set their stock to 0 instead.
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} className="btn-danger flex-1">
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductCardData | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = product !== null;
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [retailPrice, setRetailPrice] = useState(product ? String(product.retailPrice) : "");
  const [wholesalePrice, setWholesalePrice] = useState(product ? String(product.wholesalePrice) : "");
  const [stockQuantity, setStockQuantity] = useState(product ? String(product.stockQuantity) : "");
  const [unit, setUnit] = useState(product?.unit ?? "pcs");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const input: ProductInput = {
      name,
      category,
      barcode,
      retailPrice: Number.parseFloat(retailPrice),
      wholesalePrice: Number.parseFloat(wholesalePrice),
      stockQuantity: Number.parseFloat(stockQuantity),
      unit,
    };
    setSubmitting(true);
    const response = isEdit ? await updateProduct(product.id, input) : await createProduct(input);
    setSubmitting(false);
    if (response.ok) onSaved(isEdit ? `${input.name.trim()} updated.` : `${input.name.trim()} added to inventory.`);
    else setError(response.error);
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Product form">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold text-slate-900">{isEdit ? "Edit Product" : "Add Product"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="p-name">
              Product name *
            </label>
            <input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Rice (Mansuli)"
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="p-category">
                Category
              </label>
              <input
                id="p-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Staples"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="p-unit">
                Unit *
              </label>
              <select id="p-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="input">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="p-retail">
                Retail price (Rs.) *
              </label>
              <input
                id="p-retail"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="p-wholesale">
                Wholesale price (Rs.) *
              </label>
              <input
                id="p-wholesale"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                className="input"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="p-stock">
                Stock quantity *
              </label>
              <input
                id="p-stock"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="p-barcode">
                Barcode (optional)
              </label>
              <input
                id="p-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type code"
                className="input font-mono"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
              {isEdit ? "Save Changes" : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
