"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { describeRange, startOfToday, toDateKey } from "@/lib/utils";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function key(date: Date) {
  return toDateKey(date);
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // weeks run Sunday → Saturday
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function lastMonthRange(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return { from: first, to: endOfMonth(first) };
}

export type ReportsView = { mode: "day"; dateKey: string } | { mode: "range"; fromKey: string; toKey: string };

/**
 * Reports navigation: day stepping (prev/next/pick/Today) plus range presets
 * (week/month/custom) that switch the page into range mode via ?from=&to=.
 */
export default function DateNav({ view }: { view: ReportsView }) {
  const router = useRouter();

  function goDay(next: Date) {
    router.push(`/reports?date=${key(next)}`);
  }

  function goRange(from: Date, to: Date) {
    router.push(`/reports?from=${key(from)}&to=${key(to)}`);
  }

  const today = startOfToday();

  if (view.mode === "day") {
    const picked = new Date(view.dateKey + "T00:00:00");
    const isToday = view.dateKey === key(today);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => goDay(new Date(picked.getTime() - 86400000))}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" aria-label="Next day" onClick={() => goDay(new Date(picked.getTime() + 86400000))}>
          <ChevronRight />
        </Button>
        <div className="relative">
          <CalendarDays size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            value={view.dateKey}
            onChange={(e) => e.target.value && goDay(new Date(e.target.value + "T00:00:00"))}
            aria-label="Pick a day"
            className="w-[170px] pl-8"
          />
        </div>
        {isToday ? (
          <span className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">Today</span>
        ) : (
          <Button variant="outline" onClick={() => goDay(today)} className="font-semibold">
            Today
          </Button>
        )}
        <Button variant="outline" onClick={() => goRange(startOfWeek(picked), picked)}>
          <CalendarRange /> Range view
        </Button>
        <p className="w-full text-sm text-muted-foreground sm:w-auto">
          Showing {WEEKDAYS[picked.getDay()]}, {formatDate(picked)}
        </p>
      </div>
    );
  }

  // Range mode: presets + custom from/to pickers + back to day view.
  const from = new Date(view.fromKey + "T00:00:00");
  const to = new Date(view.toKey + "T00:00:00");
  const thisWeekFrom = startOfWeek(today);
  const thisMonthFrom = startOfMonth(today);
  const prev = lastMonthRange(today);

  const presets = [
    { label: "This week", from: thisWeekFrom, to: today },
    { label: "This month", from: thisMonthFrom, to: today },
    { label: "Last month", from: prev.from, to: prev.to },
    { label: "Last 30 days", from: new Date(today.getTime() - 29 * 86400000), to: today },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => goDay(today)}>
        <X /> Day view
      </Button>
      {presets.map((p) => {
        const active = key(p.from) === view.fromKey && key(p.to) === view.toKey;
        return (
          <Button
            key={p.label}
            variant={active ? "default" : "outline"}
            onClick={() => goRange(p.from, p.to)}
            aria-pressed={active}
          >
            {p.label}
          </Button>
        );
      })}
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={view.fromKey}
          max={view.toKey}
          onChange={(e) => e.target.value && goRange(new Date(e.target.value + "T00:00:00"), to)}
          aria-label="Range start"
          className="w-[150px]"
        />
        <span className="text-sm text-muted-foreground">→</span>
        <Input
          type="date"
          value={view.toKey}
          min={view.fromKey}
          onChange={(e) => e.target.value && goRange(from, new Date(e.target.value + "T00:00:00"))}
          aria-label="Range end"
          className="w-[150px]"
        />
      </div>
      <p className="w-full text-sm text-muted-foreground sm:w-auto">Showing {describeRange(view.fromKey, view.toKey)}</p>
    </div>
  );
}
