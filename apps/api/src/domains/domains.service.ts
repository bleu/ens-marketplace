import { Injectable } from "@nestjs/common";
import { IndexerGraphqlService } from "../indexer-graphql/indexer-graphql.service";
import { formatActivity, type ActivityItem } from "./activity-format";

const PAGE_SIZE = 50;
/// Matches CanonicalIdOrderManager.sol's Status enum (see apps/indexer/src/handlers/OrderManager.ts).
const LISTABLE_STATUSES = [1, 2]; // Active, Suspended

export interface DomainOrderRow {
  seller: string;
  // Raw wei as a decimal string (Hasura's `numeric` scalar) — callers BigInt()-parse it,
  // same convention as apps/api's Grails GrailsListing.priceWei.
  price: string;
  pinnedHash: string;
  status: number;
}

export interface DomainSearchRow {
  canonicalId: string;
  order: DomainOrderRow;
  name: string | null;
}

export interface DomainSearchResult {
  rows: DomainSearchRow[];
  total: number;
  totalPages: number;
}

export interface LastSale {
  price: string;
  at: number;
}

export interface OwnedName {
  canonicalId: string;
  name: string;
}

interface DomainOrderGqlRow {
  id: string;
  seller: string;
  price: string;
  pinnedHash: string;
  status: number;
}

@Injectable()
export class DomainsService {
  constructor(private readonly indexer: IndexerGraphqlService) {}

  /// Replaces useKnownDomainIds (Listed-event history) + the per-visit orders()/nameOf()
  /// multicall — every DomainOrder row already implies "has been Listed at least once",
  /// same set of names domains/page.tsx has ever shown.
  async search(tab: "names" | "listings", page: number): Promise<DomainSearchResult> {
    const where = tab === "listings" ? { status: { _in: LISTABLE_STATUSES } } : {};

    const data = await this.indexer.request<{
      DomainOrder: DomainOrderGqlRow[];
      DomainOrder_aggregate: { aggregate: { count: number } };
    }>(
      `query DomainSearch($where: DomainOrder_bool_exp, $limit: Int!, $offset: Int!) {
        DomainOrder(where: $where, order_by: { updatedAt: desc }, limit: $limit, offset: $offset) {
          id seller price pinnedHash status
        }
        DomainOrder_aggregate(where: $where) {
          aggregate { count }
        }
      }`,
      { where, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    );

    const ids = data.DomainOrder.map((o) => o.id);
    const names = ids.length > 0 ? await this.namesByIds(ids) : new Map<string, string>();

    const total = data.DomainOrder_aggregate.aggregate.count;
    return {
      rows: data.DomainOrder.map((o) => ({
        canonicalId: o.id,
        order: { seller: o.seller, price: o.price, pinnedHash: o.pinnedHash, status: o.status },
        name: names.get(o.id) ?? null,
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

  /// Replaces useNameActivity's per-item live event scan.
  async activity(canonicalId: string): Promise<ActivityItem[]> {
    const data = await this.indexer.request<{
      DomainActivity: { eventName: string; argsJson: string; occurredAt: string; txHash: string }[];
    }>(
      `query Activity($canonicalId: String!) {
        DomainActivity(where: { canonicalId: { _eq: $canonicalId } }, order_by: { occurredAt: desc }) {
          eventName argsJson occurredAt txHash
        }
      }`,
      { canonicalId },
    );
    return data.DomainActivity.map(formatActivity);
  }

  /// Replaces useLastSale's per-item Filled/Refilled scan.
  async lastSale(canonicalId: string): Promise<LastSale | null> {
    const data = await this.indexer.request<{
      DomainActivity: { argsJson: string; occurredAt: string }[];
    }>(
      `query LastSale($canonicalId: String!) {
        DomainActivity(
          where: { canonicalId: { _eq: $canonicalId }, eventName: { _in: ["Filled", "Refilled"] } }
          order_by: { occurredAt: desc }
          limit: 1
        ) {
          argsJson
          occurredAt
        }
      }`,
      { canonicalId },
    );
    const row = data.DomainActivity[0];
    if (!row) return null;
    const args = JSON.parse(row.argsJson) as { price: string };
    return { price: args.price, at: Number(row.occurredAt) };
  }

  /// Replaces useOwnedNames' full Registered+OwnerChanged history reduction — IndexedName
  /// already tracks current owner directly, so this is a straight current-state query.
  async owned(address: string): Promise<OwnedName[]> {
    const data = await this.indexer.request<{ IndexedName: { id: string; name: string }[] }>(
      `query Owned($address: String!) {
        IndexedName(where: { owner: { _ilike: $address } }) { id name }
      }`,
      { address },
    );
    return data.IndexedName.map((n) => ({ canonicalId: n.id, name: n.name }));
  }
}
