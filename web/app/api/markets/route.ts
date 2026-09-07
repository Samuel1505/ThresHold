import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { RPC_URL } from "@/lib/env";
import type { MarketRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Market discovery. The DreamDEX indexer is the only way to enumerate *new*
 * series, but it lags and intermittently times out — a hang here blanks the
 * whole markets page. So this works off a fixed set of the series this demo
 * targets and reads their authoritative state (nonce, expiry, finalized)
 * straight from the pool over RPC. Probability, gates and trigger state are
 * still read client-side (docs/03, docs/10). 5-second in-memory cache.
 */
const KNOWN: { marketId: `0x${string}`; pool: Address; asset: string; interval: string; venueId: string }[] = [
  {
    marketId: "0x0000000000000000000000000000000000000000000000000000000000013b54",
    pool: "0x36c22823B8C08b6546c5De439aa941EA73aA9b5a",
    asset: "BTC",
    interval: "1080h",
    venueId: "0x09567c41c2b819e512ebbfc896a7d795b901b9f15f7637726d97561d5276acb0",
  },
  {
    marketId: "0x0000000000000000000000000000000000000000000000000000000000013b55",
    pool: "0xC5Fa5aA238977bcC7C05290De2F1714b11559027",
    asset: "ETH",
    interval: "1080h",
    venueId: "0x09567c41c2b819e512ebbfc896a7d795b901b9f15f7637726d97561d5276acb0",
  },
  {
    marketId: "0x0000000000000000000000000000000000000000000000000000000000015778",
    pool: "0xb0B05FbC768388e5c5b6880084e64Fe7A26c363b",
    asset: "BTC",
    interval: "24h",
    venueId: "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c",
  },
  {
    marketId: "0x0000000000000000000000000000000000000000000000000000000000015779",
    pool: "0x06B0C35e61c7cEF10689B48500fC374867e33df4",
    asset: "ETH",
    interval: "24h",
    venueId: "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c",
  },
];

const POOL_ABI = [
  { type: "function", name: "marketNonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "marketExpiryNs", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "finalized", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

const rpc = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL, { batch: true }) });

let cache: { at: number; rows: MarketRow[] } | null = null;
const TTL = 5_000;

async function discover(): Promise<MarketRow[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const nowSec = Math.floor(Date.now() / 1000);

  const rows = (
    await Promise.all(
      KNOWN.map(async (m): Promise<MarketRow | null> => {
        try {
          const [nonce, expiryNs, finalized] = await rpc.multicall({
            allowFailure: false,
            contracts: [
              { address: m.pool, abi: POOL_ABI, functionName: "marketNonce" },
              { address: m.pool, abi: POOL_ABI, functionName: "marketExpiryNs" },
              { address: m.pool, abi: POOL_ABI, functionName: "finalized" },
            ],
          });
          const expiry = Number(expiryNs / 1_000_000_000n);
          if (finalized || expiry <= nowSec) return null;
          return {
            marketId: m.marketId,
            pool: m.pool,
            nonce,
            asset: m.asset,
            strike: "0",
            interval: m.interval,
            venueId: m.venueId,
            expiry,
            status: 1,
          };
        } catch {
          return null;
        }
      }),
    )
  )
    .filter((x): x is MarketRow => x !== null)
    .sort((a, b) => b.expiry - a.expiry);

  cache = { at: Date.now(), rows };
  return rows;
}

const json = (obj: unknown, status = 200) =>
  new NextResponse(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=5, stale-while-revalidate=15",
    },
  });

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  try {
    const rows = await discover();
    const body = id ? rows.find((r) => r.marketId.toLowerCase() === id.toLowerCase()) ?? null : rows;
    return json({ rows: body });
  } catch (e) {
    return json({ error: String((e as Error).message), rows: id ? null : [] }, 502);
  }
}
