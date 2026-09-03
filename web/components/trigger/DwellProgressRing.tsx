"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { duration } from "@/lib/format";

/**
 * Countdown while OBSERVING (docs/09). Reads `dwellStart` + `dwellSec` off the
 * trigger and ticks locally — the signal must persist against arbitrage for the
 * whole ring.
 */
export function DwellProgressRing({
  dwellStart,
  dwellSec,
  size = 72,
  className,
}: {
  dwellStart: bigint;
  dwellSec: number;
  size?: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 250);
    return () => clearInterval(t);
  }, []);

  const start = Number(dwellStart);
  const elapsed = Math.max(0, now - start);
  const remaining = Math.max(0, dwellSec - elapsed);
  const frac = dwellSec > 0 ? Math.min(1, elapsed / dwellSec) : 1;

  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--observing)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <span className="num absolute text-sm text-observing tabular-nums">
        {remaining <= 0 ? "0s" : duration(remaining)}
      </span>
    </div>
  );
}
