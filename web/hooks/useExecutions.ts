"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Log } from "viem";
import { HANDLER } from "@/lib/addresses";

const EXECUTED = parseAbiItem(
  "event TriggerExecuted(uint256 indexed id, uint16 probabilityBps, bool success, bytes32 returndataHash)",
);

export interface ExecEvent {
  id: bigint;
  probabilityBps: number;
  success: boolean;
  block: bigint;
  tx: `0x${string}`;
}

/** Recent `TriggerExecuted` logs — scans a bounded window in ≤1000-block chunks
 *  (Shannon's getLogs cap). Refreshes every 12s; live watch is per-trigger. */
export function useRecentExecutions(chunks = 6) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["executions"],
    enabled: Boolean(client),
    refetchInterval: 12_000,
    queryFn: async (): Promise<ExecEvent[]> => {
      if (!client) return [];
      const latest = await client.getBlockNumber();
      const out: ExecEvent[] = [];
      for (let i = 0; i < chunks; i++) {
        const to = latest - BigInt(i) * 1000n;
        const from = to > 1000n ? to - 999n : 0n;
        if (from > to) break;
        const logs = (await client
          .getLogs({ address: HANDLER, event: EXECUTED, fromBlock: from, toBlock: to })
          .catch(() => [])) as Log<bigint, number, false, typeof EXECUTED>[];
        for (const l of logs) {
          out.push({
            id: l.args.id!,
            probabilityBps: Number(l.args.probabilityBps),
            success: Boolean(l.args.success),
            block: l.blockNumber!,
            tx: l.transactionHash!,
          });
        }
        if (from === 0n) break;
      }
      return out.sort((a, b) => Number(b.block - a.block));
    },
  });
}
