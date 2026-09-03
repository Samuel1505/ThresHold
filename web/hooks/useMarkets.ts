"use client";

import { useQuery } from "@tanstack/react-query";
import type { MarketRow } from "@/lib/types";

interface WireRow extends Omit<MarketRow, "nonce"> {
  nonce: string;
}

const parse = (r: WireRow): MarketRow => ({ ...r, nonce: BigInt(r.nonce) });

async function fetchMarkets(id?: string): Promise<MarketRow[] | MarketRow | null> {
  const res = await fetch(id ? `/api/markets?id=${id}` : "/api/markets");
  const body = (await res.json()) as { rows: WireRow[] | WireRow | null; error?: string };
  if (body.error && (body.rows == null || (Array.isArray(body.rows) && body.rows.length === 0)))
    throw new Error(body.error);
  if (body.rows == null) return null;
  return Array.isArray(body.rows) ? body.rows.map(parse) : parse(body.rows);
}

/** Live binary markets (indexer discovery + on-chain pool/nonce/status). Polls 8s. */
export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: () => fetchMarkets() as Promise<MarketRow[]>,
    refetchInterval: 8000,
  });
}

export function useMarket(marketId?: string) {
  return useQuery({
    queryKey: ["market", marketId],
    queryFn: () => fetchMarkets(marketId!) as Promise<MarketRow | null>,
    enabled: Boolean(marketId),
    refetchInterval: 10000,
  });
}
