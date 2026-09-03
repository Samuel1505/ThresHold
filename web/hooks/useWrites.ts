"use client";

import { useCallback, useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { decodeEventLog, type Address } from "viem";
import { REGISTRY_ABI, VAULT_ABI } from "@/lib/abis";
import { REGISTRY, DEMO_VAULT } from "@/lib/addresses";
import type { Direction } from "@/lib/types";

export interface CreateParams {
  pool: Address;
  thresholdBps: number;
  direction: Direction;
  dwellSec: number;
  maxSpreadBps: number;
  minDepthPerSide: bigint;
  target: Address;
  selector: `0x${string}`;
  payload: `0x${string}`;
  actionGasCap: number;
  expiresAt: bigint;
  recurring: boolean;
  cooldownSec: number;
}

export function useArmTrigger() {
  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [newId, setNewId] = useState<bigint>();

  const receipt = useWaitForTransactionReceipt({ hash });

  const arm = useCallback(
    async (p: CreateParams) => {
      setError(undefined);
      setNewId(undefined);
      setPending(true);
      try {
        const tx = await writeContractAsync({
          address: REGISTRY,
          abi: REGISTRY_ABI,
          functionName: "createTrigger",
          args: [
            {
              pool: p.pool,
              thresholdBps: p.thresholdBps,
              direction: p.direction,
              dwellSec: p.dwellSec,
              maxSpreadBps: p.maxSpreadBps,
              minDepthPerSide: p.minDepthPerSide,
              target: p.target,
              selector: p.selector,
              payload: p.payload,
              actionGasCap: p.actionGasCap,
              expiresAt: p.expiresAt,
              recurring: p.recurring,
              cooldownSec: p.cooldownSec,
            },
          ],
        });
        setHash(tx);
        return tx;
      } catch (e) {
        setError(friendly(e));
        setPending(false);
        throw e;
      }
    },
    [writeContractAsync],
  );

  // pull the new trigger id out of the receipt once mined
  useEffect(() => {
    if (!receipt.data) return;
    setPending(false);
    for (const log of receipt.data.logs) {
      try {
        const d = decodeEventLog({ abi: REGISTRY_ABI, ...log });
        if (d.eventName === "TriggerCreated") {
          setNewId((d.args as { id: bigint }).id);
          break;
        }
      } catch {
        /* not our event */
      }
    }
  }, [receipt.data]);

  return {
    arm,
    hash,
    newId,
    error: error ?? (receipt.isError ? "transaction reverted" : undefined),
    status: !hash
      ? pending
        ? "signing"
        : "idle"
      : receipt.isLoading
        ? "mining"
        : receipt.isSuccess
          ? "done"
          : "failed",
  } as const;
}

export function useCancelTrigger() {
  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const [error, setError] = useState<string>();
  const receipt = useWaitForTransactionReceipt({ hash });

  const cancel = useCallback(
    async (id: bigint) => {
      setError(undefined);
      try {
        const tx = await writeContractAsync({
          address: REGISTRY,
          abi: REGISTRY_ABI,
          functionName: "cancelTrigger",
          args: [id],
        });
        setHash(tx);
      } catch (e) {
        setError(friendly(e));
        throw e;
      }
    },
    [writeContractAsync],
  );

  return {
    cancel,
    hash,
    error,
    status: !hash ? "idle" : receipt.isLoading ? "mining" : receipt.isSuccess ? "done" : "failed",
  } as const;
}

export function useVaultActions() {
  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const receipt = useWaitForTransactionReceipt({ hash });

  const deposit = useCallback(
    async (valueWei: bigint) => {
      const tx = await writeContractAsync({
        address: DEMO_VAULT,
        abi: VAULT_ABI,
        functionName: "deposit",
        value: valueWei,
      });
      setHash(tx);
    },
    [writeContractAsync],
  );

  const reset = useCallback(async () => {
    const tx = await writeContractAsync({
      address: DEMO_VAULT,
      abi: VAULT_ABI,
      functionName: "reset",
    });
    setHash(tx);
  }, [writeContractAsync]);

  return { deposit, reset, hash, mining: receipt.isLoading, done: receipt.isSuccess };
}

function friendly(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (/User rejected|denied/i.test(msg)) return "rejected in wallet";
  if (/ActionNotAllowed/.test(msg)) return "that (target, selector) isn't allow-listed";
  if (/MarketNotTradable/.test(msg)) return "the pool is finalized or its book is empty";
  if (/PoolTriggerLimit/.test(msg)) return "this pool already has 16 triggers";
  if (/InvalidThreshold/.test(msg)) return "threshold must be between 0 and 100%";
  if (/InvalidDwell/.test(msg)) return "dwell is out of bounds (or cooldown < dwell)";
  if (/GasCapTooHigh/.test(msg)) return "action gas cap is over the max";
  if (/ContractPaused/.test(msg)) return "the registry is paused";
  if (/insufficient funds/i.test(msg)) return "not enough STT for gas";
  const m = msg.match(/reverted with (?:the following reason|custom error)[:\s]+([A-Za-z]+)/);
  return m ? m[1]! : msg.slice(0, 140);
}
