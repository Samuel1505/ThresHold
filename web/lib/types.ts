/** Mirrors `contracts/src/Types.sol`. */

export enum Direction {
  ABOVE = 0,
  BELOW = 1,
}

export enum TriggerState {
  NONE = 0,
  ARMED = 1,
  OBSERVING = 2,
  EXECUTED = 3,
  EXPIRED = 4,
  CANCELLED = 5,
  FAILED = 6,
}

export const STATE_NAME: Record<TriggerState, string> = {
  [TriggerState.NONE]: "None",
  [TriggerState.ARMED]: "Armed",
  [TriggerState.OBSERVING]: "Observing",
  [TriggerState.EXECUTED]: "Executed",
  [TriggerState.EXPIRED]: "Expired",
  [TriggerState.CANCELLED]: "Cancelled",
  [TriggerState.FAILED]: "Failed",
};

export const isTerminal = (s: TriggerState) =>
  s === TriggerState.EXECUTED ||
  s === TriggerState.EXPIRED ||
  s === TriggerState.CANCELLED ||
  s === TriggerState.FAILED;

export const isActive = (s: TriggerState) =>
  s === TriggerState.ARMED || s === TriggerState.OBSERVING;

export interface Trigger {
  id: bigint;
  owner: `0x${string}`;
  pool: `0x${string}`;
  pinnedNonce: bigint;
  thresholdBps: number;
  direction: Direction;
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
  state: TriggerState;
}

/** A binary market row, from the SDK indexer (display metadata only). */
export interface MarketRow {
  marketId: `0x${string}`;
  pool: `0x${string}`;
  nonce: bigint;
  asset: string;
  strike: string;
  interval: string; // "15m" | "1h" | "4h" | "24h" | …
  venueId: string;
  expiry: number; // unix seconds
  status: number; // on-chain MarketStatus (1 = Trading)
}

export interface RawLevel {
  price: bigint;
  quantity: bigint;
}

export interface Level {
  priceRaw: bigint;
  qtyRaw: bigint;
  priceBps: number;
  notional: bigint; // raw collateral units
}

export interface PoolSnapshot {
  oneCollateral: bigint;
  marketNonce: bigint;
  finalized: boolean;
  expired: boolean;
  booksEmpty: boolean;
  twoSided: boolean;
  bestBidBps: number;
  bestAskBps: number;
  spreadBps: number;
  bids: Level[];
  asks: Level[];
  expiryNs: bigint;
  /** timestamp the `expired` flag was computed against (unix seconds). */
  nowSec: number;
}

export interface TriggerConfig {
  thresholdBps: number;
  direction: Direction;
  maxSpreadBps: number;
  minDepthPerSide: bigint;
  dwellSec: number;
  pinnedNonce?: bigint;
  expiresAt?: bigint;
  state?: TriggerState;
}

export interface GateResult {
  id: string; // "G1" … "G8" | "P"
  label: string;
  ok: boolean;
  detail: string;
}
