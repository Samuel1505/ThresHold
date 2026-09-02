// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    ISomniaReactivityPrecompile
} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

/// @notice A test stand-in for the Somnia Reactivity precompile at 0x0100, `vm.etch`-ed into
///         place by the test rig. Unlike `vm.mockCall` it consumes realistic gas — the interface
///         doc quotes `SUBSCRIPTION_MANAGEMENT_GAS_COST (~210k GAS)` for subscribe/unsubscribe, so
///         the I5 measurement (16 triggers, one callback, < 10M) reflects the real cost of the one
///         dwell-expiry schedule the handler creates per callback.
contract MockReactivityPrecompile is ISomniaReactivityPrecompile {
    // NOTE: no initialiser — `vm.etch` copies runtime code only, not constructor-set storage.
    // `++nextId` makes the first id 1 so 0 stays "no subscription".
    uint256 public nextId;
    mapping(uint256 => SubscriptionData) internal _subs;
    mapping(uint256 => address) internal _owners;

    function subscribe(SubscriptionData calldata data) external returns (uint256 subscriptionId) {
        subscriptionId = ++nextId;
        _subs[subscriptionId] = data;
        _owners[subscriptionId] = msg.sender;
        _burn(); // pad toward the documented ~210k management cost
        emit SubscriptionCreated(subscriptionId, msg.sender, data);
    }

    function unsubscribe(uint256 subscriptionId) external {
        require(_owners[subscriptionId] == msg.sender, "not owner");
        delete _subs[subscriptionId];
        delete _owners[subscriptionId];
        _burn();
        emit SubscriptionRemoved(subscriptionId, msg.sender);
    }

    function getSubscriptionInfo(uint256 subscriptionId)
        external
        view
        returns (SubscriptionData memory, address)
    {
        return (_subs[subscriptionId], _owners[subscriptionId]);
    }

    /// @dev Burn ~180k gas with cold-ish SSTOREs so total ≈ the doc's 210k.
    uint256[64] internal _pad;

    function _burn() internal {
        unchecked {
            for (uint256 i; i < 64; ++i) {
                _pad[i] = _pad[i] + 1;
            }
        }
    }
}
