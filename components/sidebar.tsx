"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Package, ShoppingCart, Store, Truck, WifiOff } from "lucide-react";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";

const NAV_ITEMS = [
  { href: "/", label: "Counter", icon: ShoppingCart, exact: true },
  { href: "/inventory", label: "Stock", icon: Package, exact: false },
  { href: "/khata", label: "Udharo Khata", icon: BookOpen, exact: false },
  { href: "/delivery", label: "Deliveries", icon: Truck, exact: false },
  { href: "/reports", label: "Reports", icon: BarChart3, exact: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <>
      {/* Mobile top bar with horizontally scrolling nav */}
      <header className="border-b border-border bg-card md:hidden">
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store size={20} />
          </span>
          <div>
            <p className="text-base leading-tight font-bold text-foreground">{APP_NAME}</p>
            <p className="text-xs leading-tight text-muted-foreground">{APP_LOCATION}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Store size={24} />
          </span>
          <div>
            <p className="text-lg leading-tight font-bold text-foreground">{APP_NAME}</p>
            <p className="text-xs leading-tight text-muted-foreground">{APP_LOCATION}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base font-semibold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
              <WifiOff size={14} /> 100% Offline
            </p>
            <p className="mt-1 text-[11px] leading-snug text-emerald-700">
              All data stays on this computer in the local SQLite database (prisma/shop.db). No internet needed.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
