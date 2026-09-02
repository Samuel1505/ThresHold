// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {
    SomniaEventHandler
} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {
    SomniaExtensions
} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

/// @title MinimalSubscriber — PHASE 0 verification harness (docs/16 §0.2, §0.6, §0.7)
/// @notice Throwaway contract that proves, on live Shannon, the three assumptions that
///         can kill Threshold before any product code is written:
///           0.2 — a contract funded with >= 32 STT can call `SomniaExtensions.subscribe`
///           0.6 — the precompile actually invokes the handler on a BinaryPool `OrderFilled`
///           0.7 — whether that callback lands in the SAME block as the fill
/// @dev Not part of the product. Delete after PHASE 0 results are written into docs/02.
contract MinimalSubscriber is SomniaEventHandler {
    address public immutable owner;

    /// @notice keccak256("OrderFilled(uint128,uint128,uint256,uint256,uint256,uint256)")
    /// @dev COMPUTED locally with `cast keccak`. PHASE 0.5 must confirm this equals a real
    ///      emitted log's topic0 before the product trusts it — the SDK documents a past
    ///      incident where a wrong ABI arity produced a different topic0 and the filter
    ///      silently matched nothing (docs/02, docs/05, adversarial test A1).
    bytes32 public constant ORDER_FILLED_TOPIC0 =
        0xc87f4223e9e7c4e4f39f9b34fc9d64d78cdb95d9035b3748cbde59521261a399;

    uint256 public lastSubscriptionId;
    uint256 public callbackCount;

    /// @notice Recorded so PHASE 0.7 can compare the fill block to the callback block.
    struct Callback {
        address emitter;
        bytes32 topic0;
        uint256 blockNumber;
        uint256 timestamp;
        bytes data;
    }

    Callback[] public callbacks;

    event Subscribed(uint256 indexed subscriptionId, address indexed emitter, bytes32 topic0);
    event Unsubscribed(uint256 indexed subscriptionId);
    /// @dev Emitted on EVERY `_onEvent` entry, before any logic — silent callback failures
    ///      are otherwise undiagnosable (docs/18).
    event CallbackReceived(
        address indexed emitter, bytes32 indexed topic0, uint256 blockNumber, uint256 dataLen
    );
    event Funded(address indexed from, uint256 amount);

    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// @notice PHASE 0.2 / 0.6 — subscribe this contract to `pool`'s `OrderFilled`.
    /// @param pool  the BinaryPool address discovered in PHASE 0.3
    /// @param topic0 the OrderFilled signature hash CONFIRMED against a live log in PHASE 0.5
    function subscribeToPool(address pool, bytes32 topic0)
        external
        onlyOwner
        returns (uint256 subscriptionId)
    {
        SomniaExtensions.SubscriptionFilter memory filter =
            SomniaExtensions.SubscriptionFilter({
                eventTopics: [topic0, bytes32(0), bytes32(0), bytes32(0)],
                origin: address(0),
                emitter: pool
            });

        SomniaExtensions.SubscriptionOptions memory opts = SomniaExtensions.SubscriptionOptions({
            priorityFeePerGas: 1 gwei, maxFeePerGas: 20 gwei, gasLimit: 10_000_000
        });

        subscriptionId = SomniaExtensions.subscribe(address(this), filter, opts);
        lastSubscriptionId = subscriptionId;
        emit Subscribed(subscriptionId, pool, topic0);
    }

    function unsubscribe(uint256 subscriptionId) external onlyOwner {
        SomniaExtensions.unsubscribe(subscriptionId);
        emit Unsubscribed(subscriptionId);
    }

    function callbacksLength() external view returns (uint256) {
        return callbacks.length;
    }

    function withdraw() external onlyOwner {
        (bool ok,) = owner.call{ value: address(this).balance }("");
        require(ok, "withdraw failed");
    }

    function _onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data)
        internal
        override
    {
        bytes32 topic0 = eventTopics.length > 0 ? eventTopics[0] : bytes32(0);
        emit CallbackReceived(emitter, topic0, block.number, data.length);
        callbackCount++;
        callbacks.push(
            Callback({
                emitter: emitter,
                topic0: topic0,
                blockNumber: block.number,
                timestamp: block.timestamp,
                data: data
            })
        );
    }
}
