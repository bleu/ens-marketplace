import type { Address } from "viem";

export function shortAddr(address: Address | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isZeroAddress(address: Address | undefined): boolean {
  return !address || address === "0x0000000000000000000000000000000000000000";
}
