/**
 * PHASE 0.4 — confirm the BinaryPool view functions Threshold's handler depends
 * on actually respond, with the shapes markets-sdk@0.28.1 declares (docs/16).
 *
 *   TARGET_POOL=0x... pnpm phase0:poolreads
 *
 * Reads getBinaryPoolParams, marketNonce, finalized, booksEmpty, marketExpiryNs,
 * and getBookLevels(true/false, 8) via a single multicall, then derives the
 * YES-terms probability the way the handler will (P = yesPrice / oneCollateral),
 * so we see a real number before writing ProbabilityLib.
 *
 * Gate: no ABI-decode error; getBookLevels returns level arrays; oneCollateral
 * reads 1e6 on Shannon. ABI mismatch -> re-extract from readsAbi.ts (docs/16 §0.4).
 */
import { formatUnits, type Address } from "viem";
import { publicClient, TARGET_POOL, BINARY_POOL_READ_ABI } from "./env.js";

function bps(priceRaw: bigint, oneCollateral: bigint): number {
  return oneCollateral === 0n ? 0 : Number((priceRaw * 10_000n) / oneCollateral);
}

/** notional-weighted average price (bps) over levels until `target` notional is met. */
function vwapUntil(levels: readonly { price: bigint; quantity: bigint }[], target: bigint, one: bigint) {
  let acc = 0n;
  let notional = 0n;
  let used = 0;
  for (const { price, quantity } of levels) {
    const n = (price * quantity) / one;
    acc += BigInt(bps(price, one)) * n;
    notional += n;
    used++;
    if (notional >= target) break;
  }
  return { vwapBps: notional === 0n ? 0 : Number(acc / notional), notional, used };
}

async function main() {
  const pool = TARGET_POOL as Address | undefined;
  if (!pool) throw new Error("set TARGET_POOL in .env (run pnpm phase0:discover first)");

  const c = { address: pool, abi: BINARY_POOL_READ_ABI } as const;
  const [params, nonce, finalized, booksEmpty, expiryNs, bids, asks] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...c, functionName: "getBinaryPoolParams" },
      { ...c, functionName: "marketNonce" },
      { ...c, functionName: "finalized" },
      { ...c, functionName: "booksEmpty" },
      { ...c, functionName: "marketExpiryNs" },
      { ...c, functionName: "getBookLevels", args: [true, 8n] },
      { ...c, functionName: "getBookLevels", args: [false, 8n] },
    ],
  });

  const one = params.oneCollateral;
  console.log("pool:            ", pool);
  console.log("collateralToken: ", params.collateralToken);
  console.log("market:          ", params.market);
  console.log("oneCollateral:   ", one.toString(), one === 1_000_000n ? "(1e6 — Shannon OK)" : "(NOT 1e6 — check decimals!)");
  console.log("marketNonce:     ", nonce.toString(), "(getBinaryPoolParams says", params.marketNonce.toString() + ")");
  console.log("finalized:       ", finalized);
  console.log("booksEmpty:      ", booksEmpty);
  console.log("marketExpiryNs:  ", expiryNs.toString(), `(${new Date(Number(expiryNs / 1_000_000n)).toISOString()})`);
  console.log("fees bps×1k:     ", `maker=${params.makerFeeBpsTimes1k} taker=${params.takerFeeBpsTimes1k} settlement=${params.settlementFeeBpsTimes1k}`);

  const showSide = (name: string, levels: readonly { price: bigint; quantity: bigint }[]) => {
    console.log(`\n${name} (${levels.length} levels):`);
    for (const l of levels) {
      console.log(`  ${bps(l.price, one)} bps  (${formatUnits(l.price, 6)})  qty ${formatUnits(l.quantity, 6)}`);
    }
  };
  showSide("BIDS (YES demand)", bids);
  showSide("ASKS (YES supply)", asks);

  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined) {
    console.log("\none-sided or empty book — no valid mid (gate G6 would reject).");
    process.exit(0);
  }
  const midBps = (bps(bestBid, one) + bps(bestAsk, one)) / 2;
  const spreadBps = bps(bestAsk, one) - bps(bestBid, one);

  // depth-weighted mid at an illustrative 25 USDC per-side target
  const target = 25n * one;
  const b = vwapUntil(bids, target, one);
  const a = vwapUntil(asks, target, one);
  const dwMidBps = (b.vwapBps + a.vwapBps) / 2;

  console.log(`\ntop-of-book mid:       ${midBps} bps  (P(YES) ≈ ${(midBps / 10_000).toFixed(4)})`);
  console.log(`spread:               ${spreadBps} bps`);
  console.log(`depth-weighted mid:   ${dwMidBps} bps  (P(YES) ≈ ${(dwMidBps / 10_000).toFixed(4)})  [target ${formatUnits(target, 6)}/side]`);
  console.log(`  bid side used ${b.used} levels, notional ${formatUnits(b.notional, 6)}${b.notional < target ? " (THIN — G8 fail)" : ""}`);
  console.log(`  ask side used ${a.used} levels, notional ${formatUnits(a.notional, 6)}${a.notional < target ? " (THIN — G8 fail)" : ""}`);
  console.log("\nPHASE 0.4 OK — pool reads decode and a probability is derivable on-chain.");
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE 0.4 FAILED:", e);
  process.exit(1);
});
