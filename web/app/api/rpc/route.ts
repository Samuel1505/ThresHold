import { NextResponse } from "next/server";
import { RPC_URL } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin JSON-RPC proxy for the browser. The public Shannon RPC rate-limits
 * per client and drops CORS headers on the throttled response, which the browser
 * surfaces as a CORS failure — so every read in the UI would intermittently die.
 * Routing eth_call / eth_getLogs / etc. through here keeps one warm server-side
 * connection and removes CORS from the picture entirely. Wallet writes still go
 * through the injected provider, not this path.
 */
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const upstream = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: String((e as Error).message) } },
      { status: 502 },
    );
  }
}
