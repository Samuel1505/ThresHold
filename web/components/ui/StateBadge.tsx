import { cn } from "@/lib/cn";
import { STATE_NAME, TriggerState } from "@/lib/types";

const tone: Record<TriggerState, string> = {
  [TriggerState.NONE]: "text-fg-3 border-line",
  [TriggerState.ARMED]: "text-armed border-armed/35 bg-armed/[0.07]",
  [TriggerState.OBSERVING]: "text-observing border-observing/35 bg-observing/[0.08]",
  [TriggerState.EXECUTED]: "text-executed border-executed/35 bg-executed/[0.08]",
  [TriggerState.EXPIRED]: "text-expired border-line",
  [TriggerState.CANCELLED]: "text-expired border-line",
  [TriggerState.FAILED]: "text-failed border-failed/35 bg-failed/[0.07]",
};

export function StateBadge({ state, className }: { state: TriggerState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-2xs font-medium uppercase tracking-wider",
        tone[state],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          state === TriggerState.OBSERVING && "motion-safe:animate-pulse",
        )}
      />
      {STATE_NAME[state]}
    </span>
  );
}
