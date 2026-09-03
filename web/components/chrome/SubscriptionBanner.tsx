"use client";

import { useRegistryInfo } from "@/hooks/useRegistry";
import { stt } from "@/lib/format";

/**
 * Global banner — a silently-drained subscription looks identical to a broken
 * product, and it will drain during the demo if unwatched (docs/01, docs/09).
 */
export function SubscriptionBanner() {
  const { balance, balanceLoaded, underMin, warn, paused } = useRegistryInfo();
  if (!balanceLoaded) return null;
  if (!warn && !paused) return null;

  const tone = underMin || paused ? "failed" : "observing";

  return (
    <div
      className="border-b text-center text-xs py-2 px-4"
      style={{
        borderColor: `color-mix(in oklab, var(--${tone}) 30%, transparent)`,
        background: `color-mix(in oklab, var(--${tone}) 8%, transparent)`,
        color: `var(--${tone})`,
      }}
    >
      {paused ? (
        <>Registry is <span className="font-600">paused</span> — no new triggers can be armed.</>
      ) : underMin ? (
        <>
          Registry balance <span className="num">{stt(balance)} STT</span> is below the{" "}
          <span className="num">32 STT</span> subscription minimum — reactivity callbacks have stopped.
        </>
      ) : (
        <>
          Registry balance is low: <span className="num">{stt(balance)} STT</span>. Callbacks are paid
          from this; below <span className="num">32 STT</span> they stop.
        </>
      )}
    </div>
  );
}
