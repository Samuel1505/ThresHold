# 15 — Hackathon Submission

## Project title
**Threshold — probabilistic automation for DreamDEX Event Contracts**

## One-line description
Threshold lets a smart contract execute an action when the market's capital-backed belief that
something will happen crosses a threshold and holds — instead of after the event has already occurred.

## Problem
Every on-chain automation primitive fires on a fact that has already happened. Keepers poll, then
submit; liquidations fire after the breach. Acting on *expectation* means trusting an off-chain model
that no contract can verify and whose operator loses nothing by being wrong.

## Solution
A DreamDEX binary Event Contract's mid price is a probability — bounded in [0,1], continuously
refreshed, and maintained by participants with capital at risk. Threshold treats it as a **sensor**.
A Somnia Reactivity subscription on the BinaryPool's `OrderFilled` invokes a handler that re-derives
a depth-weighted probability from the live order book on-chain, applies validity gates and a dwell
requirement, and dispatches an arbitrary allow-listed contract call — with no keeper anywhere.

## Innovation
Not another prediction-market application. Threshold changes *position in the stack*: it is
middleware between markets and everything downstream, and its users are contracts, not traders.

The mechanism is:
1. **Probability as a control input** — the market price is read by Solidity, not by a human.
2. **Depth-weighted, not last-price** — a single wash trade moves the touch; it does not move a
   notional-weighted mid across eight levels.
3. **Dwell + gates** — the signal must persist against arbitrage, on a two-sided book with minimum
   depth and bounded spread.
4. **Nonce pinning** — BinaryPools are recycled across markets, so triggers pin `marketNonce` at arm
   time and expire rather than firing on a different market's book.

## Technical architecture
```
BinaryPool --OrderFilled--> Reactivity precompile (0x0100) --onEvent--> ThresholdHandler
                                                                              |
                                    getBookLevels / closingTop / marketNonce  |
                                                                              v
                                                              gates G1-G8, depth-weighted mid
                                                                              |
                                                                              v
                                                                    target.call{gas: cap}
```
On-chain: `ThresholdRegistry`, `ThresholdHandler` (a `SomniaEventHandler`), `ProbabilityLib`,
`DemoVault`. Off-chain: a Next.js frontend that computes the identical probability from the identical
reads, so the preview never lies. **No backend, no indexer, no keeper.**

## Why DreamDEX
Threshold needs a bounded, capital-backed, continuously refreshed probability with real depth behind
it. DreamDEX's binary CLOB is the only venue on Somnia that produces one, and its pools expose
`getBookLevels`, `closingTop`, and `getBinaryPoolParams` as on-chain views — so the signal can be
derived inside a callback rather than trusted from an indexer. The 60-second window floor means the
signal refreshes continuously instead of drifting for months.

## Why Somnia
Load-bearing, not a deployment target. Without the Reactivity precompile at `0x0100`, Threshold
degrades into a keeper bot — which is precisely the thing it exists to replace. The subscription
model, with validators invoking the handler on a matching event, is what removes the liveness
assumption from the product entirely.

## AI-agent role
Agents are the **signal producers**, not the product. The population of trading bots dreamDEX already
ships — `ec-maker`, `ec-passive`, `ec-laddering-bot` — are the sensor array; the better they quote,
the more reliable every trigger becomes. Threshold makes those markets valuable to people who never
intended to trade, which is a demand-side pull on exactly the strategies the kit already provides.

## Ecosystem impact
The volume loop runs in the right direction. A trigger creates demand for *accurate pricing* on one
specific market. Trigger owners are motivated to see that market priced correctly, and some will quote
it to defend their own signal. **Consumers of the probability become producers of it.** Threshold
brings a class of user — protocol operators and treasury managers — to Event Contracts who had no
prior reason to open a prediction market.

## Roadmap
1. Trigger registry — published, named signals other contracts subscribe to, so one market read
   serves many consumers.
2. Bidirectional — a contract acting on a probability also hedges the action in the same block, so
   the hedge pays for the action if the market was wrong.
3. Forecast bounties — a contract with a dependency posts a standing subsidy to makers who keep a
   two-sided book on the question it needs priced. The market forms *because* a contract needed it.

## Demo
Three minutes: arm a trigger at 70% with a 30-second dwell; a trader crosses the market; the
probability climbs and holds; a treasury vault de-risks with no transaction ever sent to it. Then the
manipulation guard — a single fill against a thinned book spikes the last price and the trigger
correctly ignores it.

## Risks and limitations — stated honestly
- **Testnet only.** Not audited. Do not deploy as-is.
- **Manipulation is reduced, not eliminated.** On a genuinely illiquid market, an attacker with
  enough capital can hold a manipulated price through the dwell. `minDepthPerSide` must be set
  relative to the value of the action.
- **Subscription funding** is a shared resource; a production version needs per-user funding or rate
  limits.
- **Arbitrary-target execution is admin-allow-listed** in the MVP, not user-open. Opening it safely
  needs more than six days.
- Anything marked `NEEDS VERIFICATION` in `docs/02` that PHASE 0 did not resolve is disclosed there.
