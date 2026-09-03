import { NextResponse } from "next/server";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, ORDER_TYPE } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { createPublicClient, http, type Address } from "viem";
import { INDEXER_URL, WS_RPC_URL, RPC_URL } from "@/lib/env";
import { BINARY_POOL_ABI } from "@/lib/abis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEMO AFFORDANCE — places one small crossing order on a market so an armed trigger
 * wakes up now instead of waiting for organic trading. In real use the market does
 * this on its own; this button just stands in for "a trader takes the other side"
 * during a demo. Server-side with a throwaway testnet key (DEMO_TRADER_PRIVATE_KEY,
 * never NEXT_PUBLIC_). Size is hard-capped.
 */
const MAX_SIZE = 20; // outcome tokens
const ONE = 1_000_000n; // 6dp Shannon

const KEY = process.env.DEMO_TRADER_PRIVATE_KEY as `0x${string}` | undefined;

const rpc = createPublicClient({ chain: somniaShannon, transport: http(RPC_URL) });

let sdk: SomniaMarkets | null = null;
function exchange() {
  if (!sdk) {
    sdk = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
      ...(KEY ? { privateKey: KEY } : {}),
    });
  }
  return sdk;
}

export async function POST(req: Request) {
  if (!KEY) {
    return NextResponse.json(
      { ok: false, error: "DEMO_TRADER_PRIVATE_KEY not set on the server" },
      { status: 501 },
    );
  }

  let body: { marketId?: string; pool?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const size = Math.max(1, Math.min(MAX_SIZE, Math.round(body.size ?? 8)));
  if (!body.pool && !body.marketId) {
    return NextResponse.json({ ok: false, error: "pool or marketId required" }, { status: 400 });
  }

  try {
    const client = exchange().client;
    let pool = body.pool as Address | undefined;
    if (!pool) {
      const oc = await client.getMarketOnchain(body.marketId as `0x${string}`);
      pool = oc.pool as Address;
    }

    const [params, bids, asks] = await rpc.multicall({
      allowFailure: false,
      contracts: [
        { address: pool, abi: BINARY_POOL_ABI, functionName: "getBinaryPoolParams" },
        { address: pool, abi: BINARY_POOL_ABI, functionName: "getBookLevels", args: [true, 8n] },
        { address: pool, abi: BINARY_POOL_ABI, functionName: "getBookLevels", args: [false, 8n] },
      ],
    });
    if ((params as { finalized: boolean }).finalized) {
      return NextResponse.json({ ok: false, error: "market is finalized" }, { status: 409 });
    }
    const bestAsk = (asks as readonly { price: bigint }[])[0]?.price;
    const bestBid = (bids as readonly { price: bigint }[])[0]?.price;
    if (bestAsk === undefined && bestBid === undefined) {
      return NextResponse.json({ ok: false, error: "book is empty — nothing to cross" }, { status: 409 });
    }

    // buy YES into the ask, else sell YES into the bid; price through the touch
    const buy = bestAsk !== undefined;
    const ref = (buy ? bestAsk : bestBid)!;
    const priced = buy ? ref + (5n * ONE) / 1000n : ref - (5n * ONE) / 1000n;
    const price = priced <= 0n ? ONE / 1000n : priced >= ONE ? ONE - ONE / 1000n : priced;

    const trader = client.createTrader({ privateKey: KEY, decimals: 6 });
    const res = await trader.placeOrder({
      pool,
      side: (buy ? "BUY_YES" : "SELL_YES") as never,
      price,
      quantity: BigInt(size) * ONE,
      orderType: ORDER_TYPE.MARKET, // IOC
      expireTimestampNs: BigInt(Math.floor(Date.now() / 1000) + 300) * 1_000_000_000n,
    });
    if (res.receipt?.status === "reverted") {
      return NextResponse.json({ ok: false, error: `order reverted (${res.hash})` }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      hash: res.hash,
      block: res.receipt.blockNumber.toString(),
      side: buy ? "BUY_YES" : "SELL_YES",
      size,
      fills: res.fills.length,
      crossed: res.fills.length > 0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 502 });
  }
}
