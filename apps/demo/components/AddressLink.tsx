"use client";

import type { Address } from "viem";
import { useDisplayName } from "@/components/AddressLabel";
import { Network } from "@/lib/contracts";
import { explorerAddressUrl } from "@/lib/explorer";
import { shortAddr } from "@/lib/format";

/// Renders an address as a link out to the right block explorer for `network` —
/// Etherscan for Sepolia/Mainnet, self-hosted Otterscan for local Anvil (see lib/explorer).
/// Shows the owner's primary ENS name when they have one, short hex otherwise; the link
/// target is always the address either way, so a name never sends you somewhere else.
/// `stopPropagation` is for the rare case this ends up nested inside a clickable row
/// (e.g. a table row that navigates on click) — without it, clicking the address would
/// both open the explorer tab and trigger the row's own navigation.
/// `showName={false}` forces hex for the few places where a readable name is worse than an
/// address: side-by-side value comparisons, and rows whose whole point is the address.
/// It also has to override the resolved name rather than just skip the lookup, since the
/// name may already sit in the React Query cache from another row on the page.
export function AddressLink({
  address,
  network,
  stopPropagation,
  showName = true,
}: {
  address: Address | undefined;
  network: Network;
  stopPropagation?: boolean;
  showName?: boolean;
}) {
  const name = useDisplayName(address, { enabled: showName });
  const label = showName ? name : shortAddr(address);
  if (!address) return null;
  return (
    <a
      href={explorerAddressUrl(network, address)}
      target="_blank"
      rel="noreferrer"
      className="hover:underline"
      title={address}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {label}
    </a>
  );
}
