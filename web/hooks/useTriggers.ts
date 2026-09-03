"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { REGISTRY_ABI } from "@/lib/abis";
import { REGISTRY } from "@/lib/addresses";
import { isActive, TriggerState, type Trigger } from "@/lib/types";

/** viem decodes the `get()` tuple as an object keyed by the struct's component names. */
export type RawTrigger = {
  owner: `0x${string}`;
  pool: `0x${string}`;
  pinnedNonce: bigint;
  thresholdBps: number;
  direction: number;
  dwellSec: number;
  maxSpreadBps: number;
  minDepthPerSide: bigint;
  target: `0x${string}`;
  selector: `0x${string}`;
  payload: `0x${string}`;
  actionGasCap: number;
  dwellStart: bigint;
  expiresAt: bigint;
  recurring: boolean;
  cooldownSec: number;
  lastExecutedAt: bigint;
  state: number;
};

export function parseTrigger(id: bigint, r: RawTrigger): Trigger {
  return {
    id,
    owner: r.owner,
    pool: r.pool,
    pinnedNonce: r.pinnedNonce,
    thresholdBps: r.thresholdBps,
    direction: r.direction as Trigger["direction"],
    dwellSec: r.dwellSec,
    maxSpreadBps: r.maxSpreadBps,
    minDepthPerSide: r.minDepthPerSide,
    target: r.target,
    selector: r.selector,
    payload: r.payload,
    actionGasCap: r.actionGasCap,
    dwellStart: r.dwellStart,
    expiresAt: r.expiresAt,
    recurring: r.recurring,
    cooldownSec: r.cooldownSec,
    lastExecutedAt: r.lastExecutedAt,
    state: r.state as TriggerState,
  };
}

const reg = { address: REGISTRY, abi: REGISTRY_ABI } as const;

/** All triggers owned by the connected wallet. */
export function useMyTriggers() {
  const { address } = useAccount();
  const ids = useReadContract({
    ...reg,
    functionName: "triggersByOwner",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 5000 },
  });

  const idList = (ids.data ?? []) as readonly bigint[];
  const details = useReadContracts({
    query: { enabled: idList.length > 0, refetchInterval: 3000 },
    contracts: idList.map((id) => ({ ...reg, functionName: "get" as const, args: [id] as const })),
  });

  const triggers = useMemo<Trigger[]>(() => {
    if (!details.data) return [];
    return idList
      .map((id, i) => {
        const d = details.data![i];
        return d?.status === "success" ? parseTrigger(id, d.result as unknown as RawTrigger) : null;
      })
      .filter((t): t is Trigger => t !== null)
      .sort((a, b) => Number(b.id - a.id));
  }, [idList, details.data]);

  return {
    triggers,
    active: triggers.filter((t) => isActive(t.state)),
    isLoading: ids.isLoading || details.isLoading,
    refetch: () => {
      ids.refetch();
      details.refetch();
    },
  };
}

/** One trigger by id — polls fast while it can still change. */
export function useTrigger(id?: bigint) {
  const q = useReadContract({
    ...reg,
    functionName: "get",
    args: id !== undefined ? [id] : undefined,
    query: {
      enabled: id !== undefined,
      refetchInterval: (query) => {
        const t = query.state.data as unknown as RawTrigger | undefined;
        return t && !isActive((t as any)?.state as TriggerState) ? false : 1500;
      },
    },
  });
  const trigger = q.data && id !== undefined ? parseTrigger(id, q.data as unknown as RawTrigger) : undefined;
  return { trigger, isLoading: q.isLoading, refetch: q.refetch, dataUpdatedAt: q.dataUpdatedAt };
}

/** Triggers on a specific pool (any owner) — for the market detail page. */
export function usePoolTriggers(pool?: `0x${string}`) {
  const ids = useReadContract({
    ...reg,
    functionName: "triggersByPool",
    args: pool ? [pool] : undefined,
    query: { enabled: Boolean(pool), refetchInterval: 5000 },
  });
  const idList = (ids.data ?? []) as readonly bigint[];
  const details = useReadContracts({
    query: { enabled: idList.length > 0, refetchInterval: 4000 },
    contracts: idList.map((id) => ({ ...reg, functionName: "get" as const, args: [id] as const })),
  });
  const triggers = useMemo<Trigger[]>(() => {
    if (!details.data) return [];
    return idList
      .map((id, i) => {
        const d = details.data![i];
        return d?.status === "success" ? parseTrigger(id, d.result as unknown as RawTrigger) : null;
      })
      .filter((t): t is Trigger => t !== null);
  }, [idList, details.data]);
  return { triggers, count: idList.length };
}
