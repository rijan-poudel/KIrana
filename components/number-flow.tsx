"use client";

/**
 * Animated numbers, site-wide, via NumberFlow — the official React adapter
 * (https://number-flow.barvian.me) wrapping Maxwell Barvian's MIT-licensed
 * `number-flow` custom element. Copyright (c) 2024 Maxwell Barvian, MIT.
 *
 * The wrappers keep the shop's own formatting conventions from lib/format.ts:
 * "Rs. 1,234.50" money, grouped quantities, deterministic en-US grouping so
 * server-rendered markup and client hydration stay byte-identical. Reduced
 * motion is respected by NumberFlow itself — do not disable that here.
 */

import NumberFlow from "@number-flow/react";
import { useEffect, useRef, useState } from "react";
import { round2 } from "@/lib/format";
import { cn } from "@/lib/utils";

const NPR_FORMAT = { maximumFractionDigits: 2, minimumFractionDigits: 2 };
const QTY_FORMAT = { maximumFractionDigits: 2 };
const LOCALES = "en-US";

type FlowProps = {
  value: number;
  className?: string;
  /** Set for values that change rapidly (typing quantities, discounts) — hints the compositor. */
  willChange?: boolean;
};

/** Money that rolls between values: "Rs. 1,234.50". */
export function NprFlow({ value, className, willChange }: FlowProps) {
  return (
    <NumberFlow
      value={round2(value)}
      format={NPR_FORMAT}
      prefix="Rs. "
      locales={LOCALES}
      willChange={willChange}
      className={cn("tabular-nums", className)}
    />
  );
}

/** Grouped quantity that rolls: "1,500" / "2.5". */
export function QtyFlow({ value, className, willChange }: FlowProps) {
  return (
    <NumberFlow
      value={round2(value)}
      format={QTY_FORMAT}
      locales={LOCALES}
      willChange={willChange}
      className={cn("tabular-nums", className)}
    />
  );
}

/**
 * Recipe C — a statistic that holds a stable starting value (0 by default) and
 * rolls to its final value the first time it enters the viewport. Falls back
 * to an immediate reveal when IntersectionObserver is unavailable. Renders
 * inline so it can sit inside existing paragraphs and stat cards.
 */
export function CountUpNpr({
  value,
  className,
  start = 0,
  trend = 1,
}: FlowProps & { start?: number; trend?: 1 | -1 | 0 }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setRevealed(true);
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} className="inline-block">
      <NumberFlow
        // Seed without animation, then the single reveal update animates.
        animated={revealed}
        value={round2(revealed ? value : start)}
        format={NPR_FORMAT}
        prefix="Rs. "
        locales={LOCALES}
        trend={trend}
        className={cn("tabular-nums", className)}
      />
    </span>
  );
}