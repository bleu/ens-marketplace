/// Mirrors apps/web/lib/ensv1.ts's EnsV1Listing/OpenSeaListing exactly — this service's
/// whole job is producing data apps/web can drop in with zero shape changes on its side.
/// Duplicated here rather than imported across the workspace since apps/api and apps/web
/// are genuinely separate deployables with no shared package between them.

export interface OpenSeaOfferItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
}

export interface OpenSeaListing {
  order_hash: string;
  protocol_address: string;
  protocol_data: { parameters: { offer: OpenSeaOfferItem[]; [key: string]: unknown }; signature: string };
  price: { current: { value: string; decimals: number; currency: string } };
}

export interface EnsV1Listing {
  name: string | null;
  price: { value: string; decimals: number; currency: string };
  listing: OpenSeaListing;
  source: "opensea" | "grails";
}

/// Same Seaport 1.6 mainnet deployment address apps/web/lib/ensv1.ts uses — shared by
/// every marketplace built on the protocol (OpenSea, Grails, ...).
export const SEAPORT_CONTRACT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395" as const;
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

export function currencySymbolFor(address: string): string {
  const lower = address.toLowerCase();
  if (lower === "0x0000000000000000000000000000000000000000") return "ETH";
  if (lower === WETH_ADDRESS) return "WETH";
  return `${address.slice(0, 6)}…`;
}
