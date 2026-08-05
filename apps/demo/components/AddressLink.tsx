"use client";

import type { Address } from "viem";
import { Network } from "@/lib/contracts";
import { explorerAddressUrl } from "@/lib/explorer";
import { shortAddr } from "@/lib/format";

/// Renders a shortened address as a link out to the right Etherscan for `network` (see
/// lib/explorer).
/// `stopPropagation` is for the rare case this ends up nested inside a clickable row
/// (e.g. a table row that navigates on click) — without it, clicking the address would
/// both open the explorer tab and trigger the row's own navigation.
export function AddressLink({
  address,
  network,
  stopPropagation,
}: {
  address: Address | undefined;
  network: Network;
  stopPropagation?: boolean;
}) {
  if (!address) return null;
  return (
    <a
      href={explorerAddressUrl(network, address)}
      target="_blank"
      rel="noreferrer"
      className="hover:underline"
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {shortAddr(address)}
    </a>
  );
}
