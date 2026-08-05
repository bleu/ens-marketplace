import type { Address } from "viem";

export function shortAddr(address: Address | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isZeroAddress(address: Address | undefined): boolean {
  return !address || address === "0x0000000000000000000000000000000000000000";
}

/// Truncates a long numeric/string id (e.g. an ERC-721 token id) the same way
/// shortAddr truncates addresses, so long identifiers read consistently across the page.
export function shortId(id: string, keep = 6): string {
  if (id.length <= keep * 2 + 1) return id;
  return `${id.slice(0, keep)}…${id.slice(-4)}`;
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
