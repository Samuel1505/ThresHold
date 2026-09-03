import { describe, expect, it } from "vitest";
import { snapshot, depthWeightedBps, toBps, vwapUntil } from "./probability";
import type { RawLevel } from "./types";

/**
 * docs/12 P1/P2 — the TS side of the parity contract. The fixture inputs and the
 * `seed` rule are byte-identical to `contracts/test/parity/Parity.t.sol`; the
 * expected outputs are the values that Solidity produced. If the TS port drifts
 * from `ProbabilityLib.sol`, this breaks — and the frontend would lie about
 * whether a trigger fires.
 */
const ONE = 1_000_000n;
const raw = (bps: number) => (BigInt(bps) * ONE) / 10_000n;

/** matches Parity.t.sol `_seed`: qty = notional * one / price, floored. */
function seed(levels: Array<[bps: number, notional: bigint]>): RawLevel[] {
  return levels.map(([bps, notional]) => {
    const price = raw(bps);
    return { price, quantity: price === 0n ? 0n : (notional * ONE) / price };
  });
}

const snap = (bids: RawLevel[], asks: RawLevel[]) =>
  snapshot({ oneCollateral: ONE, marketNonce: 1n, finalized: false, marketExpiryNs: 0n, bids, asks, nowSec: 0 });

describe("ProbabilityLib TS port — parity with Parity.t.sol", () => {
  it("toBps at 6dp and 18dp, floor + clamp", () => {
    expect(toBps(500_000n, 1_000_000n)).toBe(5000);
    expect(toBps(5n * 10n ** 17n, 10n ** 18n)).toBe(5000);
    expect(toBps(123_456n, 1_000_000n)).toBe(1234);
    expect(toBps(2_000_000n, 1_000_000n)).toBe(10_000);
  });

  it("fixture A — symmetric deep book", () => {
    const s = snap(
      seed([
        [4900, 200_000_000n],
        [4800, 200_000_000n],
      ]),
      seed([
        [5100, 200_000_000n],
        [5200, 200_000_000n],
      ]),
    );
    expect(s.bestBidBps).toBe(4900);
    expect(s.bestAskBps).toBe(5100);
    expect(s.spreadBps).toBe(200);
    const dw = depthWeightedBps(s, 100_000_000n);
    expect(dw.midBps).toBe(5000);
    expect(dw.bidDeep && dw.askDeep).toBe(true);
  });

  it("fixture B — thin top over a gap (the manipulation case)", () => {
    const s = snap(
      seed([[4990, 500_000_000n]]),
      seed([
        [5010, 5_000_000n],
        [5400, 500_000_000n],
      ]),
    );
    const dw = depthWeightedBps(s, 100_000_000n);
    expect(dw.midBps).toBe(5193);
    expect(dw.bidDeep && dw.askDeep).toBe(true);
  });

  it("fixture C — one-sided book has no valid mid", () => {
    const s = snap(seed([[4000, 1_000_000n]]), []);
    expect(s.twoSided).toBe(false);
    expect(depthWeightedBps(s, 0n).midBps).toBe(2000);
  });

  it("fixture D — below min depth on both sides", () => {
    const s = snap(seed([[6000, 3_000_000n]]), seed([[6200, 3_000_000n]]));
    const dw = depthWeightedBps(s, 100_000_000n);
    expect(dw.bidDeep).toBe(false);
    expect(dw.askDeep).toBe(false);
  });

  it("vwapUntil stops at the target notional", () => {
    const s = snap(
      seed([
        [5000, 100_000_000n],
        [1000, 100_000_000n],
      ]),
      seed([[5000, 100_000_000n]]),
    );
    const { vwapBps, consumed } = vwapUntil(s.bids, 50_000_000n);
    expect(vwapBps).toBe(5000); // deeper level excluded
    expect(consumed >= 50_000_000n).toBe(true);
  });
});
