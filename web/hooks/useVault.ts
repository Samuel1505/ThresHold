"use client";

import { useReadContracts } from "wagmi";
import { VAULT_ABI } from "@/lib/abis";
import { DEMO_VAULT } from "@/lib/addresses";

const v = { address: DEMO_VAULT, abi: VAULT_ABI } as const;

/** DemoVault risky/safe balances. `safeBalance` carries a 1-wei sentinel — use `safeAmount`. */
export function useVault(refetchMs = 2000) {
  const q = useReadContracts({
    query: { refetchInterval: refetchMs },
    contracts: [
      { ...v, functionName: "riskyBalance" },
      { ...v, functionName: "safeAmount" },
      { ...v, functionName: "safeBalance" },
    ],
  });
  const get = (i: number) =>
    q.data?.[i]?.status === "success" ? (q.data[i]!.result as bigint) : 0n;
  return {
    risky: get(0),
    safe: get(1),
    total: get(0) + get(1),
    loaded: q.data?.every((r) => r.status === "success") ?? false,
    refetch: q.refetch,
  };
}
