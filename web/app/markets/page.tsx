"use client";

import { useMarkets } from "@/hooks/useMarkets";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { MarketListRow } from "@/components/market/MarketListRow";
import { until } from "@/lib/format";

export default function MarketsPage() {
  const { data, isLoading, isError, error } = useMarkets();
  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live binary markets"
        lede="Trading now on the DreamDEX venue. Probability is re-derived from on-chain order-book reads — the same reads the handler uses — never from the indexer, which lags."
      />

      <Panel>
        <div className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr_0.9fr_0.7fr] gap-2 border-b border-line px-4 py-2 text-2xs uppercase tracking-wider text-fg-4">
          <span>Market</span>
          <span>P(YES)</span>
          <span>Top mid</span>
          <span>Spread</span>
          <span>Min depth/side</span>
          <span className="text-right">Status</span>
        </div>

        {isLoading && (
          <div className="space-y-px p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <div className="px-4 py-8 text-sm text-fg-3">
            Couldn&apos;t reach the market indexer ({String(error?.message ?? "")}). Probability and
            trigger state don&apos;t depend on it — but discovery does.
          </div>
        )}

        {data?.length === 0 && !isLoading && (
          <div className="px-4 py-8 text-sm text-fg-3">
            No live markets on this venue right now. Windows are minutes to hours — check back, or the
            venue id moved (docs/06).
          </div>
        )}

        {data?.map((m) => (
          <div key={m.marketId} className="group">
            <MarketListRow market={m} nowSec={nowSec} />
          </div>
        ))}
      </Panel>

      {data && data.length > 0 && (
        <p className="text-xs text-fg-4">
          Next expiry {until(Math.min(...data.map((m) => m.expiry)), nowSec)} · furthest{" "}
          {until(Math.max(...data.map((m) => m.expiry)), nowSec)}.
        </p>
      )}
    </div>
  );
}
