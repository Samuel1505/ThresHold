// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title DemoVault — the MVP action target (docs/04)
/// @notice Holds a "risky" balance and moves it to "safe" when the handler fires `derisk()`.
///         `derisk()` is restricted to the handler — defense on both sides of the allow-list
///         (docs/11). `reset()` matters: the demo gets re-recorded many times.
/// @dev `safeBalance` carries a permanent 1-wei sentinel (see constructor) — read
///      `deriskedAmount()` / `safeAmount()` for the real figure. On Somnia's ~10x gas schedule a
///      first-time 0→nonzero SSTORE needs ~1.5M gas *available*; the sentinel keeps the demo
///      action inside a modest `actionGasCap`.
contract DemoVault {
    uint256 internal constant SENTINEL = 1;

    address public immutable handler;
    address public immutable owner;

    uint256 public riskyBalance;
    uint256 public safeBalance;

    event Deposited(address indexed from, uint256 amount);
    event Derisked(uint256 amount, uint256 blockNumber);
    event Reset(uint256 riskyBalance);

    error OnlyHandler();
    error OnlyOwner();
    error TransferFailed();

    constructor(address _handler) {
        handler = _handler;
        owner = msg.sender;
        safeBalance = SENTINEL; // see contract @dev — keeps the slot non-zero forever
    }

    /// @notice The real de-risked total (excludes the sentinel).
    function safeAmount() external view returns (uint256) {
        return safeBalance - SENTINEL;
    }

    /// @notice Anyone can fund the risky side (the demo funds it before recording).
    function deposit() external payable {
        riskyBalance += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice The action. Only the handler may call it. Moves everything risky -> safe.
    function derisk() external {
        if (msg.sender != handler) revert OnlyHandler();
        uint256 amount = riskyBalance;
        riskyBalance = 0;
        safeBalance += amount;
        emit Derisked(amount, block.number);
    }

    /// @notice Re-arm the demo: sweep safe back to risky (keeping the sentinel). Owner only.
    function reset() external {
        if (msg.sender != owner) revert OnlyOwner();
        uint256 amount = safeBalance - SENTINEL;
        safeBalance = SENTINEL;
        riskyBalance += amount;
        emit Reset(riskyBalance);
    }

    /// @notice Withdraw the vault's ether to the owner (cleanup between demo cycles).
    function withdraw() external {
        if (msg.sender != owner) revert OnlyOwner();
        riskyBalance = 0;
        safeBalance = SENTINEL;
        (bool ok,) = owner.call{ value: address(this).balance }("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {
        riskyBalance += msg.value;
        emit Deposited(msg.sender, msg.value);
    }
}
