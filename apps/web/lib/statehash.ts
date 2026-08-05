import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/// Mirrors `StateHash.hash` in contracts/src/v2/libraries/StateHash.sol exactly:
/// `keccak256(abi.encode(state.owner, state.resolver))`. Used to compute
/// `expectedLiveHash` client-side before calling `acceptDiffAndRefill`.
export function computeStateHash(owner: Address, resolver: Address): Hex {
  const encoded = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [owner, resolver],
  );
  return keccak256(encoded);
}
