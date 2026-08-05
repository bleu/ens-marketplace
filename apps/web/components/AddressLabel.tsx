"use client";

import type { Address } from "viem";
import { useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { displayableEnsName, isZeroAddress, shortAddr } from "@/lib/format";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/// Reverse-resolves `address` to its primary ENS name, falling back to short hex whenever
/// there isn't a name to show — so callers can render the result unconditionally.
///
/// Always resolves against mainnet, never the connected chain; see lib/wagmi.ts for why.
/// The hex renders first and the name swaps in when the lookup lands. No loading state:
/// hex is already the truth, so there's nothing to hide behind a skeleton, and with
/// `staleTime: Infinity` a revisit paints the name straight away.
///
/// Cache settings live here rather than on the shared QueryClient (app/providers.tsx) —
/// a primary name effectively never changes within a session, but the contract reads
/// sharing that client need to stay fresh.
export function useDisplayName(address: Address | undefined, options?: { enabled?: boolean }): string {
  const { data } = useEnsName({
    address,
    chainId: mainnet.id,
    query: {
      enabled: (options?.enabled ?? true) && !isZeroAddress(address),
      staleTime: Infinity,
      gcTime: ONE_DAY_MS,
      retry: 1,
    },
  });
  return displayableEnsName(data ?? null) ?? shortAddr(address);
}

/// Bare span with no styling of its own, so font and color inherit from whatever wraps it
/// and swapping this in at a call site changes no layout. The full address stays reachable
/// through the native `title` tooltip rather than being printed alongside the name.
///
/// Not a link: several call sites sit inside already-clickable rows, where a nested anchor
/// breaks keyboard navigation. Use components/AddressLink where an explorer link is wanted.
export function AddressLabel({ address, className }: { address: Address | undefined; className?: string }) {
  const label = useDisplayName(address);
  if (isZeroAddress(address)) return <span className={className}>—</span>;
  return (
    <span className={className} title={address}>
      {label}
    </span>
  );
}
