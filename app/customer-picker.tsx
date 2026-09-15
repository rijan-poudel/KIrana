"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Search, Star, UserRound, X } from "lucide-react";
import type { CustomerOption } from "@/lib/types";
import { formatNPR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Searchable customer picker ("command palette" style). Typing filters by name,
 * phone or area, favourites float to the top, arrows + Enter select, Escape closes.
 * Used on the counter to pin a regular customer and inside checkout for khata bills.
 */
export default function CustomerPicker({
  customers,
  selectedId,
  onSelect,
  allowClear = false,
  label = "Pick a customer",
  popoverWidth,
}: {
  customers: CustomerOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allowClear?: boolean;
  label?: string;
  popoverWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            (c.phone ?? "").toLowerCase().includes(term) ||
            c.address.toLowerCase().includes(term),
        )
      : customers;
    return [...filtered].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
  }, [customers, query]);

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => searchRef.current?.focus(), 20);
    }
  }, [open]);

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = options[highlight];
      if (target) {
        onSelect(target.id);
        setOpen(false);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative" data-customer-picker style={popoverWidth ? { width: popoverWidth } : undefined}>
      <button
        type="button"
        data-picker-trigger
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={selected ? `Customer: ${selected.name}` : label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
          selected
            ? "border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10"
            : "border-border bg-background text-muted-foreground hover:bg-muted",
        )}
      >
        <UserRound size={16} className="shrink-0" />
        {selected ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1 truncate font-semibold text-foreground">
              {selected.isFavorite && <Star size={13} className="fill-amber-400 text-amber-400" />}
              {selected.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {selected.phone || selected.address || "Walk-in"}
              {selected.currentBalance > 0
                ? ` • owes ${formatNPR(selected.currentBalance)}`
                : selected.currentBalance < 0
                  ? ` • advance ${formatNPR(-selected.currentBalance)}`
                  : ""}
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-left">{label}</span>
        )}
        {allowClear && selected && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear customer ${selected.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-background hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(null);
            }}
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown size={16} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 overflow-hidden rounded-xl border-2 border-faded-gray bg-popover text-popover-foreground shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={handleKey}
              placeholder="Search name, phone or area…"
              className="h-9 pl-8 [&::-webkit-search-cancel-button]:hidden"
              role="combobox"
              aria-expanded
            />
          </div>
          <ul role="listbox" className="max-h-64 w-[280px] overflow-y-auto p-1.5">
            {options.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted-foreground">No customer matches “{query}”.</li>
            )}
            {options.map((c, index) => (
              <li key={c.id} role="option" aria-selected={index === highlight}>
                <button
                  type="button"
                  data-picker-option
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                    index === highlight && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {c.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate font-medium">
                      {c.isFavorite && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}
                      {c.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.address}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </span>
                  </span>
                  {c.currentBalance > 0 && (
                    <span className="shrink-0 text-xs font-semibold text-amber-700">{formatNPR(c.currentBalance)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}