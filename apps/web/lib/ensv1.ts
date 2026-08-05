import { ens_normalize as normalize } from "@adraffy/ens-normalize";
import { concat, keccak256, toBytes, toHex, zeroHash } from "viem";

/// Real ENS (mainnet, "ENSv1") integration — read-only name/ownership lookups via the
/// official ENS subgraph, plus real OpenSea listing data, kept separate from the
/// ENSv2 mock marketplace (lib/contracts.ts, lib/events.ts) which is entirely local/fake.
/// See docs/roadmap.md for why these two data models don't share code: ENSv2's
/// canonical-ID/regeneration scheme doesn't exist on mainnet, so ENSv1 names are
/// necessarily a different (read-mostly) code path.

export const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;
/// Legacy unwrapped .eth 2LD names, ERC-721, tokenId = uint256(labelhash(label)).
export const BASE_REGISTRAR_ADDRESS = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85" as const;
/// Wrapped ENS names (any depth), ERC-1155, tokenId = uint256(namehash(name)).
export const NAME_WRAPPER_ADDRESS = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401" as const;
/// Both addresses verified against docs.ens.domains/learn/deployments/ (2026-07-24).

/// Standard ENS namehash (EIP-137) — recursively hashes labels right-to-left, each
/// label normalized per ENSIP-1 (via @adraffy/ens-normalize, already a dependency)
/// so it matches what real ENS resolution actually does with unicode/confusable labels.
export function namehash(name: string): `0x${string}` {
  if (!name) return zeroHash;
  const normalized = normalize(name);
  const labels = normalized.split(".");
  let node: `0x${string}` = zeroHash;
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak256(toBytes(labels[i]));
    node = keccak256(concat([node, labelHash]));
  }
  return node;
}

/// keccak256 of a single label (not the full dotted name) — this is the tokenId basis
/// for legacy unwrapped .eth 2LD names on BaseRegistrar, and the subgraph's
/// Registration entity id.
export function labelhash(label: string): `0x${string}` {
  return keccak256(toBytes(normalize(label)));
}

/// The decimal-string tokenId(s) a given name could be listed under, so a by-name
/// lookup can query OpenSea's direct per-NFT endpoint instead of paginating the whole
/// collection. `wrapped` (NameWrapper, namehash) always applies; `unwrapped`
/// (BaseRegistrar, labelhash of just the 2LD label) only applies to a direct "label.eth"
/// name — subnames and non-.eth names can't exist unwrapped, so it's null there.
export function candidateTokenIds(name: string): { wrapped: string; unwrapped: string | null } {
  const wrapped = BigInt(namehash(name)).toString();
  const labels = normalize(name).split(".");
  const unwrapped = labels.length === 2 && labels[1] === "eth" ? BigInt(labelhash(labels[0])).toString() : null;
  return { wrapped, unwrapped };
}

/// Seaport 1.6 mainnet deployment — shared by every marketplace built on the protocol
/// (OpenSea, Grails, ...); verified against Grails' own contracts.ts. Grails' listings
/// don't include this as an explicit field the way OpenSea's response does, so it's
/// used as the fulfillment target when normalizing a Grails listing (see app/api/ensv1/
/// grails-listings) rather than trusting a per-listing field that doesn't exist there.
export const SEAPORT_CONTRACT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395" as const;
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

export function currencySymbolFor(address: string): string {
  const lower = address.toLowerCase();
  if (lower === "0x0000000000000000000000000000000000000000") return "ETH";
  if (lower === WETH_ADDRESS) return "WETH";
  return `${address.slice(0, 6)}…`;
}

export function ensAppUrl(name: string): string {
  return `https://app.ens.domains/${name}`;
}

export function openseaAssetUrl(contract: `0x${string}`, identifier: string): string {
  return `https://opensea.io/assets/ethereum/${contract}/${identifier}`;
}

/// grails.app's own per-name route is a top-level dynamic segment (src/app/[name] in
/// their frontend repo), confirmed by reading their source rather than guessed.
export function grailsUrl(name: string): string {
  return `https://grails.app/${name}`;
}

export interface EnsV1Domain {
  name: string;
  owner: `0x${string}`;
  resolver: `0x${string}` | null;
  resolvedAddress: `0x${string}` | null;
  registrationDate: number | null;
  expiryDate: number | null;
}

const SUBGRAPH_QUERY = `
  query GetDomain($id: String!) {
    domain(id: $id) {
      name
      owner { id }
      resolver { address, addr { id } }
      registration { registrationDate, expiryDate }
    }
  }
`;

export function subgraphEndpoint(): string {
  const apiKey = process.env.THEGRAPH_API_KEY;
  // Falls back to the legacy DAO-sponsored endpoint (rate-limited, fine for light
  // testing per ENS's own docs) when no key is configured yet, rather than failing
  // outright — see docs.ens.domains/web/subgraph.
  if (!apiKey) return "https://api.thegraph.com/subgraphs/name/ensdomains/ens";
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH`;
}

const SUBGRAPH_RETRY_DELAYS_MS = [300, 900, 1800];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// The free/no-key fallback subgraph endpoint (see subgraphEndpoint) is shared and
/// rate-limited — a 429 there is routine, transient traffic contention, not a real
/// failure, and without a retry it surfaces as "couldn't load this name" on the very
/// first click after any burst of other requests (e.g. the Explore grid's own listing
/// resolution). Retried with backoff before giving up; a dedicated THE_GRAPH_API_KEY
/// (see .env.example) removes the rate limit entirely and makes this a non-issue.
async function querySubgraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(subgraphEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 && attempt < SUBGRAPH_RETRY_DELAYS_MS.length) {
      await sleep(SUBGRAPH_RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (!res.ok) throw new Error(`Subgraph request failed: ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(`Subgraph query error: ${JSON.stringify(json.errors)}`);
    return json.data as T;
  }
}

