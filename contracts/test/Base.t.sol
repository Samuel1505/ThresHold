// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import {
    ISomniaReactivityPrecompile
} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

import { ThresholdRegistry } from "../src/ThresholdRegistry.sol";
import { ThresholdHandler } from "../src/ThresholdHandler.sol";
import { DemoVault } from "../src/DemoVault.sol";
import { ProbabilityLib } from "../src/ProbabilityLib.sol";
import { IBinaryPool } from "../src/interfaces/IBinaryPool.sol";
import { CreateParams, Direction, TriggerState } from "../src/Types.sol";
import { MockBinaryPool } from "./mocks/MockBinaryPool.sol";
import { MockReactivityPrecompile } from "./mocks/MockReactivityPrecompile.sol";

/// @notice Shared PHASE 2 test rig: a wired registry+handler+vault, a mock pool with a symmetric
///         book, a funded registry, and a mocked reactivity precompile (so `_subscribe` /
///         `_unsubscribe` behave without a live chain).
abstract contract Base is Test {
    ThresholdRegistry internal registry;
    ThresholdHandler internal handler;
    DemoVault internal vault;
    MockBinaryPool internal pool;

    address internal constant PRECOMPILE = address(0x0100);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes4 internal constant DERISK_SEL = DemoVault.derisk.selector;

    function setUp() public virtual {
        registry = new ThresholdRegistry(); // admin = address(this)
        handler = new ThresholdHandler(registry);
        vault = new DemoVault(address(handler));

        registry.setHandler(address(handler));
        registry.setActionAllowed(address(vault), DERISK_SEL, true);

        pool = new MockBinaryPool();
        _setBook(pool, 3900, 4100, 200e6); // ~0.40 mid, 200-bps spread, deep

        vm.deal(address(registry), 40 ether);
        // Etch a realistic precompile at 0x0100 (consumes ~management-cost gas, unlike vm.mockCall)
        // so the I5 gas measurement reflects the true cost of the dwell-expiry schedule.
        vm.etch(PRECOMPILE, address(new MockReactivityPrecompile()).code);

        vm.deal(address(vault), 0);
        vault.deposit{ value: 10 ether }();
    }

    // ─────────────────────────────────────────────────────────────── helpers ──

    /// @dev One flat level per side at the given bps, `notionalPerSide` raw collateral each.
    function _setBook(MockBinaryPool p, uint256 bidBps, uint256 askBps, uint256 notionalPerSide)
        internal
    {
        uint256 one = p.oneCollateral();
        uint256[] memory bp = new uint256[](1);
        uint256[] memory bq = new uint256[](1);
        uint256[] memory ap = new uint256[](1);
        uint256[] memory aq = new uint256[](1);
        bp[0] = (bidBps * one) / 10_000;
        ap[0] = (askBps * one) / 10_000;
        // notional = price * qty / one  =>  qty = notional * one / price
        bq[0] = bp[0] == 0 ? 0 : (notionalPerSide * one) / bp[0];
        aq[0] = ap[0] == 0 ? 0 : (notionalPerSide * one) / ap[0];
        p.setBids(bp, bq);
        p.setAsks(ap, aq);
    }

    /// @dev A multi-level book. `bidBps`/`askBps` best-first; `*Notional` is raw collateral per
    ///      level (converted to a quantity the mock stores). Empty array = that side is empty.
    function _setMultiBook(
        uint16[] memory bidBps,
        uint128[] memory bidNotional,
        uint16[] memory askBps,
        uint128[] memory askNotional
    ) internal {
        pool.setBids(_prices(bidBps), _qtys(bidBps, bidNotional));
        pool.setAsks(_prices(askBps), _qtys(askBps, askNotional));
    }

    function _prices(uint16[] memory bps) private view returns (uint256[] memory out) {
        uint256 one = pool.oneCollateral();
        out = new uint256[](bps.length);
        for (uint256 i; i < bps.length; ++i) {
            out[i] = (uint256(bps[i]) * one) / 10_000;
        }
    }

    function _qtys(uint16[] memory bps, uint128[] memory notional)
        private
        view
        returns (uint256[] memory out)
    {
        uint256 one = pool.oneCollateral();
        out = new uint256[](bps.length);
        for (uint256 i; i < bps.length; ++i) {
            uint256 price = (uint256(bps[i]) * one) / 10_000;
            out[i] = price == 0 ? 0 : (uint256(notional[i]) * one) / price;
        }
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

    function _u16(uint16 a, uint16 b, uint16 c) internal pure returns (uint16[] memory x) {
        x = new uint16[](3);
        x[0] = a;
        x[1] = b;
        x[2] = c;
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

    function _u128(uint128 a, uint128 b, uint128 c) internal pure returns (uint128[] memory x) {
        x = new uint128[](3);
        x[0] = a;
        x[1] = b;
        x[2] = c;
    }

    function _emptyU16() internal pure returns (uint16[] memory x) {
        x = new uint16[](0);
    }

    function _emptyU128() internal pure returns (uint128[] memory x) {
        x = new uint128[](0);
    }

    function _defaultParams() internal view returns (CreateParams memory) {
        return CreateParams({
            pool: address(pool),
            thresholdBps: 5000,
            direction: Direction.ABOVE,
            dwellSec: 30,
            maxSpreadBps: 500,
            minDepthPerSide: 10e6,
            target: address(vault),
            selector: DERISK_SEL,
            payload: "",
            actionGasCap: 200_000,
            expiresAt: 0,
            recurring: false,
            cooldownSec: 0
        });
    }

    function _arm(address who, CreateParams memory p) internal returns (uint256 id) {
        vm.prank(who);
        id = registry.createTrigger(p);
    }

    /// @dev Deliver an `OrderFilled` callback for `pool` from the precompile.
    function _fill() internal {
        bytes32[] memory topics = new bytes32[](1);
        topics[0] = registry.ORDER_FILLED_TOPIC0();
        vm.prank(PRECOMPILE);
        handler.onEvent(address(pool), topics, "");
    }

    /// @dev Deliver a scheduled dwell-expiry tick from the precompile (emitter = 0x0100).
    function _scheduledTick() internal {
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = ISomniaReactivityPrecompile.Schedule.selector;
        topics[1] = bytes32(block.timestamp * 1000);
        vm.prank(PRECOMPILE);
        handler.onEvent(PRECOMPILE, topics, "");
    }

    function _state(uint256 id) internal view returns (TriggerState) {
        return registry.get(id).state;
    }

    /// @dev DemoVault carries a 1-wei sentinel in `safeBalance` (Shannon cold-SSTORE avoidance).
    function _safe() internal view returns (uint256) {
        return vault.safeAmount();
    }

    /// @dev The test contract is the registry admin — it must accept `withdrawSurplus` payouts.
    receive() external payable { }
}
