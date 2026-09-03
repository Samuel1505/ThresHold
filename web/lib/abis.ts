/** Minimal ABIs — only what the UI calls / watches. Shapes match the deployed contracts
 *  (contracts/out artifacts) and markets-sdk@0.28.1 `binaryPoolReadAbi`. */

export const REGISTRY_ABI = [
  // ── reads ──
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "pool", type: "address" },
          { name: "pinnedNonce", type: "uint64" },
          { name: "thresholdBps", type: "uint16" },
          { name: "direction", type: "uint8" },
          { name: "dwellSec", type: "uint32" },
          { name: "maxSpreadBps", type: "uint16" },
          { name: "minDepthPerSide", type: "uint128" },
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "payload", type: "bytes" },
          { name: "actionGasCap", type: "uint32" },
          { name: "dwellStart", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
          { name: "recurring", type: "bool" },
          { name: "cooldownSec", type: "uint32" },
          { name: "lastExecutedAt", type: "uint64" },
          { name: "state", type: "uint8" },
        ],
      },
    ],
  },
  { type: "function", name: "nextTriggerId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "handler", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "admin", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "MAX_TRIGGERS_PER_POOL", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "MAX_ACTION_GAS", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "MIN_DWELL_SEC", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "MAX_DWELL_SEC", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  {
    type: "function",
    name: "triggersByOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "triggersByPool",
    stateMutability: "view",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "poolSubscriptionId",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowedAction",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "bytes4" },
    ],
    outputs: [{ type: "bool" }],
  },
  { type: "function", name: "getSubscribedPools", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  // ── writes ──
  {
    type: "function",
    name: "createTrigger",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "pool", type: "address" },
          { name: "thresholdBps", type: "uint16" },
          { name: "direction", type: "uint8" },
          { name: "dwellSec", type: "uint32" },
          { name: "maxSpreadBps", type: "uint16" },
          { name: "minDepthPerSide", type: "uint128" },
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "payload", type: "bytes" },
          { name: "actionGasCap", type: "uint32" },
          { name: "expiresAt", type: "uint64" },
          { name: "recurring", type: "bool" },
          { name: "cooldownSec", type: "uint32" },
        ],
      },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelTrigger",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  // ── events ──
  {
    type: "event",
    name: "TriggerCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "pinnedNonce", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TriggerStateChanged",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "from", type: "uint8", indexed: false },
      { name: "to", type: "uint8", indexed: false },
    ],
  },
  { type: "event", name: "TriggerCancelled", inputs: [{ name: "id", type: "uint256", indexed: true }] },
  {
    type: "event",
    name: "ExecutionRecorded",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "probabilityBps", type: "uint16", indexed: false },
      { name: "success", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SubscriptionCreated",
    inputs: [
      { name: "pool", type: "address", indexed: true },
      { name: "subId", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Funded",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const HANDLER_ABI = [
  { type: "function", name: "MAX_LEVELS", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "registry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "event",
    name: "CallbackEntered",
    inputs: [
      { name: "emitter", type: "address", indexed: true },
      { name: "topic0", type: "bytes32", indexed: false },
      { name: "triggerCount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DwellStarted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "dwellStart", type: "uint64", indexed: false },
      { name: "dwellSec", type: "uint32", indexed: false },
    ],
  },
  { type: "event", name: "DwellReset", inputs: [{ name: "id", type: "uint256", indexed: true }] },
  {
    type: "event",
    name: "GateFailed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "gate", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TriggerExpired",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "reason", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TriggerExecuted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "probabilityBps", type: "uint16", indexed: false },
      { name: "success", type: "bool", indexed: false },
      { name: "returndataHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const VAULT_ABI = [
  { type: "function", name: "riskyBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "safeBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "safeAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "handler", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "reset", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "event",
    name: "Derisked",
    inputs: [
      { name: "amount", type: "uint256", indexed: false },
      { name: "blockNumber", type: "uint256", indexed: false },
    ],
  },
] as const;

/** BinaryPool reads — verbatim from markets-sdk@0.28.1 `binaryPoolReadAbi` (no `closingTop`). */
export const BINARY_POOL_ABI = [
  {
    type: "function",
    name: "getBookLevels",
    stateMutability: "view",
    inputs: [
      { name: "isBid", type: "bool" },
      { name: "numLevels", type: "uint64" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "price", type: "uint256" },
          { name: "quantity", type: "uint256" },
        ],
      },
    ],
  },
  { type: "function", name: "marketNonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "finalized", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "booksEmpty", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "marketExpiryNs", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "getBinaryPoolParams",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "collateralToken", type: "address" },
          { name: "market", type: "address" },
          { name: "outcomeToken", type: "address" },
          { name: "yesId", type: "uint256" },
          { name: "noId", type: "uint256" },
          { name: "oneCollateral", type: "uint256" },
          { name: "setBacking", type: "uint256" },
          { name: "feeRecipient", type: "address" },
          { name: "makerFeeBpsTimes1k", type: "uint256" },
          { name: "takerFeeBpsTimes1k", type: "uint256" },
          { name: "maxBuilderFeeBpsTimes1k", type: "uint256" },
          { name: "settlementFeeBpsTimes1k", type: "uint256" },
          { name: "settlement", type: "address" },
          { name: "marketNonce", type: "uint64" },
          { name: "finalized", type: "bool" },
        ],
      },
    ],
  },
] as const;
