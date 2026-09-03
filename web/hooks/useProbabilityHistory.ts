"use client";

import { useEffect, useRef, useState } from "react";

export interface Sample {
  t: number; // unix ms
  bps: number; // depth-weighted mid, bps
  ok: boolean; // all gates passing at this sample
}

/**
 * Keeps the last `capacity` probability samples in memory (docs/10: no database).
 * Feed it the current depth-weighted mid on every poll.
 */
export function useProbabilityHistory(current: number | null, allGatesOk: boolean, capacity = 120) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (current === null) return;
    // dedupe identical consecutive reads but always keep time moving
    const now = Date.now();
    setSamples((prev) => {
      const next = [...prev, { t: now, bps: current, ok: allGatesOk }];
      return next.length > capacity ? next.slice(next.length - capacity) : next;
    });
    last.current = current;
  }, [current, allGatesOk, capacity]);

  return samples;
}
