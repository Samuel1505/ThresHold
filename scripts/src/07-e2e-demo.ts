/**
 * PHASE 5 — end-to-end on Shannon: cross the market, watch a real `TriggerExecuted`
 * fire with NO transaction sent to the target (docs/16).
 *
 *   THRESHOLD_REGISTRY=… THRESHOLD_HANDLER=… DEMO_VAULT=… TARGET_MARKET_ID=… \
 *   DEMO_TRADER_PRIVATE_KEY=… TRIGGER_ID=1 pnpm --filter @threshold/scripts exec tsx src/07-e2e-demo.ts
 *
 * Acceptance: a `TriggerExecuted` log from the handler, `DemoVault.safeBalance` increased,
 * and no `to == vault` transaction from us.
 */
import { parseAbi, formatEther, type Address, type Hex } from "viem";
import { ORDER_TYPE } from "@somnia-chain/markets-sdk";
import {
  sdkExchange,
  publicClient,
  TARGET_MARKET_ID,
  DEMO_TRADER_PRIVATE_KEY,
  BINARY_POOL_READ_ABI,
  EXPLORER_URL,
} from "./env.js";

const REGISTRY = process.env.THRESHOLD_REGISTRY?.trim() as Address;
const HANDLER = process.env.THRESHOLD_HANDLER?.trim() as Address;
const VAULT = process.env.DEMO_VAULT?.trim() as Address;
const TRIGGER_ID = BigInt(process.env.TRIGGER_ID ?? "1");
const SIZE = Number(process.env.CROSS_SIZE ?? 5);
const ONE = 1_000_000n;

const REGISTRY_ABI = parseAbi([
  "function get(uint256) view returns ((address owner,address pool,uint64 pinnedNonce,uint16 thresholdBps,uint8 direction,uint32 dwellSec,uint16 maxSpreadBps,uint128 minDepthPerSide,address target,bytes4 selector,bytes payload,uint32 actionGasCap,uint64 dwellStart,uint64 expiresAt,bool recurring,uint32 cooldownSec,uint64 lastExecutedAt,uint8 state))",
]);
const HANDLER_ABI = parseAbi([
  "event TriggerExecuted(uint256 indexed id, uint16 probabilityBps, bool success, bytes32 returndataHash)",
  "event DwellStarted(uint256 indexed id, uint64 dwellStart, uint32 dwellSec)",
  "event CallbackEntered(address indexed emitter, bytes32 topic0, uint256 triggerCount)",
]);
const VAULT_ABI = parseAbi([
  "function riskyBalance() view returns (uint256)",
  "function safeBalance() view returns (uint256)",
  "event Derisked(uint256 amount, uint256 blockNumber)",
]);

const STATE = ["NONE", "ARMED", "OBSERVING", "EXECUTED", "EXPIRED", "CANCELLED", "FAILED"];

async function triggerState() {
  const t = (await publicClient.readContract({
    address: REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "get",
    args: [TRIGGER_ID],
  })) as any;
  const raw = Number(t.state);
  return { state: STATE[raw] ?? `#${raw}`, raw, dwellStart: BigInt(t.dwellStart), dwellSec: Number(t.dwellSec), owner: t.owner };
}

async function vaultBalances() {
  const [risky, safe] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { address: VAULT, abi: VAULT_ABI, functionName: "riskyBalance" },
      { address: VAULT, abi: VAULT_ABI, functionName: "safeBalance" },
    ],
  });
  return { risky, safe };
}

