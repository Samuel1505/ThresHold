// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { ProbabilityLib } from "../../src/ProbabilityLib.sol";
import { IBinaryPool } from "../../src/interfaces/IBinaryPool.sol";
import { MockBinaryPool } from "../mocks/MockBinaryPool.sol";
import { LibHarness } from "../mocks/LibHarness.sol";

/// @notice docs/12 P1/P2 — the Solidity side of the TS-port parity contract. The same fixture
///         inputs + expected outputs are asserted in `web/lib/probability.test.ts`. If either
///         library changes, one side breaks.
contract ParityTest is Test {
    LibHarness lib;
    MockBinaryPool pool;
    uint256 constant ONE = 1e6;

    function setUp() public {
        lib = new LibHarness();
        pool = new MockBinaryPool();
    }

    function _raw(uint256 bps) internal pure returns (uint256) {
        return (bps * ONE) / 10_000;
    }

    function _seed(
        uint16[] memory bidBps,
        uint128[] memory bidNot,
        uint16[] memory askBps,
        uint128[] memory askNot
    ) internal {
        uint256[] memory bp = new uint256[](bidBps.length);
        uint256[] memory bq = new uint256[](bidBps.length);
        uint256[] memory ap = new uint256[](askBps.length);
        uint256[] memory aq = new uint256[](askBps.length);
        for (uint256 i; i < bidBps.length; ++i) {
            bp[i] = _raw(bidBps[i]);
            bq[i] = bp[i] == 0 ? 0 : (uint256(bidNot[i]) * ONE) / bp[i];
        }
        for (uint256 i; i < askBps.length; ++i) {
            ap[i] = _raw(askBps[i]);
            aq[i] = ap[i] == 0 ? 0 : (uint256(askNot[i]) * ONE) / ap[i];
        }
        pool.setBids(bp, bq);
        pool.setAsks(ap, aq);
    }

    // ── P: fixture A — symmetric deep book ──────────────────────────────────
    function test_parity_A_symmetric() public {
        uint16[] memory b = _u16(4900, 4800);
        uint128[] memory bn = _u128(200e6, 200e6);
        uint16[] memory a = _u16(5100, 5200);
        uint128[] memory an = _u128(200e6, 200e6);
        _seed(b, bn, a, an);
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);

        assertEq(s.bestBidBps, 4900);
        assertEq(s.bestAskBps, 5100);
        assertEq(s.spreadBps, 200);

        (uint16 mid, bool bd, bool ad) = lib.depthWeightedBps(s, 100e6);
        assertEq(mid, 5000, "A: mid");
        assertTrue(bd && ad, "A: deep");
    }

    // ── fixture B — thin top, deep behind a gap (the manipulation case) ─────
    function test_parity_B_thinTopGap() public {
        _seed(_u16(4990), _u128(500e6), _u16(5010, 5400), _u128(5e6, 500e6));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        (uint16 mid, bool bd, bool ad) = lib.depthWeightedBps(s, 100e6);
        // ask VWAP is dominated by the 5400 level -> mid pulled well above 5000
        assertEq(mid, 5193, "B: mid");
        assertTrue(bd && ad, "B: deep");
    }

    // ── fixture C — one-sided ──────────────────────────────────────────────
    function test_parity_C_oneSided() public {
        uint256[] memory p = new uint256[](1);
        uint256[] memory q = new uint256[](1);
        p[0] = _raw(4000);
        q[0] = 1e6;
        pool.setBids(p, q);
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        assertFalse(s.twoSided);
        (uint16 mid,,) = lib.depthWeightedBps(s, 0);
        assertEq(mid, 2000); // (bidVwap 4000 + askVwap 0) / 2
    }

    // ── fixture D — thin (below min depth) ─────────────────────────────────
    function test_parity_D_thin() public {
        _seed(_u16(6000), _u128(3e6), _u16(6200), _u128(3e6));
        ProbabilityLib.PoolSnapshot memory s = lib.snapshot(pool, 8);
        (, bool bd, bool ad) = lib.depthWeightedBps(s, 100e6);
        assertFalse(bd);
        assertFalse(ad);
    }

    // ── toBps at both scales ──────────────────────────────────────────────
    function test_parity_toBps() public view {
        assertEq(lib.toBps(500_000, 1e6), 5000);
        assertEq(lib.toBps(5e17, 1e18), 5000);
        assertEq(lib.toBps(123_456, 1e6), 1234); // floor
        assertEq(lib.toBps(2e6, 1e6), 10_000); // clamp
    }

    function _u16(uint16 a) internal pure returns (uint16[] memory x) {
        x = new uint16[](1);
        x[0] = a;
    }

    function _u16(uint16 a, uint16 b) internal pure returns (uint16[] memory x) {
        x = new uint16[](2);
        x[0] = a;
        x[1] = b;
    }

    function _u128(uint128 a) internal pure returns (uint128[] memory x) {
        x = new uint128[](1);
        x[0] = a;
    }

    function _u128(uint128 a, uint128 b) internal pure returns (uint128[] memory x) {
        x = new uint128[](2);
        x[0] = a;
        x[1] = b;
    }
}
