"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useMarket, useMarkets } from "@/hooks/useMarkets";
import { usePoolSnapshot } from "@/hooks/usePoolSnapshot";
import { useProbabilityHistory } from "@/hooks/useProbabilityHistory";
import { useRegistryInfo } from "@/hooks/useRegistry";
import { useArmTrigger } from "@/hooks/useWrites";
import { depthWeightedBps, evaluateGates, wouldQualify } from "@/lib/probability";
import { Direction } from "@/lib/types";
import { pct, until, stt } from "@/lib/format";
import { explorerTx } from "@/lib/env";
import { PageHeader } from "@/components/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Slider";
import { Segmented } from "@/components/ui/Segmented";
import { Field, NumberInput } from "@/components/ui/Field";
import { Sparkline } from "@/components/probability/Sparkline";
import { ProbabilityGauge } from "@/components/probability/ProbabilityGauge";
import { GateChecklist } from "@/components/trigger/GateChecklist";
import { NetworkGuard } from "@/components/chrome/NetworkGuard";
import { DwellSelector, ActionSelector, ACTIONS, DirectionToggle } from "@/components/trigger/builder";

export default function NewTriggerPage() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}

function Builder() {
  const router = useRouter();
  const qp = useSearchParams();
  const marketId = qp.get("market") ?? undefined;
  const { data: market } = useMarket(marketId);
  const markets = useMarkets();
  const reg = useRegistryInfo();
  const { address } = useAccount();

  const pool = market?.pool;
  const { snapshot } = usePoolSnapshot(pool);
  const one = snapshot?.oneCollateral ?? 1_000_000n;

  // ── config state ──
  const [thresholdBps, setThresholdBps] = useState(6000);
  const [direction, setDirection] = useState<Direction>(Direction.ABOVE);
  const [dwellSec, setDwellSec] = useState(30);
  const [minDepth, setMinDepth] = useState(10); // human collateral / side
  const [maxSpreadPct, setMaxSpreadPct] = useState(5); // %
  const [gasCap, setGasCap] = useState(500_000);
  const [recurring, setRecurring] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(60);
  const [action, setAction] = useState(ACTIONS[0]!);
  const [advanced, setAdvanced] = useState(false);

  const minDwell = reg.minDwellSec ?? 5;
  const maxDwell = reg.maxDwellSec ?? 3600;
  const cfg = useMemo(
    () => ({
      thresholdBps,
      direction,
      maxSpreadBps: Math.round(maxSpreadPct * 100),
      minDepthPerSide: BigInt(Math.round(minDepth * Number(one))),
      dwellSec,
    }),
    [thresholdBps, direction, maxSpreadPct, minDepth, one, dwellSec],
  );

  const dw = snapshot ? depthWeightedBps(snapshot, cfg.minDepthPerSide) : null;
  const p = dw?.midBps ?? null;
  const gates = snapshot ? evaluateGates(snapshot, cfg) : [];
  const qualifies = snapshot ? wouldQualify(snapshot, cfg) : false;
  const history = useProbabilityHistory(dw?.midBps ?? null, gates.slice(1, 8).every((g) => g.ok));

  const arm = useArmTrigger();
  const armed = arm.status === "done" && arm.newId !== undefined;

  const configInvalid =
    thresholdBps <= 0 ||
    thresholdBps >= 10_000 ||
    dwellSec < minDwell ||
    dwellSec > maxDwell ||
    gasCap <= 0 ||
    (reg.maxActionGas !== undefined && gasCap > reg.maxActionGas) ||
    (recurring && cooldownSec < dwellSec);

  async function submit() {
    if (!pool) return;
    await arm.arm({
      pool,
      thresholdBps,
      direction,
      dwellSec,
      maxSpreadBps: cfg.maxSpreadBps,
      minDepthPerSide: cfg.minDepthPerSide,
      target: action.target,
      selector: action.selector,
      payload: "0x",
      actionGasCap: gasCap,
      expiresAt: 0n,
      recurring,
      cooldownSec: recurring ? cooldownSec : 0,
    });
  }

  // ── no market chosen ──
  if (!marketId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Arm a trigger" lede="Pick a market to watch." back={{ href: "/markets", label: "Markets" }} />
        <Panel>
          <PanelHeader title="Choose a market" />
          {markets.data?.length ? (
            <ul className="divide-y divide-line">
              {markets.data.map((m) => (
                <li key={m.marketId}>
                  <Link
                    href={`/triggers/new?market=${m.marketId}`}
                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-panel-2"
                  >
                    <span className="text-fg">
                      {m.asset} <span className="text-fg-3">{m.interval}</span>
                    </span>
                    <span className="num text-xs text-fg-4">{until(m.expiry)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6 text-sm text-fg-3">No live markets right now.</div>
          )}
        </Panel>
      </div>
    );
  }

  if (armed) {
    return (
      <div className="mx-auto max-w-md space-y-5 py-10 text-center animate-fade-in">
        <div className="text-4xl">✓</div>
        <h1 className="text-lg font-600">Trigger #{arm.newId!.toString()} is armed</h1>
        <p className="text-sm text-fg-3">
          A reactivity subscription now watches this pool&apos;s <span className="num">OrderFilled</span>.
          It evaluates on every fill — and is guaranteed one evaluation at dwell end.
        </p>
        <div className="flex justify-center gap-3">
          <Link href={`/triggers/${arm.newId}`}>
            <Button variant="primary">Watch it →</Button>
          </Link>
          {arm.hash && (
            <a href={explorerTx(arm.hash)} target="_blank" rel="noreferrer">
              <Button variant="ghost">View tx</Button>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `/markets/${marketId}`, label: market ? `${market.asset} ${market.interval}` : "market" }}
        title="Arm a trigger"
        lede="Set a threshold and a dwell. The right panel shows every gate the handler checks, live against the current book — this is the mechanism, not a mock."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        {/* ── form ── */}
        <div className="space-y-5">
          <Panel className="p-4 space-y-5">
            <Field
              label="Threshold"
              value={pct(thresholdBps, 0)}
              hint="The probability the market must reach. Drag it against real movement."
            >
              <Slider
                aria-label="threshold"
                value={thresholdBps}
                min={100}
                max={9900}
                step={100}
                onChange={setThresholdBps}
              />
              <div className="mt-2">
                <Sparkline samples={history} thresholdBps={thresholdBps} height={90} />
              </div>
            </Field>

            <Field label="Direction" hint="Fire when the probability rises above, or falls below, the threshold.">
              <DirectionToggle value={direction} onChange={setDirection} />
            </Field>

            <Field
              label="Dwell"
              hint="How long the signal must hold — against arbitrage — before the action fires. The dwell resets if it slips."
            >
              <DwellSelector value={dwellSec} onChange={setDwellSec} min={minDwell} max={maxDwell} />
            </Field>

            <Field label="Action" hint="What the handler calls when it fires.">
              <ActionSelector value={action} onChange={setAction} />
            </Field>
          </Panel>

          <Panel>
            <button
              onClick={() => setAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="label">Advanced · manipulation resistance</span>
              <span className="text-fg-4">{advanced ? "−" : "+"}</span>
            </button>
            {advanced && (
              <div className="space-y-4 border-t border-line p-4">
                <Field
                  label="Min depth per side"
                  value={`${minDepth} tUSDC`}
                  hint="Below this notional the book is declared uninformative — G8. Set it relative to the value of the action."
                >
                  <NumberInput value={minDepth} min={0} step={1} suffix="tUSDC" onChange={(v) => setMinDepth(Math.max(0, v || 0))} />
                </Field>
                <Field label="Max spread" value={`${maxSpreadPct}%`} hint="A wide book is rejected — G7. That's the state an attacker creates by pulling quotes.">
                  <NumberInput value={maxSpreadPct} min={0.1} step={0.5} suffix="%" onChange={(v) => setMaxSpreadPct(Math.max(0.1, v || 0.1))} />
                </Field>
                <Field label="Action gas cap" value={gasCap.toLocaleString()} hint={`Bounds griefing. Max ${(reg.maxActionGas ?? 2_000_000).toLocaleString()} — Somnia's gas is ~10x, so keep headroom.`}>
                  <NumberInput value={gasCap} min={1} step={50_000} suffix="gas" onChange={(v) => setGasCap(Math.max(1, Math.round(v || 1)))} />
                </Field>
                <Field label="Recurring" hint="Re-arms after firing, with a cooldown. Cooldown must be ≥ dwell.">
                  <Segmented
                    options={[
                      { value: "no", label: "One-shot" },
                      { value: "yes", label: "Recurring" },
                    ]}
                    value={recurring ? "yes" : "no"}
                    onChange={(v) => setRecurring(v === "yes")}
                  />
                  {recurring && (
                    <div className="mt-2">
                      <NumberInput value={cooldownSec} min={dwellSec} step={5} suffix={`s · ≥ ${dwellSec}`} onChange={(v) => setCooldownSec(Math.max(dwellSec, Math.round(v || dwellSec)))} />
                    </div>
                  )}
                </Field>
              </div>
            )}
          </Panel>
        </div>

        {/* ── live preview ── */}
        <div className="space-y-4 lg:sticky lg:top-20 self-start">
          <Panel className="flex flex-col items-center px-4 pb-4 pt-5">
            <ProbabilityGauge
              bps={p}
              thresholdBps={thresholdBps}
              direction={direction}
              state={qualifies ? "observing" : "armed"}
              invalidReason={
                snapshot && !snapshot.twoSided ? "One-sided book — no valid mid" : "reading…"
              }
              size={240}
            />
          </Panel>

          <Panel>
            <PanelHeader
              title="Would this fire right now?"
              right={
                <span
                  className={"num text-xs " + (qualifies ? "text-observing" : "text-fg-3")}
                >
                  {snapshot ? (qualifies ? "yes — starts dwell" : "no") : "…"}
                </span>
              }
            />
            {snapshot ? (
              <GateChecklist gates={gates} compact />
            ) : (
              <div className="px-4 py-6 text-xs text-fg-4">reading the book…</div>
            )}
          </Panel>

          <NetworkGuard>
            <Panel className="p-4 space-y-3">
              {arm.error && <p className="text-xs text-failed">{arm.error}</p>}
              {configInvalid && (
                <p className="text-xs text-observing">
                  {recurring && cooldownSec < dwellSec ? "cooldown must be ≥ dwell" : "check the config bounds"}
                </p>
              )}
              <Button
                variant="primary"
                className="w-full"
                disabled={!pool || configInvalid || arm.status === "signing" || arm.status === "mining" || reg.paused}
                onClick={submit}
              >
                {arm.status === "signing"
                  ? "Confirm in wallet…"
                  : arm.status === "mining"
                    ? "Arming…"
                    : `Arm — ${pct(thresholdBps, 0)} ${direction === Direction.ABOVE ? "above" : "below"} · hold ${dwellSec}s`}
              </Button>
              <p className="text-2xs text-fg-4">
                One transaction. It pins the market nonce and, if this is the pool&apos;s first trigger,
                creates the subscription. {address ? "" : "Connect a wallet to arm."}
              </p>
            </Panel>
          </NetworkGuard>
        </div>
      </div>
    </div>
  );
}
