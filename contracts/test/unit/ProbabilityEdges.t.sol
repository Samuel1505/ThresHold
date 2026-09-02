// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { LibHarness } from "../mocks/LibHarness.sol";
import { MockBinaryPool } from "../mocks/MockBinaryPool.sol";
import { ProbabilityLib } from "../../src/ProbabilityLib.sol";

/// @notice PHASE 3 hardening — the probability engine must never revert and must stay bounded on
///         degenerate or hostile book shapes.
contract ProbabilityEdgesTest is Test {
    LibHarness internal lib;
    MockBinaryPool internal pool;

    function setUp() public {
        lib = new LibHarness();
        pool = new MockBinaryPool();
    }

    /// @dev raw price for `bps` at the pool's current `oneCollateral`.
    function _raw(uint256 bps) internal view returns (uint256) {
        return (bps * pool.oneCollateral()) / 10_000;
    }

    function _arr(uint256 a) internal pure returns (uint256[] memory x) {
        x = new uint256[](1);
        x[0] = a;
    }

    function _arr(uint256 a, uint256 b) internal pure returns (uint256[] memory x) {
        x = new uint256[](2);
        x[0] = a;
        x[1] = b;
    }

    // ── snapshot never reverts on an empty pool ──────────────────────────────
    function test_emptyPoolSnapshot() public view {
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        assertTrue(s.booksEmpty);
        assertFalse(s.twoSided);
        (uint16 mid, bool bd, bool ad) = lib.depthWeightedBps(s, 0);
        assertEq(mid, 0);
        assertFalse(bd);
        assertFalse(ad);
    }

    // ── a zero-quantity level contributes nothing, no div-by-zero ────────────
    function test_zeroQuantityLevel() public {
        pool.setBids(_arr(_raw(4000), _raw(3900)), _arr(0, 100e6));
        pool.setAsks(_arr(_raw(6000)), _arr(100e6));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        (uint16 bidV, uint128 bidN) = lib.vwapUntil(s.bids, 0);
        assertEq(bidV, 3900, "the zero-qty level must not skew the average");
        // notional = 0.39 * 100e6 collateral (price fraction x qty)
        assertApproxEqAbs(bidN, 39e6, 1e5);
    }

    // ── a zero-price level: toBps(0) = 0, notional 0, harmless ───────────────
    function test_zeroPriceLevel() public {
        pool.setBids(_arr(0, _raw(4000)), _arr(1e6, 100e6));
        pool.setAsks(_arr(_raw(6000)), _arr(100e6));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        (uint16 v,) = lib.vwapUntil(s.bids, 0);
        assertEq(v, 4000);
    }

    // ── price above oneCollateral clamps to 10000, never wraps ───────────────
    function test_priceAboveOneCollateralClamps() public {
        assertEq(lib.toBps(2e6, 1e6), 10_000);
        assertEq(lib.toBps(type(uint128).max, 1e6), 10_000);
        pool.setBids(_arr(5e6), _arr(100e6)); // price 5x oneCollateral
        pool.setAsks(_arr(9e5), _arr(100e6));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        assertEq(s.bestBidBps, 10_000);
        (uint16 mid,,) = lib.depthWeightedBps(s, 0);
        assertLe(mid, 10_000);
    }

    // ── 18-decimal collateral (mainnet path) ────────────────────────────────
    function test_eighteenDecimalCollateral() public {
        pool.setOneCollateral(1e18);
        pool.setBids(_arr(4e17), _arr(1000e18)); // 0.40
        pool.setAsks(_arr(6e17), _arr(1000e18)); // 0.60
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        assertEq(s.bestBidBps, 4000);
        assertEq(s.bestAskBps, 6000);
        (uint16 mid, bool bd, bool ad) = lib.depthWeightedBps(s, 100e18);
        assertEq(mid, 5000);
        assertTrue(bd);
        assertTrue(ad);
    }

    // ── absurd quantity saturates notional to uint128 max, no overflow revert ─
    function test_absurdQuantitySaturates() public {
        pool.setBids(_arr(_raw(5000)), _arr(type(uint256).max));
        pool.setAsks(_arr(_raw(5000)), _arr(type(uint256).max));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8); // must not revert
        assertEq(s.bids[0].notional, type(uint128).max, "saturated, not wrapped");
        (uint16 mid,,) = lib.depthWeightedBps(s, 0);
        assertEq(mid, 5000);
    }

    // ── maxLevels truncation: only the first N levels are read ───────────────
    function test_maxLevelsTruncation() public {
        uint256[] memory prices = new uint256[](10);
        uint256[] memory qtys = new uint256[](10);
        for (uint256 i; i < 10; ++i) {
            prices[i] = _raw(5000 - i * 10); // best-first
            qtys[i] = 1e9;
        }
        pool.setBids(prices, qtys);
        pool.setAsks(_arr(_raw(6000)), _arr(1e9));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        assertEq(s.bids.length, 8, "capped at maxLevels");
    }

    // ── fuzz: snapshot + depthWeightedBps never revert, mid always <= 10000 ──
    function testFuzz_snapshotNeverReverts(
        uint256 bidPrice,
        uint256 bidQty,
        uint256 askPrice,
        uint256 askQty,
        uint256 one,
        uint128 minDepth
    ) public {
        one = bound(one, 1, 1e30);
        pool.setOneCollateral(one);
        pool.setBids(_arr(bound(bidPrice, 0, one)), _arr(bidQty % 1e40));
        pool.setAsks(_arr(bound(askPrice, 0, one)), _arr(askQty % 1e40));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        (uint16 mid,,) = lib.depthWeightedBps(s, minDepth);
        assertLe(mid, 10_000);
    }
}
