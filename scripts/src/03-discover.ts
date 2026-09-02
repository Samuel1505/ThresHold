/**
 * PHASE 0.3 — find a live DreamDEX binary market on Shannon (docs/16).
 *
 * Lists Trading binary markets from the indexer, then for each resolves the
 * authoritative on-chain snapshot (pool, nonce, status, expiry) via
 * getMarketOnchain — pool addresses are NEVER trusted from the indexer row
 * (recycle caveat). Prints a table and the env lines to target one.
 *
 *   pnpm phase0:discover
 *
 * Gate: at least one row with status Trading and >= 15 min to expiry. If none,
 * ask in the hackathon Telegram which venue is active (docs/16 §0.3).
 */
import { sdkExchange, VENUE_ID, DREAMDEX } from "./env.js";

async function main() {
  const exchange = sdkExchange();
  const client = exchange.client;
  const nowSec = Math.floor(Date.now() / 1000);

  const rows = await client.listBinaryMarkets({
    ...(VENUE_ID ? { venueId: VENUE_ID } : {}),
    status: "Trading",
    limit: 50,
  });

  console.log(`indexer: ${rows.length} binary market(s) with status=Trading` + (VENUE_ID ? ` on venue ${VENUE_ID}` : " (all venues)"));
  if (rows.length === 0) {
    console.log("\nNo live markets. Query without VENUE_ID, or ask in the hackathon Telegram which venue is active.");
    const venues = await client.listBinaryVenueIds().catch(() => []);
    if (venues.length) console.log("known venue ids:", venues);
    process.exit(1);
  }

  const seenVenues = new Set<string>();
  const candidates: { marketId: string; pool: string; nonce: string; asset: string; strike: string; interval: string; venueId: string; minsLeft: number }[] = [];

  for (const r of rows) {
    seenVenues.add(String(r.venueId ?? "?"));
    let onchain;
    try {
      onchain = await client.getMarketOnchain(r.marketId);
    } catch (e) {
      console.log(`  ${r.marketId} — getMarketOnchain failed: ${(e as Error).message}`);
      continue;
    }
    const expirySec = Number(onchain.expiry);
    const minsLeft = Math.round((expirySec - nowSec) / 60);
    const tradable = onchain.status === 1 && !onchain.finalized && expirySec > nowSec;
    if (tradable) candidates.push({
      marketId: r.marketId,
      pool: onchain.pool,
      nonce: onchain.nonce.toString(),
      asset: r.asset ?? "?",
      strike: String(r.strike ?? "?"),
      interval: r.interval ?? String(r.intervalSec ?? "?"),
      venueId: String(r.venueId ?? "?"),
      minsLeft,
    });
    console.log(
      `  ${tradable ? "OK " : "-- "} ${r.asset ?? "?"} ${r.interval ?? r.intervalSec ?? "?"} strike=${r.strike ?? "?"} ` +
        `nonce=${onchain.nonce} expiry=${minsLeft}m pool=${onchain.pool} marketId=${r.marketId}`,
    );
  }

  if (seenVenues.size > 1) {
    console.log(`\n⚠ live markets span ${seenVenues.size} venues: ${[...seenVenues].join(", ")} — set VENUE_ID to scope.`);
  }

  const minMins = Number(process.env.MIN_MINS_LEFT ?? 10);
  const sorted = candidates.sort((a, b) => b.minsLeft - a.minsLeft);
  const best = sorted.find((c) => c.minsLeft >= minMins) ?? sorted[0];

  if (!best) {
    console.log("\nNo tradable market resolved on-chain. Re-run, or ask in the hackathon Telegram which venue is active.");
    process.exit(1);
  }
  if (best.minsLeft < minMins) {
    console.log(`\n⚠ freshest market has only ${best.minsLeft} min to expiry (< MIN_MINS_LEFT=${minMins}). Re-run near a new window, or set a longer series.`);
  }

  console.log("\n--- add these to .env to target the freshest market ---");
  console.log(`TARGET_MARKET_ID=${best.marketId}`);
  console.log(`TARGET_POOL=${best.pool}`);
  console.log(`VENUE_ID=${best.venueId}`);
  console.log(`# ${best.asset} ${best.interval} strike ${best.strike}, nonce ${best.nonce}, ~${best.minsLeft} min to expiry`);
  console.log(`# module=${DREAMDEX.binaryModule} settlement=${DREAMDEX.binarySettlement}`);

  await exchange.close().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
