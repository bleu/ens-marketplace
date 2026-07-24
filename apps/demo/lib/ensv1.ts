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

export function ensAppUrl(name: string): string {
  return `https://app.ens.domains/${name}`;
}

export function openseaAssetUrl(contract: `0x${string}`, identifier: string): string {
  return `https://opensea.io/assets/ethereum/${contract}/${identifier}`;
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

async function querySubgraph<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(subgraphEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Subgraph request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Subgraph query error: ${JSON.stringify(json.errors)}`);
  return json.data as T;
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
  name: string;
  price: { value: string; decimals: number; currency: string };
  listing: OpenSeaListing;
}
