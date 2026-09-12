"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutDashboard, MoonStar, Package, Receipt, Store, Truck, WifiOff } from "lucide-react";
import { APP_LOCATION, APP_NAME } from "@/lib/constants";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/billing", label: "Counter Billing", icon: Receipt, exact: false },
  { href: "/inventory", label: "Stock / Inventory", icon: Package, exact: false },
  { href: "/khata", label: "Udharo Khata", icon: BookOpen, exact: false },
  { href: "/delivery", label: "Delivery Tracker", icon: Truck, exact: false },
  { href: "/closing", label: "Night Closing", icon: MoonStar, exact: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <>
      {/* Mobile top bar with horizontally scrolling nav */}
      <header className="border-b border-slate-200 bg-white md:hidden">
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Store size={20} />
          </span>
          <div>
            <p className="text-base font-bold leading-tight text-slate-900">{APP_NAME}</p>
            <p className="text-xs leading-tight text-slate-500">{APP_LOCATION}</p>
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
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Store size={24} />
          </span>
          <div>
            <p className="text-lg font-bold leading-tight text-slate-900">{APP_NAME}</p>
            <p className="text-xs leading-tight text-slate-500">{APP_LOCATION}</p>
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
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
