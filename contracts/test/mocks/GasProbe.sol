// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { DemoVault } from "../../src/DemoVault.sol";

/// @notice Deployed as a DemoVault's `handler` so we can measure `derisk()`'s real gas cost on
///         Shannon (its ~10x gas schedule broke the 200k / 500k action caps in PHASE 5).
contract GasProbe {
    event DeriskGas(uint256 gasUsed, bool ok);

    function probe(DemoVault vault) external returns (uint256 used, bool ok) {
        bytes memory cd = abi.encodeWithSelector(DemoVault.derisk.selector);
        uint256 g0 = gasleft();
        (ok,) = address(vault).call(cd);
        used = g0 - gasleft();
        emit DeriskGas(used, ok);
    }

    function probeCapped(DemoVault vault, uint256 cap) external returns (bool ok) {
        (ok,) = address(vault).call{ gas: cap }(abi.encodeWithSelector(DemoVault.derisk.selector));
        emit DeriskGas(cap, ok);
    }
}
