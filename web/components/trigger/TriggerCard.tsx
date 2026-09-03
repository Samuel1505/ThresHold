"use client";

import Link from "next/link";
import { usePoolSnapshot } from "@/hooks/usePoolSnapshot";
import { depthWeightedBps } from "@/lib/probability";
import { Direction, isActive, TriggerState, type Trigger } from "@/lib/types";
import { pct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { StateBadge } from "@/components/ui/StateBadge";
import { DwellProgressRing } from "./DwellProgressRing";

export function TriggerCard({ trigger, marketLabel }: { trigger: Trigger; marketLabel?: string }) {
  const { snapshot } = usePoolSnapshot(isActive(trigger.state) ? trigger.pool : undefined, 3000);
  const dw = snapshot ? depthWeightedBps(snapshot, trigger.minDepthPerSide) : null;
  const p = dw?.midBps ?? null;

  const crossed =
    p !== null &&
    (trigger.direction === Direction.ABOVE
      ? p >= trigger.thresholdBps
      : p <= trigger.thresholdBps);

  return (
    <Link
      href={`/triggers/${trigger.id}`}
      className="block rounded-lg border border-line bg-panel p-4 transition-colors duration-fast ease-out hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="num text-sm text-fg-3">#{trigger.id.toString()}</span>
            <span className="text-sm text-fg truncate">{marketLabel ?? "market"}</span>
          </div>
          <div className="num mt-1 text-xs text-fg-3">
            {trigger.direction === Direction.ABOVE ? "≥" : "≤"} {pct(trigger.thresholdBps, 0)} · hold {trigger.dwellSec}s
            {trigger.recurring ? " · recurring" : ""}
          </div>
        </div>
        <StateBadge state={trigger.state} />
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="label">Probability now</div>
          <div
            className={cn("num text-2xl tabular-nums", crossed ? "text-observing" : "text-fg")}
          >
            {p === null ? "—" : pct(p, 1)}
          </div>
        </div>
        {trigger.state === TriggerState.OBSERVING && trigger.dwellStart > 0n ? (
          <DwellProgressRing dwellStart={trigger.dwellStart} dwellSec={trigger.dwellSec} size={56} />
        ) : (
          <div className="num text-xs text-fg-4">
            {p !== null && (
              <>
                {crossed ? "above" : "below"} threshold
              </>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
