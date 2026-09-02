// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IBinaryPool } from "../../src/interfaces/IBinaryPool.sol";

/// @notice Test double for a DreamDEX BinaryPool. Selectors match `IBinaryPool` (which is copied
///         from markets-sdk 0.28.1 `binaryPoolReadAbi`) — test I1 asserts this.
contract MockBinaryPool is IBinaryPool {
    uint256 public oneCollateral = 1e6; // Shannon default
    address public market = address(uint160(uint256(keccak256("MockBinaryPool.market"))));
    uint64 internal _marketNonce = 1;
    bool internal _finalized;
    uint64 internal _marketExpiryNs = type(uint64).max; // far future by default

    Level[] internal _bids;
    Level[] internal _asks;

    /// @notice Exact shape from markets-sdk `orderBookEventsAbi` — for the topic0 test (A1).
    event OrderFilled(
        uint128 indexed takerOrderId,
        uint128 indexed makerOrderId,
        uint256 quantityFilled,
        uint256 takerRemainingQuantity,
        uint256 makerRemainingQuantity,
        uint256 fillPrice
    );

    function emitOrderFilled(uint256 fillPrice) external {
        emit OrderFilled(1, 2, 5e6, 0, 0, fillPrice);
    }

    // ─────────────────────────────────────────────────────────── test setters ──

    function setOneCollateral(uint256 v) external {
        oneCollateral = v;
    }

    function setMarketNonce(uint64 v) external {
        _marketNonce = v;
    }

    function setFinalized(bool v) external {
        _finalized = v;
    }

    function setMarketExpiryNs(uint64 v) external {
        _marketExpiryNs = v;
    }

    /// @param prices raw prices, best-first; @param quantities raw quantities, same length.
    function setBids(uint256[] calldata prices, uint256[] calldata quantities) external {
        _setSide(_bids, prices, quantities);
    }

    function setAsks(uint256[] calldata prices, uint256[] calldata quantities) external {
        _setSide(_asks, prices, quantities);
    }

    function _setSide(
        Level[] storage side,
        uint256[] calldata prices,
        uint256[] calldata quantities
    ) internal {
        require(prices.length == quantities.length, "len");
        while (side.length != 0) {
            side.pop();
        }
        for (uint256 i; i < prices.length; ++i) {
            side.push(Level({ price: prices[i], quantity: quantities[i] }));
        }
    }

    // ───────────────────────────────────────────────────────────── IBinaryPool ──

    function getBookLevels(bool isBid, uint64 numLevels)
        external
        view
        returns (Level[] memory out)
    {
        Level[] storage side = isBid ? _bids : _asks;
        uint256 n = side.length < numLevels ? side.length : numLevels;
        out = new Level[](n);
        for (uint256 i; i < n; ++i) {
            out[i] = side[i];
        }
    }

    function marketNonce() external view returns (uint64) {
        return _marketNonce;
    }

    function finalized() external view returns (bool) {
        return _finalized;
    }

    function booksEmpty() external view returns (bool) {
        return _bids.length == 0 && _asks.length == 0;
    }

    function marketExpiryNs() external view returns (uint64) {
        return _marketExpiryNs;
    }

    function getBinaryPoolParams() external view returns (BinaryPoolParams memory) {
        return BinaryPoolParams({
            collateralToken: address(0),
            market: market,
            outcomeToken: address(0),
            yesId: 0,
            noId: 0,
            oneCollateral: oneCollateral,
            setBacking: 0,
            feeRecipient: address(0),
            makerFeeBpsTimes1k: 0,
            takerFeeBpsTimes1k: 0,
            maxBuilderFeeBpsTimes1k: 0,
            settlementFeeBpsTimes1k: 0,
            settlement: address(0),
            marketNonce: _marketNonce,
            finalized: _finalized
        });
    }
}
