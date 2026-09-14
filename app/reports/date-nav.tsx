"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { startOfToday, toDateKey } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Prev / next / pick-a-date / Today controls for the day report. */
export default function DateNav({ dateKey }: { dateKey: string }) {
  const router = useRouter();

  function shift(days: number) {
    const next = new Date(dateKey + "T00:00:00");
    next.setDate(next.getDate() + days);
    router.push(`/reports?date=${toDateKey(next)}`);
  }

  const todayKey = toDateKey(startOfToday());
  const isToday = dateKey === todayKey;
  const picked = new Date(dateKey + "T00:00:00");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => shift(-1)}>
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="icon" aria-label="Next day" onClick={() => shift(1)}>
        <ChevronRight />
      </Button>
      <div className="relative">
        <CalendarDays size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="date"
          value={dateKey}
          onChange={(e) => e.target.value && router.push(`/reports?date=${e.target.value}`)}
          aria-label="Pick a day"
          className="w-[170px] pl-8"
        />
      </div>
      {isToday ? (
        <span className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">Today</span>
      ) : (
        <Button variant="outline" render={<Link href="/reports" />} className="font-semibold">
          Today
        </Button>
      )}
      <p className="w-full text-sm text-muted-foreground sm:w-auto">
        Showing {WEEKDAYS[picked.getDay()]}, {formatDate(picked)}
      </p>
    </div>
  );
}
