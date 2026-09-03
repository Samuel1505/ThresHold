/**
 * TypeScript port of `contracts/src/ProbabilityLib.sol`, behaviourally identical.
 *
 * The frontend MUST show the same probability the handler will act on — if this drifts
 * from the Solidity, the preview lies about whether a trigger fires (docs/03, docs/07,
 * docs/09). All arithmetic is bigint with the same integer-division / clamp / saturation
 * as the contract. Parity fixtures live in `lib/probability.fixtures.ts`.
 */
import {
  Direction,
  TriggerState,
  type GateResult,
  type Level,
  type PoolSnapshot,
  type RawLevel,
  type TriggerConfig,
} from "./types";

export const BPS = 10_000n;
const U128_MAX = (1n << 128n) - 1n;
const MAX_LEVELS = 8;

/** Raw price → basis points of `oneCollateral`, clamped to [0, 10000] (never wraps). */
export function toBps(priceRaw: bigint, oneCollateral: bigint): number {
  if (oneCollateral === 0n) return 0;
  const v = (priceRaw * BPS) / oneCollateral;
  return v >= BPS ? 10_000 : Number(v);
}

function convert(raw: readonly RawLevel[], one: bigint): Level[] {
  const n = Math.min(raw.length, MAX_LEVELS);
  const out: Level[] = [];
  for (let i = 0; i < n; i++) {
    const { price, quantity } = raw[i]!;
    let notional = 0n;
    if (price !== 0n && quantity !== 0n) {
      notional = (price * quantity) / (one === 0n ? 1n : one);
      if (notional > U128_MAX) notional = U128_MAX;
    }
    out.push({
      priceRaw: price,
      qtyRaw: quantity,
      priceBps: toBps(price, one),
      notional,
    });
  }
  return out;
}

export interface SnapshotInput {
  oneCollateral: bigint;
  marketNonce: bigint;
  finalized: boolean;
  marketExpiryNs: bigint;
  bids: readonly RawLevel[];
  asks: readonly RawLevel[];
  /** unix seconds — defaults to now. Pass a fixed value for deterministic tests. */
  nowSec?: number;
}

/** Mirror of `ProbabilityLib.snapshot`. */
export function snapshot(input: SnapshotInput): PoolSnapshot {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const one = input.oneCollateral;
  const bids = convert(input.bids, one);
  const asks = convert(input.asks, one);
  const twoSided = input.bids.length !== 0 && input.asks.length !== 0;

  const bestBidBps = twoSided ? (bids[0]?.priceBps ?? 0) : 0;
  const bestAskBps = twoSided ? (asks[0]?.priceBps ?? 0) : 0;

  return {
    oneCollateral: one,
    marketNonce: input.marketNonce,
    finalized: input.finalized,
    expired:
      input.marketExpiryNs !== 0n &&
      BigInt(nowSec) * 1_000_000_000n >= input.marketExpiryNs,
    booksEmpty: input.bids.length === 0 && input.asks.length === 0,
    twoSided,
    bestBidBps,
    bestAskBps,
    spreadBps: twoSided && bestAskBps > bestBidBps ? bestAskBps - bestBidBps : 0,
    bids,
    asks,
    expiryNs: input.marketExpiryNs,
    nowSec,
  };
}

/** Mirror of `ProbabilityLib.vwapUntil`. */
export function vwapUntil(
  levels: readonly Level[],
  target: bigint,
): { vwapBps: number; consumed: bigint } {
  let acc = 0n;
  let notional = 0n;
  for (const l of levels) {
    acc += BigInt(l.priceBps) * l.notional;
    notional += l.notional;
    if (target !== 0n && notional >= target) break;
  }
  if (notional === 0n) return { vwapBps: 0, consumed: 0n };
  const avg = acc / notional;
  return {
    vwapBps: avg >= BPS ? 10_000 : Number(avg),
    consumed: notional > U128_MAX ? U128_MAX : notional,
  };
}

/** Mirror of `ProbabilityLib.depthWeightedBps`. */
export function depthWeightedBps(
  snap: PoolSnapshot,
  minDepthPerSide: bigint,
): { midBps: number; bidDeep: boolean; askDeep: boolean; bidVwapBps: number; askVwapBps: number; bidNotional: bigint; askNotional: bigint } {
  const b = vwapUntil(snap.bids, minDepthPerSide);
  const a = vwapUntil(snap.asks, minDepthPerSide);
  return {
    midBps: Math.floor((b.vwapBps + a.vwapBps) / 2),
    bidDeep: b.consumed !== 0n && b.consumed >= minDepthPerSide,
    askDeep: a.consumed !== 0n && a.consumed >= minDepthPerSide,
    bidVwapBps: b.vwapBps,
    askVwapBps: a.vwapBps,
    bidNotional: b.consumed,
    askNotional: a.consumed,
  };
}

export function qualifies(p: number, thresholdBps: number, direction: Direction): boolean {
  return direction === Direction.ABOVE ? p >= thresholdBps : p <= thresholdBps;
}

