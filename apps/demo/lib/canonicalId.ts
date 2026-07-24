import { encodePacked, keccak256, toBytes } from "viem";

/// Mirrors MockENSv2Registry's canonical-ID scheme exactly (mock stand-in, not the real
/// ENSv2 derivation — see docs/roadmap.md "Open items" #3). Top-level: keccak256 of the
/// name string. Lets the frontend look up a name's ID without needing an indexer or a
/// prior on-chain read.
export function nameToCanonicalId(name: string): bigint {
  return BigInt(keccak256(toBytes(name)));
}

/// Subname: keccak256(abi.encodePacked(parentId, label)) — mirrors
/// MockENSv2Registry.registerSubname exactly.
export function subnameToCanonicalId(parentId: bigint, label: string): bigint {
  const packed = encodePacked(["uint256", "string"], [parentId, label]);
  return BigInt(keccak256(packed));
}

/// Safely parses a canonicalId route param (e.g. `params.canonicalId`) into a bigint.
/// `BigInt(...)` throws a SyntaxError on any non-numeric string (a mistyped or stale
/// URL segment) — this returns `null` instead so callers can render a "doesn't exist"
/// state rather than crashing with an unhandled exception.
export function parseCanonicalId(raw: string): bigint | null {
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}
