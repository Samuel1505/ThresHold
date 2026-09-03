"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useTrigger } from "@/hooks/useTriggers";
import { usePoolSnapshot } from "@/hooks/usePoolSnapshot";
import { useTriggerFeed } from "@/hooks/useTriggerFeed";
import { useProbabilityHistory } from "@/hooks/useProbabilityHistory";
import { useVault } from "@/hooks/useVault";
import { useMarket } from "@/hooks/useMarkets";
import { useCancelTrigger } from "@/hooks/useWrites";
import { depthWeightedBps, evaluateGates } from "@/lib/probability";
import { Direction, isActive, isTerminal, TriggerState } from "@/lib/types";
import { DEMO_VAULT } from "@/lib/addresses";
import { pct, stt, collateral, ago, until, short } from "@/lib/format";
import { explorerTx } from "@/lib/env";
import { PageHeader } from "@/components/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Addr } from "@/components/ui/Address";
import { StateBadge } from "@/components/ui/StateBadge";
import { BeliefToActionFlow } from "@/components/trigger/BeliefToActionFlow";
import { GateChecklist } from "@/components/trigger/GateChecklist";
import { Sparkline } from "@/components/probability/Sparkline";
import { ExecutionCard } from "@/components/trigger/ExecutionCard";

export default function TriggerDetail({ params }: { params: { id: string } }) {
  const id = BigInt(params.id);
  const { address } = useAccount();
  const { trigger, isLoading } = useTrigger(id);
  const { snapshot } = usePoolSnapshot(trigger && isActive(trigger.state) ? trigger.pool : trigger?.pool, 2000);
  const feed = useTriggerFeed(id);
  const vault = useVault(2500);
  const market = useMarket(); // list; find by pool below

  const targetsVault = trigger?.target.toLowerCase() === DEMO_VAULT.toLowerCase();

  const cfg = trigger
    ? {
        thresholdBps: trigger.thresholdBps,
        direction: trigger.direction,
        maxSpreadBps: trigger.maxSpreadBps,
        minDepthPerSide: trigger.minDepthPerSide,
        dwellSec: trigger.dwellSec,
        pinnedNonce: trigger.pinnedNonce,
        expiresAt: trigger.expiresAt === 0n ? undefined : trigger.expiresAt,
        state: trigger.state,
      }
    : null;

  const dw = snapshot && trigger ? depthWeightedBps(snapshot, trigger.minDepthPerSide) : null;
  const p = dw?.midBps ?? null;
  const gates = snapshot && cfg ? evaluateGates(snapshot, cfg) : [];
  const history = useProbabilityHistory(p, gates.slice(1, 8).every((g) => g.ok));

  // fire the pulse once, when we observe the state flip to EXECUTED
  const prev = useRef<TriggerState>();
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!trigger) return;
    if (prev.current === TriggerState.OBSERVING && trigger.state === TriggerState.EXECUTED) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1000);
      return () => clearTimeout(t);
    }
    prev.current = trigger.state;
  }, [trigger?.state]);

  const cancel = useCancelTrigger();
  const canCancel =
    trigger && address && trigger.owner.toLowerCase() === address.toLowerCase() && isActive(trigger.state);

  const exec = feed.find((f) => f.kind === "executed");
  const marketLabel = "market";

  if (isLoading && !trigger) return <Skeleton className="h-96 w-full" />;
  if (!trigger || trigger.state === TriggerState.NONE)
    return (
      <Panel className="p-6 text-sm text-fg-3">
        Trigger #{params.id} doesn&apos;t exist.
      </Panel>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/triggers", label: "Triggers" }}
        title={<span className="num">Trigger #{trigger.id.toString()}</span>}
        lede={
          <span>
            {trigger.direction === Direction.ABOVE ? "Fires when P(YES) rises to " : "Fires when P(YES) falls to "}
            <span className="num text-fg-2">{pct(trigger.thresholdBps, 0)}</span> and holds for{" "}
            <span className="num text-fg-2">{trigger.dwellSec}s</span>.
          </span>
        }
        right={<StateBadge state={trigger.state} />}
      />

      <BeliefToActionFlow
        probabilityBps={p}
        thresholdBps={trigger.thresholdBps}
        direction={trigger.direction}
        dwellStart={trigger.dwellStart}
        dwellSec={trigger.dwellSec}
        state={trigger.state}
        targetLabel={targetsVault ? "DemoVault.derisk()" : `${short(trigger.target)} · ${trigger.selector}`}
        riskySafe={targetsVault ? { risky: vault.risky, safe: vault.safe } : undefined}
        fired={pulse}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {(trigger.state === TriggerState.EXECUTED || trigger.state === TriggerState.FAILED) && (
            <ExecutionCard
              record={{
                probabilityBps: exec ? Number(exec.detail.match(/([\d.]+)%/)?.[1] ?? 0) * 100 : p ?? 0,
                success: trigger.state === TriggerState.EXECUTED,
                execBlock: exec?.block,
                execTx: exec?.tx,
              }}
            />
          )}

          <Panel>
            <PanelHeader
              title="Gate check"
              sub="live — re-evaluated at dispatch, not only at dwell start"
              right={
                isTerminal(trigger.state) ? (
                  <span className="text-2xs text-fg-4">frozen — trigger is terminal</span>
                ) : null
              }
            />
            {snapshot ? (
              <GateChecklist gates={gates} />
            ) : (
              <div className="px-4 py-6 text-xs text-fg-4">reading the pool…</div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Probability since you opened this" sub="in memory, this session" />
            <div className="p-3">
              <Sparkline samples={history} thresholdBps={trigger.thresholdBps} height={100} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Timeline" sub="handler + registry events for this trigger" />
            <ul className="divide-y divide-line">
              {feed.length === 0 && (
                <li className="px-4 py-5 text-xs text-fg-4">
                  waiting for the next callback — a fill on the pool, or the scheduled dwell tick.
                </li>
              )}
              {feed.map((e, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div>
                    <div className="text-sm text-fg-2">{e.detail}</div>
                    <div className="num text-2xs text-fg-4">
                      {e.block ? `block ${e.block.toString()} · ` : ""}
                      {ago(Math.floor(e.at / 1000))}
                    </div>
                  </div>
                  {e.tx && <Addr value={e.tx} kind="tx" />}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* config */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Configuration" />
            <dl className="divide-y divide-line text-xs">
              <Row k="Owner" v={<Addr value={trigger.owner} />} />
              <Row k="Pool" v={<Addr value={trigger.pool} />} />
              <Row k="Pinned nonce" v={<span className="num">{trigger.pinnedNonce.toString()}</span>} />
              <Row k="Direction" v={trigger.direction === Direction.ABOVE ? "rises above" : "falls below"} />
              <Row k="Threshold" v={<span className="num">{pct(trigger.thresholdBps, 1)}</span>} />
              <Row k="Dwell" v={<span className="num">{trigger.dwellSec}s</span>} />
              <Row k="Max spread" v={<span className="num">{(trigger.maxSpreadBps / 100).toFixed(2)}%</span>} />
              <Row
                k="Min depth / side"
                v={<span className="num">{snapshot ? collateral(trigger.minDepthPerSide, snapshot.oneCollateral, 1) : trigger.minDepthPerSide.toString()} tUSDC</span>}
              />
              <Row k="Action" v={<span className="num">{trigger.selector}</span>} />
              <Row k="Gas cap" v={<span className="num">{trigger.actionGasCap.toLocaleString()}</span>} />
              <Row k="Recurring" v={trigger.recurring ? `yes · ${trigger.cooldownSec}s cooldown` : "one-shot"} />
              <Row
                k="Deadline"
                v={<span className="num">{trigger.expiresAt === 0n ? "market expiry" : until(Number(trigger.expiresAt))}</span>}
              />
              {trigger.lastExecutedAt > 0n && (
                <Row k="Last fired" v={<span className="num">{ago(Number(trigger.lastExecutedAt))}</span>} />
              )}
            </dl>
          </Panel>

          {canCancel && (
            <Panel className="p-4 space-y-2">
              <Button
                variant="danger"
                className="w-full"
                disabled={cancel.status === "mining"}
                onClick={() => cancel.cancel(id).catch(() => {})}
              >
                {cancel.status === "mining" ? "Cancelling…" : "Cancel trigger"}
              </Button>
              {cancel.error && <p className="text-2xs text-failed">{cancel.error}</p>}
              <p className="text-2xs text-fg-4">
                Returns <span className="num">CANCELLED</span> and unsubscribes the pool if this is its
                last active trigger.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-right text-fg-2">{v}</dd>
    </div>
  );
}
