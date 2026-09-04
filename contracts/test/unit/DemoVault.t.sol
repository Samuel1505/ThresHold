// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { DemoVault } from "../../src/DemoVault.sol";

/// @notice PHASE 9 — DemoVault's own lifecycle (reset/withdraw/receive), separate from the
///         handler-driven state-machine tests that only ever exercise deposit()/derisk().
contract DemoVaultTest is Test {
    DemoVault vault;
    address owner = address(this);
    address handler = makeAddr("handler");
    address alice = makeAddr("alice");

    function setUp() public {
        vault = new DemoVault(handler);
    }

    function test_constructor_sentinelKeepsSlotNonZero() public view {
        assertEq(vault.safeBalance(), 1);
        assertEq(vault.safeAmount(), 0);
    }

    function test_deposit_viaFunction() public {
        vault.deposit{ value: 1 ether }();
        assertEq(vault.riskyBalance(), 1 ether);
    }

    function test_receive_plainTransferCreditsRisky() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit DemoVault.Deposited(address(this), 1 ether);
        (bool ok,) = address(vault).call{ value: 1 ether }("");
        assertTrue(ok);
        assertEq(vault.riskyBalance(), 1 ether);
    }

    function test_derisk_onlyHandler() public {
        vault.deposit{ value: 1 ether }();
        vm.expectRevert(DemoVault.OnlyHandler.selector);
        vault.derisk();
    }

    function test_derisk_movesRiskyToSafe() public {
        vault.deposit{ value: 3 ether }();
        vm.prank(handler);
        vault.derisk();
        assertEq(vault.riskyBalance(), 0);
        assertEq(vault.safeAmount(), 3 ether);
        assertEq(vault.safeBalance(), 3 ether + 1, "sentinel stays under the real balance");
    }

    function test_reset_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(DemoVault.OnlyOwner.selector);
        vault.reset();
    }

    function test_reset_sweepsSafeBackToRisky() public {
        vault.deposit{ value: 5 ether }();
        vm.prank(handler);
        vault.derisk();
        assertEq(vault.safeAmount(), 5 ether);

        vm.expectEmit(true, false, false, true, address(vault));
        emit DemoVault.Reset(5 ether);
        vault.reset();

        assertEq(vault.riskyBalance(), 5 ether, "swept back to risky for the next take");
        assertEq(vault.safeAmount(), 0);
        assertEq(vault.safeBalance(), 1, "sentinel preserved");
    }

    function test_reset_noOpWhenNothingToSweep() public {
        vault.reset();
        assertEq(vault.riskyBalance(), 0);
        assertEq(vault.safeBalance(), 1);
    }

    function test_withdraw_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(DemoVault.OnlyOwner.selector);
        vault.withdraw();
    }

    function test_withdraw_sendsFullBalanceAndResetsSentinel() public {
        vault.deposit{ value: 2 ether }();
        vm.prank(handler);
        vault.derisk();

        uint256 before = owner.balance;
        vault.withdraw();

        assertEq(owner.balance, before + 2 ether);
        assertEq(address(vault).balance, 0);
        assertEq(vault.riskyBalance(), 0);
        assertEq(vault.safeBalance(), 1, "sentinel restored, not left at 0");
    }

    function test_withdraw_revertsIfOwnerCannotReceive() public {
        RejectingOwner bad = new RejectingOwner();
        vm.prank(address(bad));
        DemoVault v2 = new DemoVault(handler);
        // deploy is from RejectingOwner's context so it is the owner
        vm.deal(address(v2), 1 ether);
        vm.prank(address(bad));
        vm.expectRevert(DemoVault.TransferFailed.selector);
        v2.withdraw();
    }

    /// @dev The test contract is the vault's owner for most cases above — it must accept
    ///      `withdraw()`'s payout.
    receive() external payable { }
}

/// @dev No receive/fallback — any plain-value transfer to it reverts.
contract RejectingOwner { }
