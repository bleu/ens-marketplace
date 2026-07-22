// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Provider-agnostic boundary for routing an arbitrary input token into the ETH a
/// renewal costs. The swap/intent provider is a deliberate open decision (see
/// docs/roadmap.md "Open items") — CoW Protocol is a strong internal candidate given
/// Bleu's existing tooling investment, but no provider is hardcoded here. `route` is left
/// opaque so a CoW-order-shaped payload (or any other provider's routing data) fits
/// without changing this interface.
interface ISwapAdapter {
    /// @notice Swaps up to `amountIn` of `tokenIn` for at least `minEthOut` ETH.
    /// @param route Opaque, provider-specific routing data (e.g. a CoW order or quote).
    /// @return ethOut The actual amount of ETH received.
    function swapExactInputForRenewalCost(address tokenIn, uint256 amountIn, uint256 minEthOut, bytes calldata route)
        external
        returns (uint256 ethOut);
}
