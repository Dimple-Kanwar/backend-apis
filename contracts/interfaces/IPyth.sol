// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Consume prices from the Pyth Network (https://pyth.network/)
interface IPyth {
    struct Price {
        // Price
        int64 price;
        // Confidence interval around the price
        uint64 conf;
        // Price exponent
        int32 expo;
        // Unix timestamp describing when the price was published
        uint publishTime;
    }

    struct PriceFeed {
        // The price ID.
        bytes32 id;
        // Latest available price
        Price price;
        // Latest available exponentially-weighted moving average price
        Price emaPrice;
    }

    /// @notice Returns the current price feed with given id
    /// @dev Reverts if the price has not been updated within the grace period.
    /// @param id The Pyth price feed ID
    /// @return The current price feed data
    function getPriceUnsafe(bytes32 id) external view returns (PriceFeed calldata);

    /// @notice Returns the current price feed with given id
    /// @param id The Pyth price feed ID
    /// @param maxAge Maximum age of the price feed in seconds
    /// @return The current price feed data
    function getPrice(bytes32 id, uint maxAge) external view returns (PriceFeed calldata);
}
