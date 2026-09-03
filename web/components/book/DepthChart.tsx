"use client";

import { useId } from "react";
import { collateral } from "@/lib/format";
import type { PoolSnapshot } from "@/lib/types";

/**
 * Cumulative notional walking out from the mid on each side, with the trigger's
 * `minDepthPerSide` line overlaid (docs/09). Two series = the blue/orange
 * CVD-safe categorical pair; the min-depth line is a reference, drawn dashed.
 */
export function DepthChart({
  snap,
  minDepthPerSide = 0n,
  height = 130,
}: {
  snap: PoolSnapshot;
  minDepthPerSide?: bigint;
  height?: number;
}) {
  const uid = useId();
  const W = 320;
  const H = height;
  const pad = { t: 8, r: 8, b: 16, l: 8 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  // cumulative from best price outward
  const cum = (levels: PoolSnapshot["bids"]) => {
    let acc = 0;
    return levels.slice(0, 8).map((l) => {
      acc += Number(l.notional);
      return { bps: l.priceBps, cum: acc };
    });
  };
  const bid = cum(snap.bids);
  const ask = cum(snap.asks);
  const minDepth = Number(minDepthPerSide);
  const maxCum = Math.max(1, minDepth * 1.15, ...bid.map((p) => p.cum), ...ask.map((p) => p.cum));

  // x: mid at center, bids to the left, asks to the right, using |bps - mid|
  const mid = snap.twoSided ? (snap.bestBidBps + snap.bestAskBps) / 2 : 5000;
  const span = Math.max(200, snap.spreadBps * 4, 400); // bps window each side
  const xFor = (bps: number) => {
    const rel = Math.max(-1, Math.min(1, (bps - mid) / span));
    return pad.l + (rel + 1) * (iw / 2);
  };
  const yFor = (c: number) => pad.t + ih - (c / maxCum) * ih;

  const stepPath = (pts: { bps: number; cum: number }[], toRight: boolean) => {
    if (pts.length === 0) return "";
    const startX = xFor(mid);
    let d = `M ${startX} ${yFor(0)}`;
    let prevY = yFor(0);
    for (const p of pts) {
      const x = xFor(p.bps);
      d += ` L ${x} ${prevY}`;
      const y = yFor(p.cum);
      d += ` L ${x} ${y}`;
      prevY = y;
    }
    // close down to baseline
    const lastX = xFor(pts[pts.length - 1]!.bps);
    d += ` L ${lastX} ${yFor(0)} Z`;
    return d;
  };

  const minY = minDepth > 0 ? yFor(minDepth) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="order book depth">
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x={pad.l} y={pad.t} width={iw} height={ih} />
        </clipPath>
      </defs>
      {/* baseline + mid divider */}
      <line x1={pad.l} y1={yFor(0)} x2={W - pad.r} y2={yFor(0)} stroke="var(--line)" strokeWidth="1" />
      <line x1={xFor(mid)} y1={pad.t} x2={xFor(mid)} y2={pad.t + ih} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 3" />

      <g clipPath={`url(#${uid}-clip)`}>
        <path d={stepPath(bid, false)} fill="color-mix(in oklab, var(--bid) 22%, transparent)" stroke="var(--bid)" strokeWidth="1.5" />
        <path d={stepPath(ask, true)} fill="color-mix(in oklab, var(--ask) 22%, transparent)" stroke="var(--ask)" strokeWidth="1.5" />
      </g>

      {/* min-depth reference line */}
      {minY !== null && minY > pad.t && (
        <>
          <line x1={pad.l} y1={minY} x2={W - pad.r} y2={minY} stroke="var(--threshold)" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x={W - pad.r} y={minY - 3} textAnchor="end" className="num" fontSize="8" fill="var(--threshold)">
            min depth {collateral(minDepthPerSide, snap.oneCollateral, 0)}
          </text>
        </>
      )}

      <text x={pad.l} y={H - 4} fontSize="8" fill="var(--fg-4)" className="num">bids</text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="8" fill="var(--fg-4)" className="num">asks</text>
    </svg>
  );
}
