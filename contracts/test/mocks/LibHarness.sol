// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ProbabilityLib } from "../../src/ProbabilityLib.sol";
import { IBinaryPool } from "../../src/interfaces/IBinaryPool.sol";

/// @notice External wrapper so the `internal` ProbabilityLib can be exercised and asserted on
///         directly from tests.
contract LibHarness {
    function toBps(uint256 p, uint256 one) external pure returns (uint16) {
        return ProbabilityLib.toBps(p, one);
    }

    function snapshot(IBinaryPool pool, uint64 maxLevels)
        external
        view
        returns (ProbabilityLib.PoolSnapshot memory)
    {
        return ProbabilityLib.snapshot(pool, maxLevels);
    }

    function vwapUntil(ProbabilityLib.Level[] calldata levels, uint128 target)
        external
        pure
        returns (uint16 vwapBps, uint128 consumed)
    {
        return ProbabilityLib.vwapUntil(levels, target);
    }

    function depthWeightedBps(ProbabilityLib.PoolSnapshot calldata s, uint128 minDepth)
        external
        pure
        returns (uint16 mid, bool bidDeep, bool askDeep)
    {
        return ProbabilityLib.depthWeightedBps(s, minDepth);
    }

    /// @dev Convenience: the depth-weighted mid a pool would report right now.
    function midOf(IBinaryPool pool, uint64 maxLevels, uint128 minDepth)
        external
        view
        returns (uint16 mid, bool bidDeep, bool askDeep)
    {
        return ProbabilityLib.depthWeightedBps(ProbabilityLib.snapshot(pool, maxLevels), minDepth);
    }
}
