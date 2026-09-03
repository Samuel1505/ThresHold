import { cn } from "@/lib/cn";

/** Calm shimmer — a border-only sweep, never a pulsing block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded bg-panel-2 relative overflow-hidden",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/[0.04] before:to-transparent",
        "motion-safe:before:animate-[shimmer_1.6s_infinite]",
        className,
      )}
    />
  );
}
