"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { BINARY_POOL_ABI } from "@/lib/abis";
import { snapshot } from "@/lib/probability";
import type { PoolSnapshot, RawLevel } from "@/lib/types";

const MAX_LEVELS = 8n;

/**
 * Reads the exact on-chain state the handler reads — `getBinaryPoolParams`,
 * `marketNonce`, `finalized`, `marketExpiryNs`, `getBookLevels(true/false, 8)` —
 * in one multicall, then runs the TS port of `ProbabilityLib.snapshot`. This is
 * the ONLY probability source in the UI (never the REST indexer). Polls at 2s.
 */
export function usePoolSnapshot(pool?: Address, refetchMs = 2000) {
  const enabled = Boolean(pool);
  const q = useReadContracts({
    query: { enabled, refetchInterval: refetchMs, staleTime: 1000 },
    contracts: enabled
      ? [
          { address: pool!, abi: BINARY_POOL_ABI, functionName: "getBinaryPoolParams" },
          { address: pool!, abi: BINARY_POOL_ABI, functionName: "marketNonce" },
          { address: pool!, abi: BINARY_POOL_ABI, functionName: "finalized" },
          { address: pool!, abi: BINARY_POOL_ABI, functionName: "marketExpiryNs" },
          { address: pool!, abi: BINARY_POOL_ABI, functionName: "getBookLevels", args: [true, MAX_LEVELS] },
          { address: pool!, abi: BINARY_POOL_ABI, functionName: "getBookLevels", args: [false, MAX_LEVELS] },
        ]
      : [],
  });

  const snap = useMemo<PoolSnapshot | null>(() => {
    if (!q.data || q.data.some((r) => r.status !== "success")) return null;
    const [params, nonce, finalized, expiryNs, bids, asks] = q.data.map((r) => r.result) as [
      { oneCollateral: bigint; marketNonce: bigint; market: Address },
      bigint,
      boolean,
      bigint,
      readonly RawLevel[],
      readonly RawLevel[],
    ];
    return snapshot({
      oneCollateral: params.oneCollateral,
      marketNonce: nonce,
      finalized,
      marketExpiryNs: expiryNs,
      bids: bids.map((l) => ({ price: l.price, quantity: l.quantity })),
      asks: asks.map((l) => ({ price: l.price, quantity: l.quantity })),
    });
  }, [q.data]);

  const marketAddress = q.data?.[0]?.status === "success"
    ? ((q.data[0].result as { market: Address }).market)
    : undefined;

  return {
    snapshot: snap,
    marketAddress,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    dataUpdatedAt: q.dataUpdatedAt,
  };
}
