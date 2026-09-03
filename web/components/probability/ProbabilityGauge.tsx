import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { Direction } from "@/lib/types";

/** Clean semicircle: 180° sweep, left → right, over the top. Gap at the bottom. */
const R = 78;
const CX = 100;
const CY = 96;
const rad = (d: number) => (d * Math.PI) / 180;
const pt = (deg: number, r = R) => [CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg))] as const;
// value 0 → 180° (left), value 1 → 360° (right)
const angleFor = (f: number) => 180 + Math.max(0, Math.min(1, f)) * 180;

function arcPath(fromF: number, toF: number) {
  const [x0, y0] = pt(angleFor(fromF));
  const [x1, y1] = pt(angleFor(toF));
  const large = angleFor(toF) - angleFor(fromF) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function ProbabilityGauge({
  bps,
  thresholdBps,
  direction,
  state = "idle",
  invalidReason,
  size = 260,
}: {
  bps: number | null;
  thresholdBps?: number;
  direction?: Direction;
  state?: "idle" | "armed" | "observing" | "executed" | "failed";
  invalidReason?: string;
  size?: number;
}) {
  const invalid = bps === null;
  const f = invalid ? 0 : Math.max(0, Math.min(1, bps / 10_000));
  const thrF = thresholdBps !== undefined ? thresholdBps / 10_000 : undefined;

  const color =
    state === "observing"
      ? "var(--observing)"
      : state === "executed"
        ? "var(--executed)"
        : state === "failed"
          ? "var(--failed)"
          : state === "armed"
            ? "var(--armed)"
            : "var(--fg)";

  const crossed =
    thresholdBps !== undefined && !invalid && direction !== undefined
      ? direction === Direction.ABOVE
        ? bps! >= thresholdBps
        : bps! <= thresholdBps
      : false;

  const thrInner = thrF !== undefined ? pt(angleFor(thrF), R - 11) : null;
  const thrOuter = thrF !== undefined ? pt(angleFor(thrF), R + 5) : null;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 200 118" width={size} height={size * 0.59} className="block overflow-visible">
        <path d={arcPath(0, 1)} stroke="var(--line-strong)" strokeWidth="7" fill="none" strokeLinecap="round" />
        {!invalid && f > 0.004 && (
          <path
            d={arcPath(0, f)}
            stroke={color}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
        )}
        {thrInner && thrOuter && (
          <line
            x1={thrInner[0]}
            y1={thrInner[1]}
            x2={thrOuter[0]}
            y2={thrOuter[1]}
            stroke="var(--threshold)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}
        {[0, 0.5, 1].map((t) => {
          const [ax, ay] = pt(angleFor(t), R - 13);
          const [bx, by] = pt(angleFor(t), R - 6);
          return <line key={t} x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--line)" strokeWidth="1" />;
        })}
      </svg>

      <div className="-mt-[24%] flex flex-col items-center text-center">
        {invalid ? (
          <>
            <div className="num text-lg text-fg-3">— · —</div>
            <div className="mt-0.5 max-w-[190px] text-2xs leading-tight text-fg-4">
              {invalidReason ?? "No valid mid"}
            </div>
          </>
        ) : (
          <>
            <div
              className={cn(
                "font-sans font-500 tabular-nums leading-none [font-feature-settings:'tnum']",
                size >= 240 ? "text-gauge" : "text-2xl",
              )}
              style={{ color: state === "idle" ? "var(--fg)" : color }}
            >
              {pct(bps!, 1)}
            </div>
            <div className="label mt-1.5 flex items-center gap-1.5">
              <span>P(YES) depth-wtd</span>
              {thresholdBps !== undefined && (
                <span className={crossed ? "text-observing" : "text-fg-4"}>
                  {direction === Direction.ABOVE ? "≥" : "≤"} {pct(thresholdBps, 0)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