async function main() {
  if (!REGISTRY || !HANDLER || !VAULT) throw new Error("set THRESHOLD_REGISTRY / _HANDLER / DEMO_VAULT");
  if (!DEMO_TRADER_PRIVATE_KEY) throw new Error("set DEMO_TRADER_PRIVATE_KEY");
  if (!TARGET_MARKET_ID) throw new Error("set TARGET_MARKET_ID");

  const exchange = sdkExchange(DEMO_TRADER_PRIVATE_KEY);
  const client = exchange.client;
  const onchain = await client.getMarketOnchain(TARGET_MARKET_ID as Hex);
  const pool = onchain.pool as Address;

  console.log(`registry ${REGISTRY}`);
  console.log(`handler  ${HANDLER}`);
  console.log(`vault    ${VAULT}`);
  console.log(`pool     ${pool}  nonce ${onchain.nonce}  status ${onchain.status}`);

  const t0 = await triggerState();
  const v0 = await vaultBalances();
  console.log(`\ntrigger #${TRIGGER_ID}: ${t0.state} (raw ${t0.raw})  owner ${t0.owner}`);
  console.log(`vault risky ${formatEther(v0.risky)} / safe ${formatEther(v0.safe)}`);
  if (["EXECUTED", "EXPIRED", "CANCELLED", "FAILED"].includes(t0.state)) {
    console.log("trigger already terminal — nothing to do.");
    process.exit(0);
  }

  // start watching the handler + vault
  const seen: string[] = [];
  const unwatchExec = publicClient.watchContractEvent({
    address: HANDLER,
    abi: HANDLER_ABI,
    onLogs: (logs) => {
      for (const l of logs) {
        if (l.eventName === "TriggerExecuted" && l.args.id === TRIGGER_ID) {
          seen.push("executed");
          console.log(
            `\n✓ TriggerExecuted  id=${l.args.id}  probabilityBps=${l.args.probabilityBps}  success=${l.args.success}`,
          );
          console.log(`  block ${l.blockNumber}  tx ${l.transactionHash}`);
          console.log(`  ${EXPLORER_URL}/tx/${l.transactionHash}`);
        }
        if (l.eventName === "DwellStarted" && l.args.id === TRIGGER_ID) {
          console.log(`  DwellStarted  dwellStart=${l.args.dwellStart}  dwellSec=${l.args.dwellSec}`);
        }
      }
    },
  });
  const unwatchDerisk = publicClient.watchContractEvent({
    address: VAULT,
    abi: VAULT_ABI,
    eventName: "Derisked",
    onLogs: (logs) => {
      for (const l of logs) {
        console.log(`  Derisked  amount=${formatEther(l.args.amount as bigint)}  block ${l.blockNumber}`);
      }
    },
  });

  // place a crossing order to wake the handler
  const [bids, asks] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { address: pool, abi: BINARY_POOL_READ_ABI, functionName: "getBookLevels", args: [true, 8n] },
      { address: pool, abi: BINARY_POOL_READ_ABI, functionName: "getBookLevels", args: [false, 8n] },
    ],
  });
  const bestAsk = asks[0]?.price;
  const bestBid = bids[0]?.price;
  const buy = bestAsk !== undefined;
  const ref = (buy ? bestAsk : bestBid)!;
  const price = buy ? ref + ONE / 200n : ref - ONE / 200n;
  const clamped = price <= 0n ? ONE / 1000n : price >= ONE ? ONE - ONE / 1000n : price;

  console.log(`\nplacing ${buy ? "BUY_YES" : "SELL_YES"} IOC size ${SIZE} @ ${Number(clamped) / 1e6}`);
  const trader = client.createTrader({ privateKey: DEMO_TRADER_PRIVATE_KEY, decimals: 6 });
  const res = await trader.placeOrder({
    pool,
    side: (buy ? "BUY_YES" : "SELL_YES") as any,
    price: clamped,
    quantity: BigInt(SIZE) * ONE,
    orderType: ORDER_TYPE.MARKET,
    expireTimestampNs: BigInt(Math.floor(Date.now() / 1000) + 300) * 1_000_000_000n,
  });
  if (res.receipt?.status === "reverted") throw new Error(`order reverted (${res.hash})`);
  const fillBlock = res.receipt.blockNumber;
  console.log(`fill tx ${res.hash}  block ${fillBlock}  fills ${res.fills.length}`);

  // poll trigger state; if it's OBSERVING, wait out the dwell then nudge once more
  const deadline = Date.now() + 120_000;
  let nudged = false;
  while (Date.now() < deadline && !seen.includes("executed")) {
    await new Promise((r) => setTimeout(r, 2500));
    const s = await triggerState();
    const v = await vaultBalances();
    process.stdout.write(`\r  ${s.state}  risky ${formatEther(v.risky)} safe ${formatEther(v.safe)}      `);
    if (s.state === "EXECUTED") break;
    if (s.state === "EXPIRED" || s.state === "FAILED") {
      console.log(`\ntrigger went ${s.state}`);
      break;
    }
    if (s.state === "OBSERVING" && !nudged) {
      const elapsed = BigInt(Math.floor(Date.now() / 1000)) - s.dwellStart;
      if (elapsed > BigInt(s.dwellSec) + 3n) {
        // dwell elapsed but no scheduled tick landed — place a second crossing fill to drive it
        nudged = true;
        console.log(`\n  dwell elapsed (${elapsed}s), no scheduled tick — nudging with a 2nd fill`);
        await trader
          .placeOrder({
            pool,
            side: (buy ? "BUY_YES" : "SELL_YES") as any,
            price: clamped,
            quantity: BigInt(SIZE) * ONE,
            orderType: ORDER_TYPE.MARKET,
            expireTimestampNs: BigInt(Math.floor(Date.now() / 1000) + 300) * 1_000_000_000n,
          })
          .catch((e) => console.log("  2nd fill failed:", (e as Error).message));
      }
    }
  }

  await new Promise((r) => setTimeout(r, 3000));
  unwatchExec();
  unwatchDerisk();

  const v1 = await vaultBalances();
  const t1 = await triggerState();
  console.log(`\n\n=== RESULT ===`);
  console.log(`trigger #${TRIGGER_ID}: ${t0.state} -> ${t1.state}`);
  console.log(`vault safe: ${formatEther(v0.safe)} -> ${formatEther(v1.safe)}   risky: ${formatEther(v0.risky)} -> ${formatEther(v1.risky)}`);
  if (seen.includes("executed") && v1.safe > v0.safe) {
    console.log(`fill block ${fillBlock}`);
    console.log("\n✅ PHASE 5 — a real TriggerExecuted fired and the vault de-risked, with NO transaction sent to it.");
    process.exit(0);
  }
  console.log("\n✗ not executed within the window — inspect handler CallbackEntered / GateFailed logs.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
