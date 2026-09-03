"use client";

import type { Sample } from "@/hooks/useProbabilityHistory";

/**
 * Probability over the session (docs/09) — a single series, so no legend; the
 * threshold rides across it as a horizontal marker. Optionally interactive:
 * `ThresholdSlider` sits over this so the user sees the line against real movement.
 */
export function Sparkline({
  samples,
  thresholdBps,
  height = 96,
  showThreshold = true,
}: {
  samples: Sample[];
  thresholdBps?: number;
  height?: number;
  showThreshold?: boolean;
}) {
  const W = 600;
  const H = height;
  const pad = 4;

  if (samples.length < 2) {
    return (
      <div
        className="grid place-items-center rounded border border-line bg-well text-2xs text-fg-4"
        style={{ height: H }}
      >
        collecting samples…
      </div>
    );
  }

  const xs = samples.map((_, i) => pad + (i / (samples.length - 1)) * (W - 2 * pad));
  const lo = Math.min(...samples.map((s) => s.bps), thresholdBps ?? Infinity) - 200;
  const hi = Math.max(...samples.map((s) => s.bps), thresholdBps ?? 0) + 200;
  const clampLo = Math.max(0, lo);
  const clampHi = Math.min(10_000, hi);
  const yFor = (bps: number) =>
    pad + (1 - (bps - clampLo) / Math.max(1, clampHi - clampLo)) * (H - 2 * pad);

  const line = samples.map((s, i) => `${i === 0 ? "M" : "L"} ${xs[i]!.toFixed(1)} ${yFor(s.bps).toFixed(1)}`).join(" ");
  const area = `${line} L ${xs[xs.length - 1]!.toFixed(1)} ${H - pad} L ${xs[0]!.toFixed(1)} ${H - pad} Z`;
  const thrY = thresholdBps !== undefined ? yFor(thresholdBps) : null;
  const last = samples[samples.length - 1]!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }} role="img" aria-label="probability history">
      <path d={area} fill="color-mix(in oklab, var(--armed) 9%, transparent)" />
      <path d={line} fill="none" stroke="var(--armed)" strokeWidth="1.5" strokeLinejoin="round" />
      {showThreshold && thrY !== null && thrY > 0 && thrY < H && (
        <line x1={0} y1={thrY} x2={W} y2={thrY} stroke="var(--threshold)" strokeWidth="1.25" strokeDasharray="4 3" />
      )}
      <circle cx={xs[xs.length - 1]} cy={yFor(last.bps)} r="2.5" fill="var(--armed)" />
    </svg>
  );
}
