// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IBinaryPool } from "./interfaces/IBinaryPool.sol";
import { Direction } from "./Types.sol";

/// @title ProbabilityLib — the depth-weighted probability engine (docs/07)
/// @notice Pure/view. `snapshot()` does every external pool read ONCE so the handler can share it
///         across all triggers on a pool; the per-side book levels are carried in the snapshot so
///         `depthWeightedBps()` can walk them until each trigger's own `minDepthPerSide`. Keeping
///         the decision a pure function of the snapshot is what makes the fuzz tests (docs/12
///         U8/U9) and the TS parity port (docs/12 P1/P2) possible.
///
/// @dev All fixed-point is basis points of `oneCollateral` (read from the pool — 1e6 on Shannon,
///      1e18 on mainnet). `uint16` in [0, 10000]. No floats, no rounding ambiguity.
library ProbabilityLib {
    /// @notice 100% == 10_000.
    uint256 internal constant BPS = 10_000;

    /// @notice One book level, pre-converted: price in bps, notional in raw collateral units.
    struct Level {
        uint16 priceBps;
        uint128 notional;
    }

    /// @notice Shared, immutable-per-callback view of a pool.
    struct PoolSnapshot {
        uint64 marketNonce;
        bool finalized;
        bool expired;
        bool booksEmpty;
        bool twoSided;
        uint256 oneCollateral;
        uint16 bestBidBps;
        uint16 bestAskBps;
        uint16 spreadBps;
        Level[] bids; // best-first, capped at maxLevels
        Level[] asks; // best-first, capped at maxLevels
    }

    /// @notice Convert a raw price to basis points of `oneCollateral`, clamped to [0, 10000].
    ///         A price above `oneCollateral` is a nonsensical probability > 1 → clamp, don't wrap.
    function toBps(uint256 priceRaw, uint256 oneCollateral) internal pure returns (uint16) {
        if (oneCollateral == 0) return 0;
        uint256 v = (priceRaw * BPS) / oneCollateral;
        // both branches are <= BPS (10_000), which fits uint16
        // forge-lint: disable-next-line(unsafe-typecast)
        return v >= BPS ? uint16(BPS) : uint16(v);
    }

    /// @notice Read every field the gates need, in one pass. Never reverts on a hostile pool:
    ///         an absurd level quantity saturates rather than overflowing.
    /// @param pool      the BinaryPool (its address is the subscription emitter)
    /// @param maxLevels per-side level cap — 8 for the MVP (docs/07 §7, gas)
    function snapshot(IBinaryPool pool, uint64 maxLevels)
        internal
        view
        returns (PoolSnapshot memory s)
    {
        IBinaryPool.BinaryPoolParams memory p = pool.getBinaryPoolParams();
        uint256 one = p.oneCollateral;

        IBinaryPool.Level[] memory rawBids = pool.getBookLevels(true, maxLevels);
        IBinaryPool.Level[] memory rawAsks = pool.getBookLevels(false, maxLevels);
        uint64 expiryNs = pool.marketExpiryNs();

        s.marketNonce = p.marketNonce;
        s.finalized = p.finalized;
        s.expired = expiryNs != 0 && block.timestamp * 1e9 >= expiryNs;
        s.oneCollateral = one;
        s.booksEmpty = rawBids.length == 0 && rawAsks.length == 0;
        s.twoSided = rawBids.length != 0 && rawAsks.length != 0;

        s.bids = _convert(rawBids, one, maxLevels);
        s.asks = _convert(rawAsks, one, maxLevels);

        if (!s.twoSided) return s;

        s.bestBidBps = s.bids[0].priceBps;
        s.bestAskBps = s.asks[0].priceBps;
        s.spreadBps = s.bestAskBps > s.bestBidBps ? s.bestAskBps - s.bestBidBps : 0;
    }

    /// @notice The signal Threshold acts on: the mean of the two sides' notional-weighted mid
    ///         prices, each computed over the levels consumed reaching `minDepthPerSide`.
    /// @return midBps   depth-weighted mid, bps (0 if either side is empty)
    /// @return bidDeep  the bid side held >= `minDepthPerSide` notional (and some liquidity)
    /// @return askDeep  the ask side held >= `minDepthPerSide` notional (and some liquidity)
    function depthWeightedBps(PoolSnapshot memory s, uint128 minDepthPerSide)
        internal
        pure
        returns (uint16 midBps, bool bidDeep, bool askDeep)
    {
        (uint16 bidVwap, uint128 bidNotional) = vwapUntil(s.bids, minDepthPerSide);
        (uint16 askVwap, uint128 askNotional) = vwapUntil(s.asks, minDepthPerSide);
        bidDeep = bidNotional != 0 && bidNotional >= minDepthPerSide;
        askDeep = askNotional != 0 && askNotional >= minDepthPerSide;
        // forge-lint: disable-next-line(unsafe-typecast)
        midBps = uint16((uint256(bidVwap) + uint256(askVwap)) / 2);
    }

    /// @notice `true` when `p` satisfies the trigger's threshold in its direction.
    function qualifies(uint16 p, uint16 thresholdBps, Direction direction)
        internal
        pure
        returns (bool)
    {
        return direction == Direction.ABOVE ? p >= thresholdBps : p <= thresholdBps;
    }

    /// @notice Notional-weighted average price (bps) over the levels consumed until `target`
    ///         notional is reached; if `target == 0`, over every level. Returns the average and
    ///         the notional actually consumed. Saturating, never reverts.
    function vwapUntil(Level[] memory levels, uint128 target)
        internal
        pure
        returns (uint16 vwapBps, uint128 consumed)
    {
        uint256 acc; // sum(priceBps_i * notional_i)
        uint256 notional; // sum(notional_i)
        for (uint256 i; i < levels.length; ++i) {
            acc += uint256(levels[i].priceBps) * levels[i].notional;
            notional += levels[i].notional;
            if (target != 0 && notional >= target) break;
        }
        if (notional == 0) return (0, 0);
        uint256 avg = acc / notional;
        // avg <= max priceBps <= BPS; notional saturated below — both casts lossless
        // forge-lint: disable-next-line(unsafe-typecast)
        vwapBps = avg >= BPS ? uint16(BPS) : uint16(avg);
        // forge-lint: disable-next-line(unsafe-typecast)
        consumed = notional > type(uint128).max ? type(uint128).max : uint128(notional);
    }

    /// @dev Pre-convert a raw book side to `Level`s: notional_i = price_i * qty_i / one.
    function _convert(IBinaryPool.Level[] memory raw, uint256 one, uint64 maxLevels)
        private
        pure
        returns (Level[] memory out)
    {
        uint256 n = raw.length < maxLevels ? raw.length : maxLevels;
        out = new Level[](n);
        if (one == 0) return out;
        for (uint256 i; i < n; ++i) {
            uint256 price = raw[i].price;
            uint256 qty = raw[i].quantity;
            uint128 nCapped;
            if (price != 0 && qty != 0) {
                // Guard the product: a hostile pool returning a huge quantity must not revert the
                // whole callback (snapshot is on the callback path).
                uint256 notional =
                    qty > type(uint256).max / price ? type(uint128).max : (price * qty) / one;
                // forge-lint: disable-next-line(unsafe-typecast)
                nCapped = notional > type(uint128).max ? type(uint128).max : uint128(notional);
            }
            out[i] = Level({ priceBps: toBps(price, one), notional: nCapped });
        }
    }
}
