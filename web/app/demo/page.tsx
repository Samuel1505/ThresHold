"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { useTrigger } from "@/hooks/useTriggers";
import { usePoolSnapshot } from "@/hooks/usePoolSnapshot";
import { useVault } from "@/hooks/useVault";
import { useVaultActions } from "@/hooks/useWrites";
import { depthWeightedBps } from "@/lib/probability";
import { Direction, TriggerState } from "@/lib/types";
import { HANDLER } from "@/lib/addresses";
import { stt, pct, ago } from "@/lib/format";
import { explorerTx } from "@/lib/env";
import { PageHeader } from "@/components/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Addr } from "@/components/ui/Address";
import { StateBadge } from "@/components/ui/StateBadge";
import { BeliefToActionFlow } from "@/components/trigger/BeliefToActionFlow";
import { MarketNudge } from "@/components/market/MarketNudge";
import { NumberInput } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

const EXECUTED = parseAbiItem(
  "event TriggerExecuted(uint256 indexed id, uint16 probabilityBps, bool success, bytes32 returndataHash)",
);

export default function DemoPage() {
  return (
    <Suspense fallback={null}>
      <Demo />
    </Suspense>
  );
}

function Demo() {
  const qp = useSearchParams();
  const [triggerId, setTriggerId] = useState<number>(Number(qp.get("trigger") ?? 3));
  const { trigger } = useTrigger(BigInt(triggerId));
  const { snapshot } = usePoolSnapshot(trigger?.pool, 1500);
  const vault = useVault(1500);
  const actions = useVaultActions();
  const client = usePublicClient();

  const dw = snapshot && trigger ? depthWeightedBps(snapshot, trigger.minDepthPerSide) : null;
  const p = dw?.midBps ?? null;

  // pulse when the vault de-risks
  const prevRisky = useRef<bigint>();
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (prevRisky.current !== undefined && prevRisky.current > 0n && vault.risky === 0n) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1000);
      return () => clearTimeout(t);
    }
    prevRisky.current = vault.risky;
  }, [vault.risky]);

  // live TriggerExecuted feed
  const [execs, setExecs] = useState<{ id: bigint; bps: number; ok: boolean; tx: `0x${string}`; block: bigint; at: number }[]>([]);
  useEffect(() => {
    if (!client) return;
    const un = client.watchEvent({
      address: HANDLER,
      event: EXECUTED,
      onLogs: (logs) =>
        setExecs((prev) =>
          [
            ...logs.map((l) => ({
              id: l.args.id!,
              bps: Number(l.args.probabilityBps),
              ok: Boolean(l.args.success),
              tx: l.transactionHash!,
              block: l.blockNumber!,
              at: Date.now(),
            })),
            ...prev,
          ].slice(0, 12),
        ),
    });
    return () => un();
  }, [client]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="A market belief, executing an on-chain action"
        lede="No keeper. No off-chain watcher. A reactivity subscription on the pool's OrderFilled invokes the handler; the handler re-reads the book, waits out the dwell, and calls the target — in the block the fill qualified it."
      />

      {/* the vault — the state that changes */}
      <div className={cn("grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3", pulse && "pulse-track")}>
        <VaultCell label="Risky balance" value={stt(vault.risky, 3)} tone={vault.risky === 0n ? "muted" : "fg"} unit="STT" />
        <VaultCell label="Safe balance" value={stt(vault.safe, 3)} tone={vault.safe > 0n ? "executed" : "muted"} unit="STT" />
        <div className="flex flex-col justify-center gap-2 bg-panel p-4">
          <div className="label">Reset for the next take</div>
          <Button
            size="sm"
            variant="default"
            disabled={actions.mining}
            onClick={() => actions.reset().catch(() => {})}
          >
            {actions.mining ? "…" : "Sweep safe → risky"}
          </Button>
          <button
            className="num text-2xs text-fg-4 hover:text-fg-3 text-left"
            onClick={() => actions.deposit(10n ** 17n).catch(() => {})}
          >
            + top up 0.1 STT
          </button>
        </div>
      </div>

      {/* the trigger */}
      <Panel>
        <PanelHeader
          title="The armed trigger"
          right={
            <div className="flex items-center gap-2">
              <NumberInput
                value={triggerId}
                min={1}
                onChange={(v) => setTriggerId(Math.max(1, Math.round(v || 1)))}
                className="w-24"
              />
              {trigger && <StateBadge state={trigger.state} />}
            </div>
          }
        />
        <div className="space-y-4 p-4">
          {trigger && trigger.state !== TriggerState.NONE ? (
            <>
              <BeliefToActionFlow
                probabilityBps={p}
                thresholdBps={trigger.thresholdBps}
                direction={trigger.direction}
                dwellStart={trigger.dwellStart}
                dwellSec={trigger.dwellSec}
                state={trigger.state}
                targetLabel="DemoVault.derisk()"
                riskySafe={{ risky: vault.risky, safe: vault.safe }}
                fired={pulse}
              />
              {trigger.pool && trigger.state !== TriggerState.EXECUTED && (
                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  <MarketNudge pool={trigger.pool} label="Cross the market →" size={10} />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-fg-3">
              Trigger #{triggerId} doesn&apos;t exist. Arm one targeting the demo vault, then put its id here.
            </p>
          )}
        </div>
      </Panel>

      {/* execution log */}
      <Panel>
        <PanelHeader title="Executions" sub="TriggerExecuted — streaming from the handler" />
        <ul className="divide-y divide-line">
          {execs.length === 0 && <li className="px-4 py-5 text-xs text-fg-4">listening…</li>}
          {execs.map((e) => (
            <li key={e.tx} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div>
                <div className="num text-sm text-fg">
                  #{e.id.toString()} · {pct(e.bps, 2)}{" "}
                  <span className={e.ok ? "text-executed text-xs" : "text-failed text-xs"}>
                    {e.ok ? "· derisked" : "· reverted"}
                  </span>
                </div>
                <div className="num text-2xs text-fg-4">block {e.block.toString()} · {ago(Math.floor(e.at / 1000))}</div>
              </div>
              <Addr value={e.tx} kind="tx" />
            </li>
          ))}
        </ul>
      </Panel>

      {/* the guard */}
      <Panel className="p-4">
        <div className="label mb-2">Why a single wash trade can&apos;t force it</div>
        <p className="text-sm leading-relaxed text-fg-3">
          The signal is a <span className="text-fg-2">notional-weighted mid across eight levels</span>,
          not the last trade price. One aggressive fill against a thin quote moves the touch — it does
          not move the depth-weighted mid. If it clears enough levels that the average does move, the
          attacker has paid real size, against every arbitrageur, for the whole dwell.
        </p>
      </Panel>
    </div>
  );
}

function VaultCell({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "fg" | "executed" | "muted";
}) {
  return (
    <div className="bg-panel p-5">
      <div className="label">{label}</div>
      <div
        className={cn(
          "num mt-1 text-3xl tabular-nums transition-colors duration-slow",
          tone === "executed" && "text-executed",
          tone === "muted" && "text-fg-4",
        )}
      >
        {value} <span className="text-sm text-fg-4">{unit}</span>
      </div>
    </div>
  );
}
