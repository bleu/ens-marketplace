import { ens_normalize as normalize } from "@adraffy/ens-normalize";
import { formatUnits, type Address } from "viem";

export function shortAddr(address: Address | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isZeroAddress(address: Address | undefined): boolean {
  return !address || address === "0x0000000000000000000000000000000000000000";
}

/// Gate for showing a reverse-resolved ENS name on screen: returns the name only when it
/// is already in normalized form, otherwise null so the caller falls back to hex.
///
/// Returns `raw` and never the normalized form, even when normalization succeeds. The
/// on-chain reverse check (viem's reverseWithGateways) proved the *raw* string resolves
/// back to this address, so a normalized form that differs from it is a name nothing
/// verified — displaying it would put an unchecked string next to a listing. A resolver
/// can return anything, including confusable unicode or a right-to-left override.
export function displayableEnsName(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return normalize(raw) === raw ? raw : null;
  } catch {
    return null;
  }
}

/// Truncates a long numeric/string id (e.g. an ERC-721 token id) the same way
/// shortAddr truncates addresses, so long identifiers read consistently across the page.
export function shortId(id: string, keep = 6): string {
  if (id.length <= keep * 2 + 1) return id;
  return `${id.slice(0, keep)}…${id.slice(-4)}`;
}

/// A token amount trimmed to digits a person can actually compare. `formatUnits` returns
/// the exact on-chain value, which for an 18-decimal token means list rows like
/// "0.043912830000000001 ETH" — the tail is noise, and it makes a column of prices
/// impossible to scan. Precision scales with size: sub-1 amounts keep four decimals so
/// near-identical prices stay distinguishable, whole-ETH amounts keep three, and anything
/// over a thousand drops the fraction entirely and gets thousands separators.
///
/// Display only. Pair it with `title={formatUnits(...)}` wherever the exact figure matters,
/// and never feed the result back into a transaction.
export function formatTokenAmount(value: bigint, decimals: number): string {
  const n = Number(formatUnits(value, decimals));
  if (n === 0) return "0";
  // Rounding these to four decimals would print "0.0000", which reads as free.
  if (n < 0.0001) return "<0.0001";
  const maxFraction = n >= 1000 ? 0 : n >= 1 ? 3 : 4;
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFraction });
}

/// Validates free-text numeric inputs (ETH price fields, day-count fields) before
/// they're handed to viem's parseEther / BigInt() — those throw synchronously on
/// malformed input (e.g. "abc", "1.2.3", ""), which would otherwise surface as an
/// uncaught exception instead of the app's normal writeError UI.
export function isPositiveNumber(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim()) && Number(value) > 0;
}

/// Same as isPositiveNumber but whole numbers only — for fields (e.g. lease term
/// in days) that get multiplied out and passed to BigInt(), which throws on any
/// non-integer result rather than truncating it.
export function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
}

/// Formats a duration in seconds using whichever unit (minutes/hours/days) keeps the
/// number readable, instead of always dividing into days — a short demo lease term
/// (e.g. 300s) would otherwise round down to a meaningless "0.00 days".
export function formatDuration(seconds: number): string {
  const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");
  const unit = (n: number, label: string) => `${trim(n)} ${label}${n === 1 ? "" : "s"}`;

  if (seconds < 60) return unit(seconds, "second");
  if (seconds < 3600) return unit(seconds / 60, "minute");
  if (seconds < 86400) return unit(seconds / 3600, "hour");
  return unit(seconds / 86400, "day");
}
