/**
 * PHASE 0.6 + 0.7 — place a crossing order, prove the callback fires, and check
 * whether it lands in the same block as the fill (docs/16).
 *
 * Requires a two-sided book on the target market (run dreamdex-bot-kit `ec-maker`
 * against it first — see docs/PHASE0-RUNBOOK.md), plus:
 *   DEMO_TRADER_PRIVATE_KEY   a funded key, DIFFERENT from any quoter's (self-match is blocked)
 *   TARGET_MARKET_ID          bytes32 (from pnpm phase0:discover)
 *   SUBSCRIBER_ADDRESS        the MinimalSubscriber deployed + subscribed in 0.2
 *
 *   pnpm phase0:cross
 *
 * Gate 0.6: MinimalSubscriber.callbackCount increases after the fill.
 * Result 0.7: prints fillBlock vs callbackBlock. Same -> "same block" pitch holds.
 *             Different -> not fatal; change wording to "automatically, no keeper".
 */
import { parseAbi, type Address, type Hex } from "viem";
import { ORDER_TYPE } from "@somnia-chain/markets-sdk";
import {
  sdkExchange,
  publicClient,
  TARGET_MARKET_ID,
  DEMO_TRADER_PRIVATE_KEY,
  BINARY_POOL_READ_ABI,
  EXPLORER_URL,
} from "./env.js";

const SUBSCRIBER_ABI = parseAbi([
  "function callbackCount() view returns (uint256)",
  "function callbacksLength() view returns (uint256)",
  "function callbacks(uint256) view returns (address emitter, bytes32 topic0, uint256 blockNumber, uint256 timestamp, bytes data)",
  "function lastSubscriptionId() view returns (uint256)",
]);

const SIZE_SHARES = Number(process.env.CROSS_SIZE ?? 5); // outcome tokens
const ONE = 1_000_000n; // 6dp Shannon

async function main() {
  if (!DEMO_TRADER_PRIVATE_KEY) throw new Error("set DEMO_TRADER_PRIVATE_KEY in .env");
  if (!TARGET_MARKET_ID) throw new Error("set TARGET_MARKET_ID in .env (pnpm phase0:discover)");
  const subscriber = process.env.SUBSCRIBER_ADDRESS?.trim() as Address | undefined;

  const exchange = sdkExchange(DEMO_TRADER_PRIVATE_KEY);
  const client = exchange.client;
  const onchain = await client.getMarketOnchain(TARGET_MARKET_ID as Hex);
  const pool = onchain.pool as Address;
  console.log(`market ${TARGET_MARKET_ID}`);
  console.log(`pool   ${pool}  nonce ${onchain.nonce}  status ${onchain.status}  expiry ${onchain.expiry}`);
  if (onchain.status !== 1 || onchain.finalized) throw new Error("market is not Trading — pick another (pnpm phase0:discover)");

  const [bids, asks] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { address: pool, abi: BINARY_POOL_READ_ABI, functionName: "getBookLevels", args: [true, 8n] },
      { address: pool, abi: BINARY_POOL_READ_ABI, functionName: "getBookLevels", args: [false, 8n] },
    ],
  });
  const bestAsk = asks[0]?.price;
  const bestBid = bids[0]?.price;
  if (bestAsk === undefined && bestBid === undefined) {
    throw new Error("empty book — run ec-maker against this market first (docs/PHASE0-RUNBOOK.md)");
  }

  // Cross whatever side has liquidity: buy YES into the ask, else sell YES into the bid.
  const buy = bestAsk !== undefined;
  const side = buy ? "BUY_YES" : "SELL_YES";
  const refPrice = (buy ? bestAsk : bestBid)!;
  // price the IOC through the touch so it definitely crosses
  const price = buy ? (refPrice + 5n * ONE / 1000n) : (refPrice - 5n * ONE / 1000n);
  const priceClamped = price <= 0n ? ONE / 1000n : price >= ONE ? ONE - ONE / 1000n : price;

  const countBefore = subscriber
    ? await publicClient.readContract({ address: subscriber, abi: SUBSCRIBER_ABI, functionName: "callbackCount" })
    : -1n;

  console.log(`\nplacing ${side} IOC  size ${SIZE_SHARES}  price ${Number(priceClamped) / 1e6}  (touch ${Number(refPrice) / 1e6})`);
  const trader = client.createTrader({ privateKey: DEMO_TRADER_PRIVATE_KEY, decimals: 6 });
  const res = await trader.placeOrder({
    pool,
    side: side as any,
    price: priceClamped,
    quantity: BigInt(SIZE_SHARES) * ONE,
    orderType: ORDER_TYPE.MARKET, // IOC
    expireTimestampNs: BigInt(Math.floor(Date.now() / 1000) + 300) * 1_000_000_000n,
  });
  if (res.receipt?.status === "reverted") {
    throw new Error(`order tx REVERTED (${res.hash}) — SDK does not throw on revert; check book/balances`);
  }
  const fillBlock = res.receipt.blockNumber;
  console.log(`fill tx ${res.hash}`);
  console.log(`${EXPLORER_URL}/tx/${res.hash}`);
  console.log(`fill block: ${fillBlock}   fills: ${res.fills.length}`);
  if (res.fills.length === 0) {
    console.log("⚠ no fills — the IOC did not cross (book moved). Re-run, or widen CROSS_SIZE / check ec-maker.");
  }

  if (!subscriber) {
    console.log("\n(SUBSCRIBER_ADDRESS not set — skipping 0.6/0.7 callback check. Deploy + subscribe MinimalSubscriber, then re-run.)");
    process.exit(0);
  }

  // Poll for the callback (0.6) and record its block (0.7).
  console.log("\nwaiting for the reactivity callback…");
  const deadline = Date.now() + 60_000;
  let seen = false;
  while (Date.now() < deadline) {
    const count = await publicClient.readContract({ address: subscriber, abi: SUBSCRIBER_ABI, functionName: "callbackCount" });
    if (count > countBefore) {
      const len = await publicClient.readContract({ address: subscriber, abi: SUBSCRIBER_ABI, functionName: "callbacksLength" });
      const cb = await publicClient.readContract({
        address: subscriber,
        abi: SUBSCRIBER_ABI,
        functionName: "callbacks",
        args: [len - 1n],
      });
      const callbackBlock = cb[2];
      console.log(`\n✓ PHASE 0.6 — callback fired. count ${countBefore} -> ${count}`);
      console.log(`  emitter ${cb[0]}  topic0 ${cb[1]}  dataLen ${(cb[4] as Hex).length / 2 - 1}`);
      console.log(`\nPHASE 0.7 — fill block ${fillBlock}  vs  callback block ${callbackBlock}`);
      if (callbackBlock === fillBlock) {
        console.log('  SAME BLOCK ✓ — the "executes in the same block as the fill" claim holds.');
      } else {
        console.log(`  +${callbackBlock - fillBlock} block(s) — not fatal. Change pitch to "automatically, no keeper".`);
      }
      seen = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!seen) {
    console.error(
      "\n✗ PHASE 0.6 — no callback within 60s. Check, in order (docs/18):\n" +
        "  1. topic0 (run pnpm phase0:topic0)\n" +
        "  2. subscribed to the POOL address, not the market/module\n" +
        "  3. poolSubscriptionId / lastSubscriptionId != 0\n" +
        "  4. subscriber balance still >= 32 STT\n" +
        "  5. handler ERC-165 intact",
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE 0.6/0.7 FAILED:", e);
  process.exit(1);
});
