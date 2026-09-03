"use client";

import { useBalance, useReadContracts } from "wagmi";
import { REGISTRY_ABI } from "@/lib/abis";
import { REGISTRY } from "@/lib/addresses";
import { somniaShannon } from "@/lib/chain";

const reg = { address: REGISTRY, abi: REGISTRY_ABI } as const;

/** The 32-STT subscription floor — SUBSCRIPTION_OWNER_MINIMUM_BALANCE (docs/05). */
export const MIN_SUB_BALANCE = 32n * 10n ** 18n;
/** UI warns below this (docs/01, docs/09). */
export const WARN_SUB_BALANCE = 35n * 10n ** 18n;

export function useRegistryInfo() {
  const balance = useBalance({
    address: REGISTRY,
    chainId: somniaShannon.id,
    query: { refetchInterval: 8000 },
  });

  const cfg = useReadContracts({
    query: { refetchInterval: 15000, staleTime: 10000 },
    contracts: [
      { ...reg, functionName: "paused" },
      { ...reg, functionName: "nextTriggerId" },
      { ...reg, functionName: "handler" },
      { ...reg, functionName: "MAX_TRIGGERS_PER_POOL" },
      { ...reg, functionName: "MAX_ACTION_GAS" },
      { ...reg, functionName: "MIN_DWELL_SEC" },
      { ...reg, functionName: "MAX_DWELL_SEC" },
      { ...reg, functionName: "getSubscribedPools" },
    ],
  });

  const v = <T,>(i: number) => (cfg.data?.[i]?.status === "success" ? (cfg.data[i]!.result as T) : undefined);
  const bal = balance.data?.value ?? 0n;

  return {
    balance: bal,
    balanceLoaded: !balance.isLoading && balance.data !== undefined,
    underMin: balance.data !== undefined && bal < MIN_SUB_BALANCE,
    warn: balance.data !== undefined && bal < WARN_SUB_BALANCE,
    paused: v<boolean>(0),
    nextTriggerId: v<bigint>(1),
    handler: v<`0x${string}`>(2),
    maxTriggersPerPool: v<number>(3),
    maxActionGas: v<number>(4),
    minDwellSec: v<number>(5),
    maxDwellSec: v<number>(6),
    subscribedPools: (v<readonly `0x${string}`[]>(7) ?? []) as readonly `0x${string}`[],
  };
}
