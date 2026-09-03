import { formatUnits } from "viem";

/** Probability in bps → "63.4%" */
export const pct = (bps: number, dp = 1) => `${(bps / 100).toFixed(dp)}%`;

/** Probability in bps → "0.634" */
export const prob = (bps: number, dp = 3) => (bps / 10_000).toFixed(dp);

export const bpsLabel = (bps: number) => `${bps.toLocaleString()} bps`;

/** raw collateral units → human, given oneCollateral (1e6 on Shannon). */
export function collateral(raw: bigint, oneCollateral: bigint, dp = 1): string {
  if (oneCollateral === 0n) return "0";
  const decimals = Math.round(Math.log10(Number(oneCollateral)));
  const n = Number(formatUnits(raw, decimals));
  return n >= 1000
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toFixed(dp);
}

export const stt = (wei: bigint, dp = 3) => {
  const n = Number(formatUnits(wei, 18));
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

export const short = (addr?: string, lead = 6, tail = 4) =>
  addr ? `${addr.slice(0, lead)}…${addr.slice(-tail)}` : "";

/** seconds → "1h 05m" / "42s" / "3m 20s" */
export function duration(sec: number): string {
  if (sec <= 0) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** unix seconds in the future → "in 4h 12m" / "in 38m" / "expired" */
export function until(unixSec: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const d = unixSec - nowSec;
  return d <= 0 ? "expired" : `in ${duration(d)}`;
}

export function ago(unixSec: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const d = nowSec - unixSec;
  return d <= 1 ? "just now" : `${duration(d)} ago`;
}

export const nsToDate = (ns: bigint) => new Date(Number(ns / 1_000_000n));
