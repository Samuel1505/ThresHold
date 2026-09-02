// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IBinaryPool — the minimal DreamDEX BinaryPool surface Threshold reads
/// @notice Signatures copied verbatim from markets-sdk 0.28.1 `readsAbi.ts` (`binaryPoolReadAbi`),
///         verified live on Shannon in PHASE 0.4 (docs/02 PHASE 0 RESULTS).
///
///         `closingTop` is deliberately NOT here — it is 0.29.0-only and gated to
///         "capture-generation pools". Top-of-book comes from `getBookLevels(isBid, 1)`
///         (docs/07 §2 fallback).
interface IBinaryPool {
    /// @notice One price level. `price` and `quantity` are raw collateral units.
    struct Level {
        uint256 price;
        uint256 quantity;
    }

    /// @notice The whole pool state in one call. Field order is the on-chain tuple order.
    struct BinaryPoolParams {
        address collateralToken;
        address market;
        address outcomeToken;
        uint256 yesId;
        uint256 noId;
        uint256 oneCollateral; // 1e6 on Shannon, 1e18 on mainnet — NEVER hardcode
        uint256 setBacking;
        address feeRecipient;
        uint256 makerFeeBpsTimes1k;
        uint256 takerFeeBpsTimes1k;
        uint256 maxBuilderFeeBpsTimes1k;
        uint256 settlementFeeBpsTimes1k;
        address settlement;
        uint64 marketNonce;
        bool finalized;
    }

    /// @notice Up to `numLevels` price levels for one side of the book, best-first.
    ///         The book is quoted in YES terms on both legs (docs/07 §1).
    function getBookLevels(bool isBid, uint64 numLevels) external view returns (Level[] memory);

    /// @notice Increments on every pool recycle onto a new market. Gate G2 pins this at arm time.
    function marketNonce() external view returns (uint64);

    /// @notice True between `finalizeMarket` and the next recycle.
    function finalized() external view returns (bool);

    /// @notice Cheap "is there any book" check used by `createTrigger`.
    function booksEmpty() external view returns (bool);

    /// @notice Order-expiry cap, unix nanoseconds. Gate G4.
    function marketExpiryNs() external view returns (uint64);

    /// @notice Bundled state — Threshold uses `oneCollateral`, `market`, `marketNonce`, `finalized`.
    function getBinaryPoolParams() external view returns (BinaryPoolParams memory);
}
