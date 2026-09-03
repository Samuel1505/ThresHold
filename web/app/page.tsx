"use client";

import Link from "next/link";
import { useMyTriggers } from "@/hooks/useTriggers";
import { useRegistryInfo, MIN_SUB_BALANCE } from "@/hooks/useRegistry";
import { useRecentExecutions } from "@/hooks/useExecutions";
import { useMarkets } from "@/hooks/useMarkets";
import { PageHeader } from "@/components/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Addr } from "@/components/ui/Address";
import { TriggerCard } from "@/components/trigger/TriggerCard";
import { STATE_NAME, TriggerState } from "@/lib/types";
import { pct, stt, ago } from "@/lib/format";
import { cn } from "@/lib/cn";

export default function Dashboard() {
  const { triggers, active } = useMyTriggers();
  const reg = useRegistryInfo();
  const execs = useRecentExecutions();
  const markets = useMarkets();

  const byState = triggers.reduce<Record<number, number>>((acc, t) => {
    acc[t.state] = (acc[t.state] ?? 0) + 1;
    return acc;
  }, {});
  const marketLabel = (pool: string) => {
    const m = markets.data?.find((x) => x.pool.toLowerCase() === pool.toLowerCase());
    return m ? `${m.asset} ${m.interval}` : undefined;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Probabilistic automation for DreamDEX Event Contracts"
        lede="A contract executes an action when a binary market's capital-backed belief crosses a threshold and holds there — not after the event has already happened. No keeper."
        right={
          <Link href="/markets">
            <Button variant="primary">Browse markets →</Button>
          </Link>
        }
      />

      {/* flow explainer */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        {[
          ["Belief", "A DreamDEX binary market's depth-weighted mid is a probability, maintained by adversaries who lose money for mispricing it."],
          ["Threshold", "You set a level and a dwell. The signal is re-read on-chain on every fill — never trusted from the event payload."],
          ["Action", "Held past the dwell, an allow-listed contract call fires — in the same block as the fill that qualified it."],
        ].map(([h, b], i) => (
          <div key={h} className="bg-panel p-4">
            <div className="flex items-center gap-2">
              <span className="num text-xs text-fg-4">{i + 1}</span>
              <span className="label">{h}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg-3">{b}</p>
          </div>
        ))}
      </div>

      {/* stat row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatPanel
          label="Registry balance"
          value={reg.balanceLoaded ? `${stt(reg.balance, 2)} STT` : "…"}
          tone={reg.underMin ? "failed" : reg.warn ? "observing" : "fg"}
          sub={reg.balanceLoaded ? `min ${stt(MIN_SUB_BALANCE, 0)} · pays callbacks` : ""}
        />
        <StatPanel label="Your active triggers" value={String(active.length)} sub={`${triggers.length} total`} />
        <StatPanel label="Watched pools" value={String(reg.subscribedPools.length)} sub="one subscription each" />
        <StatPanel
          label="Live markets"
          value={markets.data ? String(markets.data.length) : "…"}
          sub={markets.isError ? "indexer unreachable" : "trading now"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* active triggers */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label">Your triggers</h2>
            <Link href="/triggers" className="text-xs text-fg-3 hover:text-fg-2">
              all triggers →
            </Link>
          </div>
          {triggers.length === 0 ? (
            <Panel className="p-6 text-sm text-fg-3">
              No triggers yet. Pick a market and arm one — a threshold, a dwell, and an action.
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {triggers.slice(0, 6).map((t) => (
                <TriggerCard key={t.id.toString()} trigger={t} marketLabel={marketLabel(t.pool)} />
              ))}
            </div>
          )}

          {triggers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(byState).map(([s, n]) => (
                <span key={s} className="num rounded border border-line bg-panel px-2 py-1 text-xs text-fg-3">
                  {STATE_NAME[Number(s) as TriggerState]} · {n}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* recent executions */}
        <Panel>
          <PanelHeader title="Recent executions" sub="TriggerExecuted, on-chain" />
          <div className="divide-y divide-line">
            {execs.isLoading && <div className="px-4 py-6 text-xs text-fg-4">scanning…</div>}
            {execs.data?.length === 0 && !execs.isLoading && (
              <div className="px-4 py-6 text-xs text-fg-4">nothing in the recent window.</div>
            )}
            {execs.data?.slice(0, 8).map((e) => (
              <div key={e.tx} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="num text-sm text-fg">#{e.id.toString()} · {pct(e.probabilityBps, 1)}</div>
                  <div className="num text-2xs text-fg-4">block {e.block.toString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn("text-2xs", e.success ? "text-executed" : "text-failed")}
                  >
                    {e.success ? "ok" : "reverted"}
                  </span>
                  <Addr value={e.tx} kind="tx" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatPanel({
  label,
  value,
  sub,
  tone = "fg",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "fg" | "observing" | "failed";
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3.5">
      <div className="label">{label}</div>
      <div
        className={cn(
          "num mt-1.5 text-lg tabular-nums",
          tone === "observing" && "text-observing",
          tone === "failed" && "text-failed",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-2xs text-fg-4">{sub}</div> : null}
    </div>
  );
}
