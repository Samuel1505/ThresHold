/**
 * PHASE 0.5 — verify the OrderFilled topic0 against a REAL emitted log (docs/16).
 *
 * The SDK carries a documented incident where a wrong ABI arity produced a
 * different topic0 and watchEvent silently filtered on something no pool ever
 * emitted. So we do not trust the computed constant: we pull an actual
 * OrderFilled log from the target pool (recent history, or by waiting for the
 * next fill) and compare its topics[0] to keccak256 of the exact signature.
 *
 *   TARGET_POOL=0x... pnpm phase0:topic0
 *
 * Gate: a real log's topics[0] === ORDER_FILLED_TOPIC0, and its data decodes to
 * six fields with the last being fillPrice. Mismatch -> re-derive from the log
 * and correct the constant in env.ts AND MinimalSubscriber.sol (adversarial A1).
 */
import { decodeEventLog, keccak256, toHex, type Address, type Log } from "viem";
import { publicClient, TARGET_POOL, ORDER_FILLED_TOPIC0, ORDER_FILLED_ABI, EXPLORER_URL } from "./env.js";

const SIG = "OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)";

/** topic0 -> name, for the shared OrderBook base events (markets-sdk eventsAbi.ts). */
const KNOWN: Record<string, string> = {
  [keccak256(toHex("OrderPlaced((uint128,bool,address,uint64,uint256,uint256,uint256,uint64))"))]: "OrderPlaced?",
  [keccak256(toHex("OrderRested(uint128)"))]: "OrderRested",
  [keccak256(toHex("OrderCancelled(uint128)"))]: "OrderCancelled",
  [keccak256(toHex("OrderExpired(uint128)"))]: "OrderExpired",
  [keccak256(toHex("OrderReduced(uint128,uint256)"))]: "OrderReduced",
  [keccak256(toHex(SIG))]: "OrderFilled",
  [keccak256(toHex("OrderCancelledSelfMatch(uint128)"))]: "OrderCancelledSelfMatch",
};
const name = (t?: string) => (t ? KNOWN[t] ?? t.slice(0, 10) + "…" : "?");

/** An OrderFilled has 3 topics (sig + 2 indexed uint128) and 4 x uint256 = 128 bytes of data.
 *  A log with that exact shape but a different topic0 is the SDK's documented arity bug. */
const looksLikeOrderFilled = (l: Log) => l.topics.length === 3 && (l.data.length - 2) / 2 === 128;

type Found = { log: Log; kind: "match" | "arity-bug" };

function classify(logs: readonly Log[], seen: Set<string>): Found | undefined {
  for (const l of logs) {
    const t0 = l.topics[0];
    if (t0) seen.add(name(t0));
    if (t0 === ORDER_FILLED_TOPIC0) return { log: l, kind: "match" };
    if (t0 && t0 !== ORDER_FILLED_TOPIC0 && looksLikeOrderFilled(l)) return { log: l, kind: "arity-bug" };
  }
  return undefined;
}

async function findRecentLog(pool: Address, seen: Set<string>): Promise<Found | undefined> {
  const latest = await publicClient.getBlockNumber();
  const WINDOW = BigInt(process.env.SCAN_BLOCKS ?? 60_000);
  const CHUNK = 5_000n;
  const from = latest > WINDOW ? latest - WINDOW : 0n;
  for (let hi = latest; hi > from; hi -= CHUNK) {
    const lo = hi - CHUNK > from ? hi - CHUNK : from;
    const logs = await publicClient.getLogs({ address: pool, fromBlock: lo, toBlock: hi }).catch(() => []);
    const hit = classify(logs, seen);
    if (hit) return hit;
  }
  return undefined;
}

async function waitForLog(pool: Address, seen: Set<string>, timeoutMs = 180_000): Promise<Found | undefined> {
  console.log(`no OrderFilled in recent history — watching ${pool} for the next fill (${timeoutMs / 1000}s)…`);
  console.log("(place a crossing order in another shell — pnpm phase0:cross — or run ec-maker/ec-starter)");
  return new Promise((resolve) => {
    const unwatch = publicClient.watchEvent({
      address: pool,
      onLogs: (logs) => {
        const hit = classify(logs, seen);
        if (hit) {
          unwatch();
          resolve(hit);
        }
      },
    });
    setTimeout(() => {
      unwatch();
      resolve(undefined);
    }, timeoutMs);
  });
}

async function main() {
  const pool = TARGET_POOL as Address | undefined;
  if (!pool) throw new Error("set TARGET_POOL in .env (run pnpm phase0:discover first)");

  const computed = keccak256(toHex(SIG));
  console.log(`signature:        ${SIG}`);
  console.log(`keccak256(sig):   ${computed}`);
  console.log(`env constant:     ${ORDER_FILLED_TOPIC0}`);
  if (computed !== ORDER_FILLED_TOPIC0) {
    console.error("✗ env.ts ORDER_FILLED_TOPIC0 does not even match keccak(sig) — fix env.ts first.");
    process.exit(1);
  }
  console.log("✓ constant matches the signature hash. Now checking a real emitted log…\n");

  const seen = new Set<string>();
  let found = await findRecentLog(pool, seen);
  if (!found) found = await waitForLog(pool, seen);

  if (!found) {
    console.log(`\nNo OrderFilled observed (saw: ${[...seen].join(", ") || "nothing"}).`);
    console.log("The pool is live but nothing crossed. Run pnpm phase0:cross or ec-maker, then retry.");
    process.exit(2); // inconclusive, not a failure
  }

  const { log, kind } = found;
  console.log(`block ${log.blockNumber}  tx ${log.transactionHash}`);
  console.log(`${EXPLORER_URL}/tx/${log.transactionHash}`);
  console.log(`topics[0]:        ${log.topics[0]}  (${name(log.topics[0])})`);

  if (kind === "arity-bug") {
    console.error(
      `\n✗ MISMATCH — a log with OrderFilled's exact shape (3 topics, 128B data) but topic0 ${log.topics[0]}.\n` +
        "  This IS the SDK's documented arity bug. Set ORDER_FILLED_TOPIC0 in scripts/src/env.ts AND\n" +
        "  contracts/src/phase0/MinimalSubscriber.sol to the value above; record it in docs/02.",
    );
    process.exit(1);
  }

  try {
    const decoded = decodeEventLog({ abi: ORDER_FILLED_ABI, topics: log.topics, data: log.data });
    console.log(
      "✓ decodes as OrderFilled:",
      JSON.stringify(decoded.args, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    );
    console.log("\n✓ PHASE 0.5 OK — topic0 CONFIRMED against a real emitted log; fillPrice is non-indexed (rides in data).");
  } catch (e) {
    console.error("✗ topic0 matched but data did not decode as 6-field OrderFilled:", (e as Error).message);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE 0.5 FAILED:", e);
  process.exit(1);
});
