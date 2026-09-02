// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { ProbabilityLib } from "../../src/ProbabilityLib.sol";
import { IBinaryPool } from "../../src/interfaces/IBinaryPool.sol";
import { Direction } from "../../src/Types.sol";
import { MockBinaryPool } from "../mocks/MockBinaryPool.sol";

/// @dev Thin external wrapper so the `internal` library can be exercised directly.
contract Harness {
    function toBps(uint256 p, uint256 one) external pure returns (uint16) {
        return ProbabilityLib.toBps(p, one);
    }

    function snapshot(IBinaryPool pool) external view returns (ProbabilityLib.PoolSnapshot memory) {
        return ProbabilityLib.snapshot(pool, 8);
    }

    function vwapUntil(ProbabilityLib.Level[] calldata levels, uint128 target)
        external
        pure
        returns (uint16 vwapBps, uint128 consumed)
    {
        return ProbabilityLib.vwapUntil(levels, target);
    }

    function depthWeightedBps(ProbabilityLib.PoolSnapshot calldata s, uint128 minDepth)
        external
        pure
        returns (uint16 mid, bool bidDeep, bool askDeep)
    {
        return ProbabilityLib.depthWeightedBps(s, minDepth);
    }
}

contract ProbabilityLibTest is Test {
    Harness h;
    MockBinaryPool pool;

    function setUp() public {
        h = new Harness();
        pool = new MockBinaryPool();
    }

    function _lvl(uint16 bps, uint128 notional)
        internal
        pure
        returns (ProbabilityLib.Level memory)
    {
        return ProbabilityLib.Level({ priceBps: bps, notional: notional });
    }

    function _one(uint16 bps) internal pure returns (ProbabilityLib.Level[] memory a) {
        a = new ProbabilityLib.Level[](1);
        a[0] = _lvl(bps, 100e6);
    }

    // ── U1 — toBps at 6dp and 18dp ────────────────────────────────────────────
    function test_U1_toBps() public view {
        assertEq(h.toBps(500_000, 1e6), 5000);
        assertEq(h.toBps(5e17, 1e18), 5000);
        assertEq(h.toBps(0, 1e6), 0);
        assertEq(h.toBps(1e6, 1e6), 10_000);
        assertEq(h.toBps(2e6, 1e6), 10_000); // clamp, never wrap
        assertEq(h.toBps(1, 0), 0); // div-by-zero guard
    }

    // ── U2 — VWAP, single level == that level's bps ───────────────────────────
    function test_U2_vwapSingleLevel() public view {
        (uint16 v, uint128 c) = h.vwapUntil(_one(6200), 0);
        assertEq(v, 6200);
        assertEq(c, 100e6);
    }

    // ── U3 — VWAP notional-weighted, not arithmetic mean ──────────────────────
    function test_U3_vwapNotionalWeighted() public view {
        ProbabilityLib.Level[] memory a = new ProbabilityLib.Level[](2);
        a[0] = _lvl(3000, 900e6); // dominant
        a[1] = _lvl(1000, 100e6);
        (uint16 v,) = h.vwapUntil(a, 0);
        // arithmetic mean would be 2000; notional-weighted = (3000*900 + 1000*100)/1000 = 2800
        assertEq(v, 2800);
    }

    // ── U4 — VWAP stops at minDepthPerSide; deeper levels excluded ────────────
    function test_U4_vwapStopsAtTarget() public view {
        ProbabilityLib.Level[] memory a = new ProbabilityLib.Level[](2);
        a[0] = _lvl(5000, 100e6);
        a[1] = _lvl(1000, 100e6);
        (uint16 v, uint128 c) = h.vwapUntil(a, 50e6); // target met by level 0 alone
        assertEq(v, 5000, "deeper level must not be consumed");
        assertEq(c, 100e6);
    }

    // ── U5 — insufficient depth reported ─────────────────────────────────────
    function test_U5_insufficientDepth() public view {
        ProbabilityLib.Level[] memory a = new ProbabilityLib.Level[](1);
        a[0] = _lvl(5000, 30e6);
        (, uint128 c) = h.vwapUntil(a, 100e6);
        assertLt(c, 100e6);
    }

    // ── U6 — empty book side: (0,0), no revert, no div-by-zero ────────────────
    function test_U6_emptySide() public view {
        ProbabilityLib.Level[] memory a = new ProbabilityLib.Level[](0);
        (uint16 v, uint128 c) = h.vwapUntil(a, 100e6);
        assertEq(v, 0);
        assertEq(c, 0);
    }

    // ── U7 — spread computation = askBps - bidBps ─────────────────────────────
    function test_U7_spread() public {
        _seed(pool, 3900, 4100, 200e6);
        ProbabilityLib.PoolSnapshot memory s = h.snapshot(pool);
        assertEq(s.bestBidBps, 3900);
        assertEq(s.bestAskBps, 4100);
        assertEq(s.spreadBps, 200);
    }

    // ── U8 — fuzz: output always in [0,10000], never reverts ──────────────────
    function testFuzz_U8_boundedNeverReverts(
        uint16 b0,
        uint16 b1,
        uint16 a0,
        uint16 a1,
        uint96 n,
        uint128 target
    ) public view {
        b0 = uint16(bound(b0, 0, 10_000));
        b1 = uint16(bound(b1, 0, 10_000));
        a0 = uint16(bound(a0, 0, 10_000));
        a1 = uint16(bound(a1, 0, 10_000));
        ProbabilityLib.Level[] memory bids = new ProbabilityLib.Level[](2);
        ProbabilityLib.Level[] memory asks = new ProbabilityLib.Level[](2);
        bids[0] = _lvl(b0, n);
        bids[1] = _lvl(b1, n);
        asks[0] = _lvl(a0, n);
        asks[1] = _lvl(a1, n);
        ProbabilityLib.PoolSnapshot memory s;
        s.twoSided = true;
        s.bids = bids;
        s.asks = asks;
        (uint16 mid,,) = h.depthWeightedBps(s, target);
        assertLe(mid, 10_000);
    }

    // ── U9 (fuzz) — clearing a thin top level barely moves the depth-weighted mid ─
    function testFuzz_U9_thinLevelCrossed(uint16 pThin, uint16 pDeep, uint96 thinN) public view {
        pThin = uint16(bound(pThin, 100, 9900));
        pDeep = uint16(bound(pDeep, 100, 9900));
        uint128 thin = uint128(bound(thinN, 1, 5e6)); // "thin" = at most 5 collateral
        uint128 deep = 500e6;
        uint128 target = 100e6;

        ProbabilityLib.Level[] memory before = new ProbabilityLib.Level[](3);
        before[0] = _lvl(pThin, thin);
        before[1] = _lvl(pDeep, deep);
        before[2] = _lvl(pDeep, deep);
        (uint16 vBefore,) = h.vwapUntil(before, target);

        ProbabilityLib.Level[] memory afterLevels = new ProbabilityLib.Level[](2);
        afterLevels[0] = _lvl(pDeep, deep);
        afterLevels[1] = _lvl(pDeep, deep);
        (uint16 vAfter,) = h.vwapUntil(afterLevels, target);

        uint256 delta = vAfter > vBefore ? vAfter - vBefore : vBefore - vAfter;
        // thin/target <= 5e6/100e6 = 5%, and |pThin - pDeep| <= 9800, so worst move < ~490 bps;
        // for a genuinely thin level (<=1%) it is well under 100.
        assertLt(delta, 500);
        if (thin <= target / 100) assertLt(delta, 100);
    }

    // ── U9 — one thin level crossed: depth-weighted mid moves < 100 bps ───────
    function test_U9_thinLevelCrossedBarelyMoves() public view {
        // before: a thin top level then a deep one
        ProbabilityLib.Level[] memory before = new ProbabilityLib.Level[](3);
        before[0] = _lvl(7000, 3e6); // thin — a wash trade can clear this
        before[1] = _lvl(7400, 500e6);
        before[2] = _lvl(7450, 500e6);
        (uint16 vBefore,) = h.vwapUntil(before, 100e6);

        // after: the thin level is gone
        ProbabilityLib.Level[] memory afterLevels = new ProbabilityLib.Level[](2);
        afterLevels[0] = _lvl(7400, 500e6);
        afterLevels[1] = _lvl(7450, 500e6);
        (uint16 vAfter,) = h.vwapUntil(afterLevels, 100e6);

        uint256 delta = vAfter > vBefore ? vAfter - vBefore : vBefore - vAfter;
        assertLt(delta, 100, "depth-weighted mid must be insensitive to one thin fill");
    }

    // ── snapshot flags ───────────────────────────────────────────────────────
    function test_snapshot_oneSidedNotTwoSided() public {
        uint256[] memory p = new uint256[](1);
        uint256[] memory q = new uint256[](1);
        p[0] = 4000;
        q[0] = 1e6;
        pool.setBids(p, q);
        ProbabilityLib.PoolSnapshot memory s = h.snapshot(pool);
        assertFalse(s.twoSided);
        assertFalse(s.booksEmpty);
    }

    function test_snapshot_expiredWhenPastExpiryNs() public {
        _seed(pool, 3900, 4100, 100e6);
        pool.setMarketExpiryNs(uint64(block.timestamp * 1e9)); // exactly now
        ProbabilityLib.PoolSnapshot memory s = h.snapshot(pool);
        assertTrue(s.expired);
    }

    function _seed(MockBinaryPool p, uint256 bidBps, uint256 askBps, uint256 notionalPerSide)
        internal
    {
        uint256 one = p.oneCollateral();
        uint256[] memory bp = new uint256[](1);
        uint256[] memory bq = new uint256[](1);
        uint256[] memory ap = new uint256[](1);
        uint256[] memory aq = new uint256[](1);
        bp[0] = (bidBps * one) / 10_000;
        ap[0] = (askBps * one) / 10_000;
        bq[0] = (notionalPerSide * one) / bp[0];
        aq[0] = (notionalPerSide * one) / ap[0];
        p.setBids(bp, bq);
        p.setAsks(ap, aq);
    }
}
