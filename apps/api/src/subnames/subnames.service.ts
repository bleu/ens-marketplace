import { Injectable } from "@nestjs/common";
import { IndexerGraphqlService } from "../indexer-graphql/indexer-graphql.service";

const PAGE_SIZE = 50;

export interface SubnameListingRow {
  parentAddress: string;
  pricePerTerm: string;
  termSeconds: string;
  active: boolean;
}

export interface SubnameSearchRow {
  canonicalId: string;
  listing: SubnameListingRow;
  tenant: string | null;
  leaseActiveUntil: string | null;
  name: string | null;
}

export interface SubnameSearchResult {
  rows: SubnameSearchRow[];
  total: number;
  totalPages: number;
}

interface SubnameListingGqlRow {
  id: string;
  parentAddress: string;
  pricePerTerm: string;
  termSeconds: string;
  active: boolean;
  tenant: string | null;
  leaseActiveUntil: string | null;
}

@Injectable()
export class SubnamesService {
  constructor(private readonly indexer: IndexerGraphqlService) {}

  /// Replaces useKnownSubnameIds (Announced-event history) + the per-visit
  /// listings()/leaseActiveUntil()/tenantOf()/nameOf() multicall — subnames/page.tsx only
  /// ever shows currently-active listings, so this filters server-side the same way the
  /// frontend's own `.filter(r => r.listing[3])` did client-side.
  async search(page: number): Promise<SubnameSearchResult> {
    const where = { active: { _eq: true } };

    const data = await this.indexer.request<{
      SubnameListing: SubnameListingGqlRow[];
      SubnameListing_aggregate: { aggregate: { count: number } };
    }>(
      `query SubnameSearch($where: SubnameListing_bool_exp, $limit: Int!, $offset: Int!) {
        SubnameListing(where: $where, order_by: { updatedAt: desc }, limit: $limit, offset: $offset) {
          id parentAddress pricePerTerm termSeconds active tenant leaseActiveUntil
        }
        SubnameListing_aggregate(where: $where) {
          aggregate { count }
        }
      }`,
      { where, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    );

    const ids = data.SubnameListing.map((s) => s.id);
    const names = ids.length > 0 ? await this.namesByIds(ids) : new Map<string, string>();

    const total = data.SubnameListing_aggregate.aggregate.count;
    return {
      rows: data.SubnameListing.map((s) => ({
        canonicalId: s.id,
        listing: { parentAddress: s.parentAddress, pricePerTerm: s.pricePerTerm, termSeconds: s.termSeconds, active: s.active },
        tenant: s.tenant,
        leaseActiveUntil: s.leaseActiveUntil,
        name: names.get(s.id) ?? null,
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  private async namesByIds(ids: string[]): Promise<Map<string, string>> {
    const data = await this.indexer.request<{ IndexedName: { id: string; name: string }[] }>(
      `query NamesByIds($ids: [String!]) {
        IndexedName(where: { id: { _in: $ids } }) { id name }
      }`,
      { ids },
    );
    return new Map(data.IndexedName.map((n) => [n.id, n.name]));
  }

  /// Replaces useSubnameCount — this counts registry-level subname registrations
  /// (Registry.SubnameRegistered → IndexedName.parentId), a different concept from
  /// SubnameListing's lease-vault "parent" (see apps/indexer/schema.graphql's comment on
  /// SubnameListing.parentAddress) — so this queries IndexedName, not SubnameListing.
  async countByParent(parentId: string): Promise<number> {
    const data = await this.indexer.request<{ IndexedName_aggregate: { aggregate: { count: number } } }>(
      `query CountByParent($parentId: String!) {
        IndexedName_aggregate(where: { parentId: { _eq: $parentId } }) {
          aggregate { count }
        }
      }`,
      { parentId },
    );
    return data.IndexedName_aggregate.aggregate.count;
  }
}
