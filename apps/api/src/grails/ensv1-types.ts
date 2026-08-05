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
  source: "opensea" | "grails" | "farol";
}

/// Same Seaport 1.6 mainnet deployment address apps/web/lib/ensv1.ts uses — shared by
/// every marketplace built on the protocol (OpenSea, Grails, ...).
export const SEAPORT_CONTRACT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395" as const;

/// The two contracts a sellable .eth name can live in — legacy unwrapped names as ERC-721
/// on the BaseRegistrar, wrapped ones as ERC-1155 on the NameWrapper. Same addresses as
/// apps/web/lib/ensv1.ts.
export const BASE_REGISTRAR_ADDRESS = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85" as const;
export const NAME_WRAPPER_ADDRESS = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401" as const;
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

export function currencySymbolFor(address: string): string {
  const lower = address.toLowerCase();
  if (lower === "0x0000000000000000000000000000000000000000") return "ETH";
  if (lower === WETH_ADDRESS) return "WETH";
  return `${address.slice(0, 6)}…`;
}
