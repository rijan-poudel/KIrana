"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Package,
  PackagePlus,
  ReceiptText,
  ShoppingBasket,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; shortcut: string; exact: boolean };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Billing",
    items: [
      { href: "/", label: "Counter", icon: ShoppingCart, shortcut: "1", exact: true },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/inventory", label: "Stock", icon: Package, shortcut: "2", exact: false },
      { href: "/reorder", label: "Reorder", icon: PackagePlus, shortcut: "6", exact: false },
      { href: "/khata", label: "Udharo Khata", icon: BookOpen, shortcut: "3", exact: false },
      { href: "/delivery", label: "Deliveries", icon: Truck, shortcut: "4", exact: false },
      { href: "/reports", label: "Reports", icon: BarChart3, shortcut: "5", exact: false },
      { href: "/bills", label: "Bills", icon: ReceiptText, shortcut: "7", exact: false },
    ],
  },
];

function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * A single source of truth for the numbered screen shortcuts (1–5) so a
 * cashier can move around the whole system without touching the mouse.
 * Only fires when focus isn't in an input/select, so typing is never hijacked.
 */
function useScreenShortcuts() {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox']")) return;
      const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.shortcut === event.key);
      if (!item) return;
      event.preventDefault();
      if (!isActive(item, window.location.pathname)) router.push(item.href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

export default function Sidebar() {
  const pathname = usePathname();
  useScreenShortcuts();

  return (
    <>
      {/* ── Mobile: green top bar with horizontally scrolling nav ─────────── */}
      <header className="sticky top-0 z-40 border-b-2 border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden">
        <div className="flex items-center gap-2.5 px-4 pt-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-eager-green text-white">
            <ShoppingBasket size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base leading-tight font-extrabold">{APP_NAME}</p>
            <p className="truncate text-[11px] leading-tight text-sidebar-foreground/60">{APP_LOCATION}</p>
          </div>
          <span className="rounded-lg border-2 border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
            OFFLINE
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2.5">
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "button-04 group flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-extrabold whitespace-nowrap [--btn-radius:12px]",
                  active ? "[--btn-base:var(--color-eager-green)]" : "[--btn-base:var(--sidebar-accent)]",
                )}
              >
                <Icon size={16} />
                <div className="span-wrapper">
                  <span className="span-text">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ── Desktop: deep-pine rail ──────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r-2 border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-4 pt-6 pb-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-eager-green text-white">
            <ShoppingBasket size={22} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg leading-tight font-extrabold">{APP_NAME}</p>
            <p className="truncate text-[11px] leading-tight text-sidebar-foreground/55">{APP_LOCATION}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[11px] font-extrabold tracking-widest text-sidebar-foreground/40 uppercase">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item, pathname);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "button-04 group relative flex items-center gap-3 justify-start rounded-xl px-3 py-2.5 text-[15px] font-extrabold [--btn-radius:12px]",
                        active ? "[--btn-base:var(--color-eager-green)]" : "[--btn-base:var(--sidebar-accent)]",
                      )}
                    >
                      <Icon
                        size={20}
                        className={cn(
                          "shrink-0 transition-transform group-hover:scale-110",
                          !active && "text-sidebar-foreground/60 group-hover:text-white",
                        )}
                      />
                      <div className="span-wrapper min-w-0 flex-1">
                        <span className="span-text">{item.label}</span>
                      </div>
                      {active && (
                        <ChevronRight
                          size={16}
                          className="shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5"
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}