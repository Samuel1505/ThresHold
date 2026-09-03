import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Stat({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "armed" | "observing" | "executed" | "failed" | "fg";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="label">{label}</div>
      <div
        className={cn(
          "num mt-1 text-lg leading-tight truncate",
          tone === "armed" && "text-armed",
          tone === "observing" && "text-observing",
          tone === "executed" && "text-executed",
          tone === "failed" && "text-failed",
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-xs text-fg-3 mt-0.5 truncate">{sub}</div> : null}
    </div>
  );
}