interface DomainQueryResult {
  domain: {
    name: string;
    owner: { id: string };
    // The subgraph's Resolver entity id is a composite "{resolverAddress}-{node}" string,
    // not a plain address — `address` is the actual resolver contract address field.
    resolver: { address: string; addr: { id: string } | null } | null;
    registration: { registrationDate: string; expiryDate: string } | null;
  } | null;
}

/// Looks up a real mainnet ENS name's current owner/resolver/expiry via the subgraph.
/// Returns null if the name isn't registered (or the subgraph has no record of it).
export async function lookupEnsV1Domain(name: string): Promise<EnsV1Domain | null> {
  const normalized = normalize(name);
  const id = namehash(normalized);
  const data = await querySubgraph<DomainQueryResult>(SUBGRAPH_QUERY, { id });
  if (!data.domain) return null;
  const d = data.domain;
  return {
    name: d.name,
    owner: d.owner.id as `0x${string}`,
    resolver: d.resolver?.address ? (d.resolver.address as `0x${string}`) : null,
    resolvedAddress: d.resolver?.addr?.id ? (d.resolver.addr.id as `0x${string}`) : null,
    registrationDate: d.registration ? Number(d.registration.registrationDate) : null,
    expiryDate: d.registration ? Number(d.registration.expiryDate) : null,
  };
}

const NAMES_BY_ID_QUERY = `
  query NamesByDomainId($ids: [String!]!) {
    domains(where: { id_in: $ids }) {
      id
      name
    }
  }
`;

const NAMES_BY_REGISTRATION_ID_QUERY = `
  query NamesByRegistrationId($ids: [String!]!) {
    registrations(where: { id_in: $ids }) {
      id
      domain { name }
    }
  }
`;

/// Batch-resolves real dotted names for a set of tokenIds, split by which real ENS
/// contract minted them (see lib/ensv1-contracts.ts) — NameWrapper tokenIds are
/// namehashes (subgraph Domain.id), BaseRegistrar tokenIds are labelhashes (subgraph
/// Registration.id). Anything the subgraph doesn't recognize is simply omitted, not
/// guessed at — callers should treat missing entries as "couldn't resolve a name for
/// this listing" and skip displaying it, rather than showing a raw tokenId as if it
/// were meaningful.
export async function batchResolveNames(
  wrapperHexIds: string[],
  registrarHexIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const [byDomain, byRegistration] = await Promise.all([
    wrapperHexIds.length
      ? querySubgraph<{ domains: { id: string; name: string }[] }>(NAMES_BY_ID_QUERY, { ids: wrapperHexIds })
      : Promise.resolve({ domains: [] }),
    registrarHexIds.length
      ? querySubgraph<{ registrations: { id: string; domain: { name: string } }[] }>(NAMES_BY_REGISTRATION_ID_QUERY, {
          ids: registrarHexIds,
        })
      : Promise.resolve({ registrations: [] }),
  ]);
  for (const d of byDomain.domains) result.set(d.id, d.name);
  for (const r of byRegistration.registrations) result.set(r.id, r.domain.name);
  return result;
}

export function tokenIdToHex(tokenId: string): string {
  return toHex(BigInt(tokenId), { size: 32 });
}

export interface OpenSeaOfferItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
}

/// Shape of a single entry from OpenSea's /listings/collection/{slug}/all — shared by
/// the server-side proxy route (app/api/ensv1/listings) and the client fulfillment code
/// (lib/seaport.ts), so both agree on exactly what a "listing" looks like.
export interface OpenSeaListing {
  order_hash: string;
  protocol_address: string;
  protocol_data: { parameters: { offer: OpenSeaOfferItem[]; [key: string]: unknown }; signature: string };
  price: { current: { value: string; decimals: number; currency: string } };
}

export interface EnsV1Listing {
  /// Null when the subgraph couldn't map this listing's tokenId back to a dotted name
  /// (see resolveListingNames in app/api/ensv1/listings) — the listing itself is still
  /// real and fulfillable, just without a pretty display name. Callers must not assume
  /// this is always a string.
  name: string | null;
  price: { value: string; decimals: number; currency: string };
  listing: OpenSeaListing;
  source: "opensea" | "grails";
}

const OPENSEA_COLLECTION_SLUG = "ens";

/// Direct per-NFT lookup (GET /listings/collection/{slug}/nfts/{identifier}/best) — used
/// by the OpenSea by-name search route (app/api/ensv1/listings, which already knows the
/// candidate token id for a typed name — see candidateTokenIds). Also authoritative in a
/// way the bulk /all feed isn't: OpenSea's own docs describe this as the listing actually
/// usable for fulfillment, whereas /all has been observed returning a listing still
/// marked "ACTIVE" that this endpoint no longer considers fulfillable (e.g. the offerer's
/// approval/balance state changed) — so this doubles as a stronger existence check, not
/// just a faster one.
export async function fetchOpenSeaBestListingForToken(apiKey: string, tokenIdDecimal: string): Promise<OpenSeaListing | null> {
  const res = await fetch(
    `https://api.opensea.io/api/v2/listings/collection/${OPENSEA_COLLECTION_SLUG}/nfts/${tokenIdDecimal}/best`,
    { headers: { accept: "application/json", "x-api-key": apiKey } },
  );
  if (res.status === 404) return null;
  const json = await res.json();
  if (json.errors || json.status !== "ACTIVE") return null;
  return json as OpenSeaListing;
}
