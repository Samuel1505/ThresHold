"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { HANDLER_ABI, REGISTRY_ABI } from "@/lib/abis";
import { HANDLER, REGISTRY } from "@/lib/addresses";

export interface FeedEntry {
  kind:
    | "created"
    | "callback"
    | "dwell-start"
    | "dwell-reset"
    | "gate-failed"
    | "state"
    | "expired"
    | "executed";
  at: number; // client-side wall clock
  block?: bigint;
  tx?: `0x${string}`;
  detail: string;
}

const GATE_NAME: Record<number, string> = {
  6: "two-sided (G6)",
  7: "spread (G7)",
  8: "depth (G8)",
  0: "threshold",
};
const STATE_NAME = ["none", "armed", "observing", "executed", "expired", "cancelled", "failed"];

/**
 * Live lifecycle feed for one trigger — watches the handler + registry events for
 * that id. `watchContractEvent` over the public RPC (docs/09), no indexer.
 */
export function useTriggerFeed(id?: bigint, cap = 40) {
  const client = usePublicClient();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    if (id === undefined || !client) return;
    setEntries([]);
    const push = (e: FeedEntry) =>
      setEntries((prev) => [e, ...prev].slice(0, cap));

    const unwatchers = [
      client.watchContractEvent({
        address: HANDLER,
        abi: HANDLER_ABI,
        eventName: "DwellStarted",
        args: { id },
        onLogs: (logs) =>
          logs.forEach((l) =>
            push({
              kind: "dwell-start",
              at: Date.now(),
              block: l.blockNumber ?? undefined,
              tx: l.transactionHash ?? undefined,
              detail: `dwell started · ${l.args.dwellSec}s`,
            }),
          ),
      }),
      client.watchContractEvent({
        address: HANDLER,
        abi: HANDLER_ABI,
        eventName: "DwellReset",
        args: { id },
        onLogs: (logs) =>
          logs.forEach((l) =>
            push({ kind: "dwell-reset", at: Date.now(), block: l.blockNumber ?? undefined, tx: l.transactionHash ?? undefined, detail: "dwell reset — signal fell away" }),
          ),
      }),
      client.watchContractEvent({
        address: HANDLER,
        abi: HANDLER_ABI,
        eventName: "GateFailed",
        args: { id },
        onLogs: (logs) =>
          logs.forEach((l) =>
            push({ kind: "gate-failed", at: Date.now(), block: l.blockNumber ?? undefined, tx: l.transactionHash ?? undefined, detail: `gate failed — ${GATE_NAME[Number(l.args.gate)] ?? `G${l.args.gate}`}` }),
          ),
      }),
      client.watchContractEvent({
        address: HANDLER,
        abi: HANDLER_ABI,
        eventName: "TriggerExpired",
        args: { id },
        onLogs: (logs) =>
          logs.forEach((l) =>
            push({ kind: "expired", at: Date.now(), block: l.blockNumber ?? undefined, tx: l.transactionHash ?? undefined, detail: Number(l.args.reason) === 1 ? "expired — pool recycled onto a new market" : "expired — market finalized or past deadline" }),
          ),
      }),
      client.watchContractEvent({
        address: HANDLER,
        abi: HANDLER_ABI,
        eventName: "TriggerExecuted",
        args: { id },
        onLogs: (logs) =>
          logs.forEach((l) =>
            push({
              kind: "executed",
              at: Date.now(),
              block: l.blockNumber ?? undefined,
              tx: l.transactionHash ?? undefined,
              detail: `executed at ${(Number(l.args.probabilityBps) / 100).toFixed(2)}% · action ${l.args.success ? "succeeded" : "reverted"}`,
            }),
          ),
      }),
      client.watchContractEvent({
        address: REGISTRY,
        abi: REGISTRY_ABI,
        eventName: "TriggerStateChanged",
        args: { id },
        onLogs: (logs) =>
          logs.forEach((l) =>
            push({
              kind: "state",
              at: Date.now(),
              block: l.blockNumber ?? undefined,
              tx: l.transactionHash ?? undefined,
              detail: `${STATE_NAME[Number(l.args.from)]} → ${STATE_NAME[Number(l.args.to)]}`,
            }),
          ),
      }),
    ];

    return () => unwatchers.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id?.toString(), client]);

  return entries;
}

/** Convenience for the demo page: the raw `TriggerExecuted` stream from the handler. */
export const EXECUTED_EVENT = parseAbiItem(
  "event TriggerExecuted(uint256 indexed id, uint16 probabilityBps, bool success, bytes32 returndataHash)",
);
