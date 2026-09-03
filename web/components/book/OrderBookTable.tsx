import { cn } from "@/lib/cn";
import { collateral, pct } from "@/lib/format";
import type { PoolSnapshot } from "@/lib/types";

/** 8 levels a side (docs/09). Asks above, bids below, spread in the seam. */
export function OrderBookTable({ snap }: { snap: PoolSnapshot }) {
  const asks = [...snap.asks].slice(0, 8);
  const bids = [...snap.bids].slice(0, 8);
  const maxNotional = Math.max(
    1,
    ...asks.map((l) => Number(l.notional)),
    ...bids.map((l) => Number(l.notional)),
  );

  const Row = ({ side, level }: { side: "bid" | "ask"; level: (typeof asks)[number] }) => {
    const w = (Number(level.notional) / maxNotional) * 100;
    return (
      <div className="relative grid grid-cols-[1fr_1fr] items-center px-3 py-[3px] text-xs">
        <span
          aria-hidden
          className="absolute inset-y-0 right-0"
          style={{
            width: `${w}%`,
            background: `color-mix(in oklab, var(--${side}) 12%, transparent)`,
          }}
        />
        <span className={cn("num relative", side === "ask" ? "text-ask" : "text-bid")}>
          {pct(level.priceBps, 2)}
        </span>
        <span className="num relative text-right text-fg-2">
          {collateral(level.notional, snap.oneCollateral, 1)}
        </span>
      </div>
    );
  };

  const mid = snap.twoSided ? (snap.bestBidBps + snap.bestAskBps) / 2 : null;

  return (
    <div className="rounded-lg border border-line bg-well overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr] px-3 py-1.5 text-2xs uppercase tracking-wider text-fg-4 border-b border-line">
        <span>Price · P(YES)</span>
        <span className="text-right">Notional</span>
      </div>
      <div className="flex flex-col-reverse">
        {asks.length === 0 ? (
          <div className="px-3 py-2 text-xs text-fg-4">no asks</div>
        ) : (
          asks.map((l, i) => <Row key={`a${i}`} side="ask" level={l} />)
        )}
      </div>
      <div className="flex items-center justify-between border-y border-line bg-panel px-3 py-1.5 text-xs">
        <span className="num text-fg-3">
          spread {snap.twoSided ? `${(snap.spreadBps / 100).toFixed(2)}%` : "—"}
        </span>
        <span className="num text-fg">{mid !== null ? `${pct(mid, 2)} mid` : "—"}</span>
      </div>
      <div className="flex flex-col">
        {bids.length === 0 ? (
          <div className="px-3 py-2 text-xs text-fg-4">no bids</div>
        ) : (
          bids.map((l, i) => <Row key={`b${i}`} side="bid" level={l} />)
        )}
      </div>
    </div>
  );
}
