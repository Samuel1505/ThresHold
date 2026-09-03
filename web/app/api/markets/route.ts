import { NextResponse } from "next/server";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { INDEXER_URL, WS_RPC_URL, VENUE_ID } from "@/lib/env";
import type { MarketRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Market discovery only — the indexer lags the chain by seconds, so this returns
 * display metadata + the authoritative on-chain (pool, nonce, status, expiry) via
 * `getMarketOnchain`. Probability, gates and trigger state are read client-side via
 * `eth_call`, never from here (docs/03, docs/10). 5-second in-memory cache.
 */
let cache: { at: number; rows: MarketRow[] } | null = null;
const TTL = 5_000;

// one SDK client for the process (its ws transport is fine to keep open)
let sdk: SomniaMarkets | null = null;
function client() {
  if (!sdk) {
    sdk = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
    });
  }
  return sdk.client;
}

async function discover(): Promise<MarketRow[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;

  const c = client();
  const nowSec = Math.floor(Date.now() / 1000);
  const rows = await c.listBinaryMarkets({
    ...(VENUE_ID ? { venueId: VENUE_ID } : {}),
    status: "Trading",
    limit: 60,
  });

  const resolved = await Promise.all(
    rows.map(async (r): Promise<MarketRow | null> => {
      try {
        const oc = await c.getMarketOnchain(r.marketId as `0x${string}`);
        const expiry = Number(oc.expiry);
        if (oc.status !== 1 || oc.finalized || expiry <= nowSec) return null;
        return {
          marketId: r.marketId as `0x${string}`,
          pool: oc.pool as `0x${string}`,
          nonce: oc.nonce,
          asset: r.asset ?? "?",
          strike: String(r.strike ?? "0"),
          interval: r.interval ?? String(r.intervalSec ?? "?"),
          venueId: String(r.venueId ?? ""),
          expiry,
          status: oc.status,
        };
      } catch {
        return null;
      }
    }),
  );

  const live = resolved
    .filter((x): x is MarketRow => x !== null)
    .sort((a, b) => b.expiry - a.expiry);

  cache = { at: Date.now(), rows: live };
  return live;
}

const json = (obj: unknown, status = 200) =>
  new NextResponse(
    JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=5, stale-while-revalidate=15",
      },
    },
  );

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
