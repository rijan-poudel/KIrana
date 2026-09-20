"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  BarChart3,
  BookOpen,
  Package,
  PackagePlus,
  ReceiptText,
  Search,
  ShoppingCart,
  Store,
  Truck,
} from "lucide-react";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    label: "Billing",
    items: [
      { id: "counter", href: "/", label: "Counter", hint: "Scan, search & checkout", icon: ShoppingCart },
    ],
  },
  {
    label: "Manage",
    items: [
      { id: "stock", href: "/inventory", label: "Stock", hint: "Products, purchases & levels", icon: Package },
      { id: "reorder", href: "/reorder", label: "Reorder Sheet", hint: "Low stock with suggested quantities", icon: PackagePlus },
      { id: "khata", href: "/khata", label: "Udharo Khata", hint: "Credit balances & payments", icon: BookOpen },
      { id: "delivery", href: "/delivery", label: "Deliveries", hint: "Wholesale dispatches", icon: Truck },
      { id: "reports", href: "/reports", label: "Reports", hint: "Day & range reports, CSV, backups & phone QR", icon: BarChart3 },
      { id: "bills", href: "/bills", label: "Bills", hint: "Vendor bills, QR records & VAT", icon: ReceiptText },
    ],
  },
] as const;

export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Jump to a screen"
      contentClassName="fixed inset-x-0 top-[10vh] z-[60] mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/10"
      overlayClassName="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search size={18} className="shrink-0 text-muted-foreground" />
        <Command.Input
          placeholder={`Go to a screen… (${APP_NAME})`}
          className="h-14 w-full bg-transparent text-base placeholder:text-muted-foreground focus:outline-none"
        />
        <kbd className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
          ESC
        </kbd>
      </div>

      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
          No screens match — try “stock” or “khata”.
        </Command.Empty>

        {GROUPS.map((group) => (
          <Command.Group key={group.label} heading={group.label}>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={item.id}
                  value={item.label}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar text-sidebar-foreground">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block text-xs text-muted-foreground">{item.hint}</span>
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>
        ))}

        <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Store size={12} /> {APP_NAME} · {APP_LOCATION}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            Help me find: Counter, Stock, Reorder, Khata, Deliveries, Reports
          </span>
        </div>
      </Command.List>
    </Command.Dialog>
  );
}