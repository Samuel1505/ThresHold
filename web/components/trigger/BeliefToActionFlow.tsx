"use client";

import { cn } from "@/lib/cn";
import { pct, stt } from "@/lib/format";
import { Direction, TriggerState } from "@/lib/types";
import { DwellProgressRing } from "./DwellProgressRing";

/**
 * The three-panel view (docs/01, docs/09): belief → threshold → action, left to
 * right, with a single pulse traveling across when it fires. This is the only
 * motion in the app.
 */
export function BeliefToActionFlow({
  probabilityBps,
  thresholdBps,
  direction,
  dwellStart,
  dwellSec,
  state,
  targetLabel,
  riskySafe,
  fired,
}: {
  probabilityBps: number | null;
  thresholdBps: number;
  direction: Direction;
  dwellStart: bigint;
  dwellSec: number;
  state: TriggerState;
  targetLabel: string;
  riskySafe?: { risky: bigint; safe: bigint };
  fired: boolean;
}) {
  const crossed =
    probabilityBps !== null &&
    (direction === Direction.ABOVE
      ? probabilityBps >= thresholdBps
      : probabilityBps <= thresholdBps);
  const observing = state === TriggerState.OBSERVING;
  const executed = state === TriggerState.EXECUTED;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-[1fr_auto_1fr]",
        fired && "pulse-track",
      )}
    >
      {/* belief */}
      <Cell label="Market belief">
        <div className="num text-2xl text-fg tabular-nums">
          {probabilityBps === null ? "—" : pct(probabilityBps, 1)}
        </div>
        <div className="label mt-1">P(YES) · depth-weighted</div>
      </Cell>

      {/* threshold + dwell */}
      <Cell label="Threshold" className="md:min-w-[160px] items-center">
        <div className="num text-lg text-threshold">
          {direction === Direction.ABOVE ? "≥" : "≤"} {pct(thresholdBps, 0)}
        </div>
        <div className="mt-2 h-10">
          {observing && dwellStart > 0n ? (
            <DwellProgressRing dwellStart={dwellStart} dwellSec={dwellSec} size={44} />
          ) : (
            <div
              className={cn(
                "num text-xs",
                crossed ? "text-observing" : "text-fg-4",
              )}
            >
              {crossed ? "crossed" : `hold ${dwellSec}s`}
            </div>
          )}
        </div>
      </Cell>

      {/* action */}
      <Cell label="Target" className="items-end text-right">
        <div className="text-sm text-fg truncate max-w-full">{targetLabel}</div>
        {riskySafe ? (
          <div className="num mt-1 text-xs text-fg-3">
            risky <span className={executed ? "text-fg-4 line-through" : "text-fg-2"}>{stt(riskySafe.risky, 2)}</span>
            {" · "}
            safe <span className={executed ? "text-executed" : "text-fg-2"}>{stt(riskySafe.safe, 2)}</span>
          </div>
        ) : (
          <div className="num mt-1 text-xs text-fg-4">
            {executed ? "fired" : "idle"}
          </div>
        )}
      </Cell>
    </div>
  );
}

function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col justify-center bg-panel p-4 min-h-[104px]", className)}>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}
