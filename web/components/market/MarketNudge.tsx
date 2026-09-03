"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Addr } from "@/components/ui/Address";
import { cn } from "@/lib/cn";

type Result =
  | { ok: true; hash: `0x${string}`; block: string; side: string; size: number; fills: number; crossed: boolean }
  | { ok: false; error: string };

/**
 * Demo control: places one small crossing order on `marketId` so armed triggers
 * wake now. Stands in for "a trader takes the other side" — normally the market
 * does this on its own. Uses a server key; the visitor signs nothing.
 */
export function MarketNudge({
  marketId,
  pool,
  size = 8,
  label = "Simulate a trade",
  className,
}: {
  marketId?: string;
  pool?: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function go() {
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/cross", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId, pool, size }),
      });
      setRes((await r.json()) as Result);
    } catch (e) {
      setRes({ ok: false, error: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button variant="default" size="sm" disabled={busy} onClick={go}>
        {busy ? "Placing order…" : label}
      </Button>
      {res &&
        (res.ok ? (
          <p className="num text-2xs text-fg-3">
            {res.side} · {res.size} · block {res.block} ·{" "}
            {res.crossed ? (
              <span className="text-executed">crossed — {res.fills} fill(s)</span>
            ) : (
              <span className="text-observing">no fill (touch moved) — try again</span>
            )}{" "}
            <Addr value={res.hash} kind="tx" />
          </p>
        ) : (
          <p className="text-2xs text-failed">{res.error}</p>
        ))}
      <p className="text-2xs text-fg-4">
        Normally the market produces this. Here it&apos;s a button so a trigger fires on cue.
      </p>
    </div>
  );
}
