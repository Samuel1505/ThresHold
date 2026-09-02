/**
 * Shared config for the PHASE 0 scripts. Loads the repo-root .env (walking up),
 * pins the SDK-verified Shannon values, and exposes a read-only viem client plus
 * an SDK client. Never logs a private key.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenv } from "dotenv";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

function loadRootEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      dotenv({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv();
}
loadRootEnv();

const req = (name: string, fallback?: string): string => {
  const v = process.env[name]?.trim() || fallback;
  if (!v) throw new Error(`missing env ${name} — see .env.example`);
  return v;
};

/** Shannon testnet, chain 50312. RPC confirmed from docs.somnia.network 2026-09-02. */
export const CHAIN_ID = 50312;
export const RPC_URL = req("SOMNIA_SHANNON_RPC", "https://api.infra.testnet.somnia.network");
export const WS_RPC_URL = req("SOMNIA_SHANNON_WS_RPC", "wss://api.infra.testnet.somnia.network/ws");
/** GraphQL indexer (from dreamdex-bot-kit ec-core/config.ts — NOT the REST URL in docs/02). */
export const INDEXER_URL = req("DREAMDEX_INDEXER_URL", "https://dev.smk.somnia.host/v1/graphql");
export const EXPLORER_URL = req("SOMNIA_EXPLORER_URL", "https://shannon-explorer.somnia.network");

/** DreamDEX protocol addresses — CREATE3-deterministic, identical on both chains (docs/02). */
export const DREAMDEX = {
  binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388" as Address,
  marketsCore: "0x2802504314685D89bF6C992CA5a8e7cC78bc0294" as Address,
  binarySettlement: "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23" as Address,
  oracleHub: "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b" as Address,
  testUsdc: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as Address,
} as const;

/** Optional venue scope; read off a live market row if unset (venue ids move). */
export const VENUE_ID = process.env.VENUE_ID?.trim() as Hex | undefined;

/** Optional: a specific pool to target in scripts 04/05/06. */
export const TARGET_POOL = process.env.TARGET_POOL?.trim() as Address | undefined;
export const TARGET_MARKET_ID = process.env.TARGET_MARKET_ID?.trim() as Hex | undefined;

export const DEMO_TRADER_PRIVATE_KEY = process.env.DEMO_TRADER_PRIVATE_KEY?.trim() as
  | Hex
  | undefined;

export const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(RPC_URL),
});

/** A SomniaMarkets exchange. Pass a key to enable `.trader` (writes). `.client`
 *  is the read tier: listBinaryMarkets, getMarketOnchain, getViemClient, createTrader. */
export function sdkExchange(privateKey?: Hex) {
  return new SomniaMarkets({
    indexerUrl: INDEXER_URL,
    chain: somniaShannon,
    wsRpcUrl: WS_RPC_URL,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    ...(privateKey ? { privateKey } : {}),
  });
}

/** keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)") — cast keccak. */
export const ORDER_FILLED_TOPIC0 =
  "0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399" as Hex;

export const ORDER_FILLED_ABI = [
  {
    type: "event",
    name: "OrderFilled",
    inputs: [
      { name: "takerOrderId", type: "uint128", indexed: true },
      { name: "makerOrderId", type: "uint128", indexed: true },
      { name: "quantityFilled", type: "uint256", indexed: false },
      { name: "takerRemainingQuantity", type: "uint256", indexed: false },
      { name: "makerRemainingQuantity", type: "uint256", indexed: false },
      { name: "fillPrice", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Minimal BinaryPool read ABI — the exact signatures from markets-sdk@0.28.1 readsAbi.ts.
 *  NOTE: `closingTop` is 0.29.0-only and absent here on purpose (docs/02 PHASE 0 RESULTS).
 *  Threshold derives top-of-book from getBookLevels(isBid, 1). */
export const BINARY_POOL_READ_ABI = [
  {
    type: "function",
    name: "getBookLevels",
    stateMutability: "view",
    inputs: [
      { name: "isBid", type: "bool" },
      { name: "numLevels", type: "uint64" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "price", type: "uint256" },
          { name: "quantity", type: "uint256" },
        ],
      },
    ],
  },
  { type: "function", name: "marketNonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "finalized", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "booksEmpty", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "marketExpiryNs", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "setBacking", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getBinaryPoolParams",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "collateralToken", type: "address" },
          { name: "market", type: "address" },
          { name: "outcomeToken", type: "address" },
          { name: "yesId", type: "uint256" },
          { name: "noId", type: "uint256" },
          { name: "oneCollateral", type: "uint256" },
          { name: "setBacking", type: "uint256" },
          { name: "feeRecipient", type: "address" },
          { name: "makerFeeBpsTimes1k", type: "uint256" },
          { name: "takerFeeBpsTimes1k", type: "uint256" },
          { name: "maxBuilderFeeBpsTimes1k", type: "uint256" },
          { name: "settlementFeeBpsTimes1k", type: "uint256" },
          { name: "settlement", type: "address" },
          { name: "marketNonce", type: "uint64" },
          { name: "finalized", type: "bool" },
        ],
      },
    ],
  },
] as const;
