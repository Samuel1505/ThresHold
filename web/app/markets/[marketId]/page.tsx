"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMarket } from "@/hooks/useMarkets";
import { usePoolSnapshot } from "@/hooks/usePoolSnapshot";
import { usePoolTriggers } from "@/hooks/useTriggers";
import { useProbabilityHistory } from "@/hooks/useProbabilityHistory";
import { depthWeightedBps, evaluateGates, midBps, confidence } from "@/lib/probability";
import { Direction } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Addr } from "@/components/ui/Address";
import { Skeleton } from "@/components/ui/Skeleton";
import { StateBadge } from "@/components/ui/StateBadge";
import { ProbabilityGauge } from "@/components/probability/ProbabilityGauge";
import { Sparkline } from "@/components/probability/Sparkline";
import { OrderBookTable } from "@/components/book/OrderBookTable";
import { DepthChart } from "@/components/book/DepthChart";
import { GateChecklist } from "@/components/trigger/GateChecklist";
import { pct, until, nsToDate } from "@/lib/format";

export default function MarketDetail({ params }: { params: { marketId: string } }) {
  const market = useMarket(params.marketId);
  const pool = market.data?.pool;
  const { snapshot, isLoading } = usePoolSnapshot(pool);
  const { triggers } = usePoolTriggers(pool);

  const dw = snapshot ? depthWeightedBps(snapshot, 0n) : null;
  const p = dw?.midBps ?? null;
  const gatesOk = snapshot
    ? evaluateGates(snapshot, {
        thresholdBps: 5000,
        direction: Direction.ABOVE,
        maxSpreadBps: 10_000,
        minDepthPerSide: 0n,
        dwellSec: 5,
      })
        .slice(1, 7)
        .every((g) => g.ok)
    : false;
  const history = useProbabilityHistory(p, gatesOk);

  const gauge = useMemo(() => {
    if (!snapshot) return null;
    if (!snapshot.twoSided)
      return { bps: null, reason: snapshot.bids.length === 0 && snapshot.asks.length === 0 ? "Book empty" : "One-sided book — no valid mid" };
    return { bps: p, reason: "" };
  }, [snapshot, p]);

  const label = market.data ? `${market.data.asset} ${market.data.interval}` : "market";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/markets", label: "Markets" }}
        title={
          <span>
            {label}
            {market.data && market.data.strike !== "0" && (
              <span className="ml-2 text-fg-3">strike {market.data.strike}</span>
            )}
          </span>
        }
        lede="Every number here is derived from the same on-chain reads the handler uses — getBookLevels, getBinaryPoolParams, marketNonce."
        right={
          pool && (
            <Link href={`/triggers/new?market=${params.marketId}`}>
              <Button variant="primary">Arm a trigger →</Button>
            </Link>
          )
        }
      />

      {market.isLoading && <Skeleton className="h-64 w-full" />}
      {market.data === null && !market.isLoading && (
        <Panel className="p-6 text-sm text-fg-3">
          This market isn&apos;t in the live set — it may have expired or the venue moved.
        </Panel>
      )}

      {market.data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          {/* left: gauge + facts + history */}
          <div className="space-y-4">
            <Panel className="flex flex-col items-center px-4 pb-5 pt-6">
              {isLoading && !snapshot ? (
                <Skeleton className="h-44 w-64" />
              ) : (
                <ProbabilityGauge
                  bps={gauge?.bps ?? null}
                  invalidReason={gauge?.reason}
                  state="idle"
                  size={280}
                />
              )}
              {snapshot?.twoSided && (
                <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
                  <MiniStat label="Top mid" value={midBps(snapshot) != null ? pct(midBps(snapshot)!, 2) : "—"} />
                  <MiniStat label="Spread" value={`${(snapshot.spreadBps / 100).toFixed(2)}%`} />
                  <MiniStat label="Confidence" value={`${confidence(snapshot)}`} />
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Market" />
              <dl className="divide-y divide-line text-xs">
                <Row k="Pool" v={<Addr value={pool} />} />
                <Row k="Market nonce" v={<span className="num">{snapshot ? snapshot.marketNonce.toString() : "—"}</span>} />
                <Row
                  k="Expiry"
                  v={
                    <span className="num">
                      {snapshot && snapshot.expiryNs > 0n
                        ? `${nsToDate(snapshot.expiryNs).toISOString().slice(0, 16).replace("T", " ")} · ${until(Math.floor(Number(snapshot.expiryNs / 1_000_000_000n)))}`
                        : until(market.data.expiry)}
                    </span>
                  }
                />
                <Row k="Finalized" v={<span className="num">{snapshot ? String(snapshot.finalized) : "—"}</span>} />
                <Row k="venue" v={<Addr value={market.data.venueId} full={false} />} />
              </dl>
            </Panel>

            <Panel>
              <PanelHeader title="Probability history" sub="this session, in memory" />
              <div className="p-3">
                <Sparkline samples={history} showThreshold={false} height={80} />
              </div>
            </Panel>
          </div>

          {/* right: book, depth, gates, triggers */}
          <div className="space-y-4">
            {snapshot && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Panel>
                  <PanelHeader title="Order book" sub="8 levels a side" />
                  <div className="p-3">
                    <OrderBookTable snap={snapshot} />
                  </div>
                </Panel>
                <Panel>
                  <PanelHeader title="Depth" sub="cumulative notional from the mid" />
                  <div className="p-3">
                    <DepthChart snap={snapshot} />
                  </div>
                </Panel>
              </div>
            )}

            {snapshot && (
              <Panel>
                <PanelHeader title="Gate check" sub="at threshold 50% ABOVE — a preview shape" />
                <GateChecklist
                  gates={evaluateGates(snapshot, {
                    thresholdBps: 5000,
                    direction: Direction.ABOVE,
                    maxSpreadBps: 500,
                    minDepthPerSide: 10n * snapshot.oneCollateral,
                    dwellSec: 5,
                  })}
                />
              </Panel>
            )}

            <Panel>
              <PanelHeader title={`Triggers on this pool · ${triggers.length}`} />
              {triggers.length === 0 ? (
                <div className="px-4 py-5 text-xs text-fg-4">none — be the first.</div>
              ) : (
                <ul className="divide-y divide-line">
                  {triggers.map((t) => (
                    <li key={t.id.toString()} className="flex items-center justify-between px-4 py-2.5">
                      <Link href={`/triggers/${t.id}`} className="num text-sm text-fg-2 hover:text-fg">
                        #{t.id.toString()} · {t.direction === Direction.ABOVE ? "≥" : "≤"} {pct(t.thresholdBps, 0)}
                      </Link>
                      <StateBadge state={t.state} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-fg-2">{v}</dd>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-well py-2">
      <div className="label">{label}</div>
      <div className="num mt-0.5 text-sm text-fg">{value}</div>
    </div>
  );
}
