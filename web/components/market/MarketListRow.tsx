"use client";

import Link from "next/link";
import { usePoolSnapshot } from "@/hooks/usePoolSnapshot";
import { depthWeightedBps, midBps } from "@/lib/probability";
import { pct, until, collateral } from "@/lib/format";
import type { MarketRow } from "@/lib/types";
import { cn } from "@/lib/cn";

/** One row of the markets table — probability re-derived on-chain, never the indexer. */
export function MarketListRow({ market, nowSec }: { market: MarketRow; nowSec: number }) {
  const { snapshot, isLoading } = usePoolSnapshot(market.pool, 4000);
  const mid = snapshot ? midBps(snapshot) : null;
  const dw = snapshot ? depthWeightedBps(snapshot, 0n) : null;
  const minutesLeft = Math.round((market.expiry - nowSec) / 60);
  const tradable = snapshot ? snapshot.twoSided && !snapshot.finalized && !snapshot.expired : false;

  const depthOk = snapshot?.twoSided
    ? collateral(
        (dw?.bidNotional ?? 0n) < (dw?.askNotional ?? 0n) ? dw!.bidNotional : dw!.askNotional,
        snapshot.oneCollateral,
        0,
      )
    : "—";

  return (
    <Link
      href={`/markets/${market.marketId}`}
      className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_0.7fr] items-center gap-2 border-b border-line px-4 py-3 text-sm transition-colors duration-fast ease-out hover:bg-panel-2"
    >
      <div className="min-w-0">
        <div className="text-fg">
          {market.asset} <span className="text-fg-3">{market.interval}</span>
        </div>
        <div className="num text-2xs text-fg-4">nonce {market.nonce.toString()}</div>
      </div>

      <div className="num tabular-nums">
        {isLoading && !snapshot ? (
          <span className="text-fg-4">…</span>
        ) : dw?.midBps != null && snapshot?.twoSided ? (
          <span className="text-fg">{pct(dw.midBps, 1)}</span>
        ) : (
          <span className="text-fg-4">no mid</span>
        )}
        <span className="ml-1 text-2xs text-fg-4">depth-wtd</span>
      </div>

      <div className="num tabular-nums text-fg-2">
        {mid != null ? pct(mid, 2) : "—"}
        <span className="ml-1 text-2xs text-fg-4">top</span>
      </div>

      <div className="num tabular-nums text-fg-3">
        {snapshot?.twoSided ? `${(snapshot.spreadBps / 100).toFixed(2)}%` : "—"}
      </div>

      <div className="num tabular-nums text-fg-3">{depthOk}</div>

      <div className="flex justify-end">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-2xs",
            tradable
              ? "border-executed/30 text-executed"
              : "border-line text-fg-4",
          )}
        >
          {tradable ? "tradable" : minutesLeft <= 0 ? "expired" : "thin"}
        </span>
      </div>
    </Link>
  );
}
