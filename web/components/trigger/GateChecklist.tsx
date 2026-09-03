import { cn } from "@/lib/cn";
import type { GateResult } from "@/lib/types";

/**
 * The most important component (docs/09). Every gate G1–G8 the handler checks,
 * live pass/fail with the reason. This is the screen that teaches the concept.
 */
export function GateChecklist({
  gates,
  className,
  compact,
}: {
  gates: GateResult[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {gates.map((g) => {
        const isThreshold = g.id === "P";
        return (
          <li
            key={g.id}
            className={cn(
              "flex items-center gap-3 py-2.5",
              compact ? "px-3" : "px-4",
              isThreshold && "bg-panel-2",
            )}
          >
            <Mark ok={g.ok} />
            <span className="num w-6 shrink-0 text-2xs text-fg-4">{g.id}</span>
            <span className={cn("shrink-0 text-sm", g.ok ? "text-fg" : "text-fg-2", isThreshold && "font-500")}>
              {g.label}
            </span>
            <span className="num ml-auto truncate text-right text-xs text-fg-3">{g.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px]",
        ok
          ? "border-executed/50 text-executed"
          : "border-line-strong text-fg-4",
      )}
      aria-hidden
    >
      {ok ? "✓" : "·"}
    </span>
  );
}