/** Top-of-book mid, bps — the fast readout (docs/07 §3.1). */
export function midBps(snap: PoolSnapshot): number | null {
  if (!snap.twoSided) return null;
  return Math.floor((snap.bestBidBps + snap.bestAskBps) / 2);
}

/**
 * Confidence score 0–100 (display only, never gates execution — docs/07 §3.3).
 * `10000 - min(spread*20, 5000) - staleness penalty`, then /100.
 */
export function confidence(snap: PoolSnapshot, stalenessSec = 0, maxStalenessSec = 60): number {
  if (!snap.twoSided) return 0;
  const spreadPenalty = Math.min(snap.spreadBps * 20, 5000);
  const agePenalty = Math.min((stalenessSec * 10_000) / maxStalenessSec, 3000);
  return Math.max(0, Math.round((10_000 - spreadPenalty - agePenalty) / 100));
}

/**
 * Evaluate every gate the handler checks, for a live preview. Mirrors
 * `ThresholdHandler._evaluate` gate order (docs/04, docs/08). `G2`/`expiresAt`
 * checks are skipped when the config doesn't supply them (pre-arm preview).
 */
export function evaluateGates(snap: PoolSnapshot, cfg: TriggerConfig): GateResult[] {
  const out: GateResult[] = [];
  const state = cfg.state ?? TriggerState.ARMED;

  out.push({
    id: "G1",
    label: "Trigger armed",
    ok: state === TriggerState.ARMED || state === TriggerState.OBSERVING,
    detail: state === TriggerState.ARMED || state === TriggerState.OBSERVING
      ? "live"
      : `state is ${TriggerState[state]?.toLowerCase() ?? state}`,
  });

  const nonceOk = cfg.pinnedNonce === undefined || cfg.pinnedNonce === snap.marketNonce;
  out.push({
    id: "G2",
    label: "Market identity",
    ok: nonceOk,
    detail: cfg.pinnedNonce === undefined
      ? `nonce ${snap.marketNonce} (pinned at arm)`
      : nonceOk
        ? `nonce ${snap.marketNonce} matches`
        : `pool recycled — pinned ${cfg.pinnedNonce}, now ${snap.marketNonce}`,
  });

  out.push({
    id: "G3",
    label: "Not finalized",
    ok: !snap.finalized,
    detail: snap.finalized ? "market finalized" : "trading",
  });

  const deadlinePassed =
    cfg.expiresAt !== undefined && cfg.expiresAt !== 0n && BigInt(snap.nowSec) >= cfg.expiresAt;
  out.push({
    id: "G4",
    label: "Not expired",
    ok: !snap.expired && !deadlinePassed,
    detail: snap.expired
      ? "past market expiry"
      : deadlinePassed
        ? "past the trigger deadline"
        : "within the window",
  });

  out.push({
    id: "G5",
    label: "Book present",
    ok: !snap.booksEmpty,
    detail: snap.booksEmpty ? "no orders on either side" : "book has orders",
  });

  out.push({
    id: "G6",
    label: "Two-sided",
    ok: snap.twoSided,
    detail: snap.twoSided
      ? "bid and ask both rest"
      : snap.bids.length === 0
        ? "no bids — one-sided"
        : "no asks — one-sided",
  });

  out.push({
    id: "G7",
    label: "Spread",
    ok: snap.spreadBps <= cfg.maxSpreadBps,
    detail: `${(snap.spreadBps / 100).toFixed(2)}% vs ${(cfg.maxSpreadBps / 100).toFixed(2)}% max`,
  });

  const dw = depthWeightedBps(snap, cfg.minDepthPerSide);
  const one = snap.oneCollateral === 0n ? 1n : snap.oneCollateral;
  const need = Number(cfg.minDepthPerSide) / Number(one);
  const haveBid = Number(dw.bidNotional) / Number(one);
  const haveAsk = Number(dw.askNotional) / Number(one);
  out.push({
    id: "G8",
    label: "Depth per side",
    ok: dw.bidDeep && dw.askDeep,
    detail:
      dw.bidDeep && dw.askDeep
        ? `bid ${haveBid.toFixed(1)} / ask ${haveAsk.toFixed(1)} ≥ ${need.toFixed(1)}`
        : `${!dw.bidDeep ? `bid ${haveBid.toFixed(1)}` : `ask ${haveAsk.toFixed(1)}`} < ${need.toFixed(1)} required`,
  });

  const q = qualifies(dw.midBps, cfg.thresholdBps, cfg.direction);
  const gatesPass = out.slice(1).every((g) => g.ok);
  out.push({
    id: "P",
    label: cfg.direction === Direction.ABOVE ? "Above threshold" : "Below threshold",
    ok: gatesPass && q,
    detail: gatesPass
      ? `${(dw.midBps / 100).toFixed(2)}% ${cfg.direction === Direction.ABOVE ? "≥" : "≤"} ${(cfg.thresholdBps / 100).toFixed(2)}%${q ? "" : " — not yet"}`
      : "gates must pass first",
  });

  return out;
}

/** `true` when every gate + the threshold check passes right now. */
export function wouldQualify(snap: PoolSnapshot, cfg: TriggerConfig): boolean {
  return evaluateGates(snap, cfg).every((g) => g.ok);
}
