import { Injectable } from "@nestjs/common";
import { parseEther } from "viem";
import { PrismaService } from "../prisma/prisma.service";
import { currencySymbolFor, SEAPORT_CONTRACT_ADDRESS, type EnsV1Listing } from "./ensv1-types";
import type { GrailsListing, Prisma } from "@prisma/client";

export type SortKey = "price-asc" | "price-desc" | "length-asc" | "name-asc" | "recent";

export interface SearchFilters {
  minPriceEth?: string;
  maxPriceEth?: string;
  /// The sidebar's length chips. Multiple selections are OR'd (a name matching any of
  /// them qualifies); the group as a whole is AND'd with every other filter. Distinct from
  /// minLength/maxLength, which stay behind the Advanced disclosure as a free range.
  lengths?: number[];
  /// The one open-ended chip ("6+"), OR'd into the same group as `lengths`.
  lengthAtLeast?: number;
  minLength?: number;
  maxLength?: number;
  startsWith?: string;
  endsWith?: string;
  sort?: SortKey;
  /// Turns the price sanity band off (see SANITY_FLOOR_WEI) — the sidebar's visible
  /// "show everything" toggle.
  includeOutliers?: boolean;
  /// Free-text fuzzy name search (the sidebar's single search box). Typo-tolerant and
  /// matches anywhere in the name — see fuzzyCandidateNames.
  query?: string;
}

/// One entry per length chip in the sidebar, always all four, always present even at zero.
/// Keyed by the chip's own label rather than a number so the open-ended "6+" bucket needs
/// no special case at the call site.
export type LengthCounts = Record<"3" | "4" | "5" | "6+", number>;

export interface SearchResult {
  listings: EnsV1Listing[];
  unresolvedCount: number;
  next: number | null;
  total: number;
  totalPages: number;
  /// How many listings each length chip would match given every *other* active filter —
  /// so a chip can show its count (and read as empty) before it's clicked.
  lengthCounts: LengthCounts;
}

const PAGE_SIZE = 50;

/// Both tails of the real price distribution are noise: sub-dust listings nobody means,
/// and absurd ones like the ~1.2e26 wei row in docs/grails-migration.md. The band hides
/// them by default and `includeOutliers` turns it off — nothing is dropped at scrape time,
/// so this is purely what the feed shows.
///
/// TODO(explore-filters): provisional values, picked as round numbers rather than measured
/// — they want revisiting against the real price distribution. See docs/explore-filters.md.
const SANITY_FLOOR_WEI = parseEther("0.001").toString();
const SANITY_CEILING_WEI = parseEther("10000").toString();

/// Where the sidebar's last chip stops being an exact length and becomes "or longer".
const OPEN_ENDED_CHIP_FROM = 6;

/// The length chip group as one OR'd clause, or null when no chip is selected. Kept out of
/// the main `where` so the chip counts can be computed without it — see search().
function lengthChipGroup(filters: SearchFilters): Prisma.GrailsListingWhereInput | null {
  const chips: Prisma.GrailsListingWhereInput[] = [];
  if (filters.lengths?.length) chips.push({ nameLength: { in: filters.lengths } });
  if (filters.lengthAtLeast !== undefined) chips.push({ nameLength: { gte: filters.lengthAtLeast } });
  return chips.length > 0 ? { OR: chips } : null;
}

type WeiBound = Prisma.DecimalFilter["gte"];

/// The explicit min/max price filters merged with the sanity band. Invalid/unparsable ETH
/// values are dropped rather than thrown, matching what apps/web's route did when it
/// forwarded these straight to Grails. Bounds are strings, not bigints — priceWei is a
/// Decimal column (see schema.prisma) and Prisma's DecimalFilter takes string|number|Decimal.
function priceRangeFilter(filters: SearchFilters): Prisma.DecimalFilter | undefined {
  const range: Prisma.DecimalFilter = {};
  if (filters.minPriceEth) {
    try {
      range.gte = parseEther(filters.minPriceEth).toString();
    } catch {
      /* invalid input, omit the bound */
    }
  }
  if (filters.maxPriceEth) {
    try {
      range.lte = parseEther(filters.maxPriceEth).toString();
    } catch {
      /* invalid input, omit the bound */
    }
  }
  // The band and an explicit price filter both land on the same column, and a DecimalFilter
  // has only one gte/lte slot each — so they're merged by taking whichever bound is tighter
  // rather than one silently overwriting the other. Plain BigInt comparison is safe here:
  // every value involved is an integer wei string.
  if (!filters.includeOutliers) {
    range.gte = maxWei(range.gte, SANITY_FLOOR_WEI);
    range.lte = minWei(range.lte, SANITY_CEILING_WEI);
  }
  return Object.keys(range).length > 0 ? range : undefined;
}

function maxWei(a: WeiBound, b: string): string {
  return a === undefined ? b : BigInt(String(a)) > BigInt(b) ? String(a) : b;
}

function minWei(a: WeiBound, b: string): string {
  return a === undefined ? b : BigInt(String(a)) < BigInt(b) ? String(a) : b;
}

const ORDER_BY: Record<SortKey, Prisma.GrailsListingOrderByWithRelationInput> = {
  "price-asc": { priceWei: "asc" },
  "price-desc": { priceWei: "desc" },
  "length-asc": { nameLength: "asc" },
  "name-asc": { name: "asc" },
  // scrapedAt, not a real listing date — Grails' API doesn't surface when a listing was
  // created, so "recently listed" is really "most recently seen by our scraper". Close
  // enough while the scrape runs on a schedule, and it's the only ordering available.
  recent: { scrapedAt: "desc" },
};

/// word_similarity, not similarity. `similarity` compares the query against the whole
/// name, so the unmatched remainder plus the ".eth" every name carries dilutes the score
/// past usefulness for anything but a near-complete name: "punk" scores 0.18 against
/// "cryptopunk.eth", under even the default 0.3 cutoff. word_similarity scores the best
/// matching extent *inside* the name instead (0.60 for that same pair), which is what a
/// single search box replacing starts-with/ends-with/contains has to do.
const WORD_SIMILARITY_THRESHOLD = 0.45;

/// Caps how many names one text query can pull through the two-step below. Deliberately a
/// round number well above one page: it bounds the `IN (...)` list, and the tail past it is
/// so weakly similar that nobody is scrolling to page 11 of a typo'd search to find it.
/// A query matching more than this many names silently loses the least-similar remainder —
/// which is why `total` for a text query is a count of candidates, not of the whole table.
const FUZZY_CANDIDATE_LIMIT = 500;

function toEnsV1Listing(row: GrailsListing): EnsV1Listing {
  // .toFixed(0), not .toString() — guarantees a plain integer digit string regardless of
  // Decimal.js's exponential-notation thresholds, which matters for genuinely large wei
  // amounts (real listings have already been seen well above what a bigint could hold).
  const priceValue = row.priceWei.toFixed(0);
  const currency = currencySymbolFor(row.priceCurrency);
  const protocolData = row.protocolData as { parameters: EnsV1Listing["listing"]["protocol_data"]["parameters"]; signature: string };
  return {
    name: row.name,
    price: { value: priceValue, decimals: 18, currency },
    listing: {
      order_hash: row.orderHash,
      protocol_address: row.protocolAddress || SEAPORT_CONTRACT_ADDRESS,
      protocol_data: protocolData,
      price: { current: { value: priceValue, decimals: 18, currency } },
    },
    source: "grails",
  };
}

/// Query semantics deliberately match apps/web's current live-Grails-API route exactly
/// (same filter params, same page size, same response shape) — the whole point of this
/// service is that apps/web's frontend code needs zero changes when its API route
/// switches from calling Grails directly to calling this service instead.
@Injectable()
export class GrailsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Prisma has no similarity operator, so fuzzy search is two steps rather than a rewrite
  /// of the whole filter builder into raw SQL: rank candidate names in raw SQL here, then
  /// feed them back into the typed `where` as a plain `name: { in: [...] }`.
  ///
  /// `SET LOCAL` inside a transaction, not a bare SET — the threshold has to be in effect
  /// on the same connection as the query for the `<%` operator to use it, and LOCAL scopes
  /// it to this transaction so it can't leak into whatever the pool hands out next. The
  /// operator is what lets the GIN trigram index serve this (see the pg_trgm migration);
  /// the ORDER BY recomputes the score for ranking.
  private async fuzzyCandidateNames(query: string): Promise<string[]> {
    const [, rows] = await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIMILARITY_THRESHOLD}`),
      this.prisma.$queryRaw<{ name: string }[]>`
        SELECT "name" FROM "GrailsListing"
        WHERE ${query} <% "name"
        ORDER BY word_similarity(${query}, "name") DESC, "name" ASC
        LIMIT ${FUZZY_CANDIDATE_LIMIT}
      `,
    ]);
    return rows.map((row) => row.name);
  }

  async search(filters: SearchFilters, page: number): Promise<SearchResult> {
    const where: Prisma.GrailsListingWhereInput = {};

    const priceRange = priceRangeFilter(filters);
    if (priceRange) where.priceWei = priceRange;

    // Advanced's free range lands on `nameLength` directly (ANDed, as one filter object
    // with both bounds), while the chip group becomes an OR — so the two can't share a
    // single filter and the chips go into `AND` alongside it instead.
    const lengthRange: Prisma.IntFilter = {};
    if (filters.minLength !== undefined) lengthRange.gte = filters.minLength;
    if (filters.maxLength !== undefined) lengthRange.lte = filters.maxLength;
    if (Object.keys(lengthRange).length > 0) where.nameLength = lengthRange;

    // A single StringFilter can carry startsWith, endsWith and the fuzzy candidate list at
    // once — Prisma ANDs them together into one WHERE clause. Anchored prefix/suffix live
    // behind Advanced and the search box is its own thing, but nothing stops a shared URL
    // carrying both, so they narrow each other rather than one overwriting the other.
    const nameFilter: Prisma.StringFilter = {};
    if (filters.startsWith) nameFilter.startsWith = filters.startsWith;
    if (filters.endsWith) nameFilter.endsWith = filters.endsWith;
    if (filters.query) nameFilter.in = await this.fuzzyCandidateNames(filters.query);
    if (Object.keys(nameFilter).length > 0) where.name = { ...nameFilter, mode: "insensitive" };

    // `where` is everything *except* the length chips, and stays that way — the chip
    // counts are computed against it so each chip reports what selecting it would give,
    // not what it gives on top of the chips already selected. The chips themselves are
    // ANDed on separately for the feed query below.
    const chipGroup = lengthChipGroup(filters);
    const feedWhere: Prisma.GrailsListingWhereInput = chipGroup ? { ...where, AND: [chipGroup] } : where;

    const [rows, total, lengthCounts] = await Promise.all([
      this.prisma.grailsListing.findMany({
        where: feedWhere,
        orderBy: ORDER_BY[filters.sort ?? "price-asc"],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.grailsListing.count({ where: feedWhere }),
      this.countLengthChips(where),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return {
      listings: rows.map(toEnsV1Listing),
      // Every row is already a validated, fulfillable listing (validation happens at
      // scrape time — see ScraperService) — nothing here is ever dropped post-query.
      unresolvedCount: 0,
      next: page < totalPages ? page + 1 : null,
      total,
      totalPages,
      lengthCounts,
    };
  }

  private async countLengthChips(where: Prisma.GrailsListingWhereInput): Promise<LengthCounts> {
    const grouped = await this.prisma.grailsListing.groupBy({
      by: ["nameLength"],
      where,
      _count: { _all: true },
    });

    // Every chip is present in the result even at zero — a chip that vanished when its
    // count hit zero would make the group's width jump around as filters change.
    const counts: LengthCounts = { "3": 0, "4": 0, "5": 0, "6+": 0 };
    for (const row of grouped) {
      const key = row.nameLength >= OPEN_ENDED_CHIP_FROM ? "6+" : (String(row.nameLength) as keyof LengthCounts);
      if (key in counts) counts[key] += row._count._all;
    }
    return counts;
  }

  async findByName(name: string): Promise<EnsV1Listing | null> {
    const row = await this.prisma.grailsListing.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      orderBy: { scrapedAt: "desc" },
    });
    return row ? toEnsV1Listing(row) : null;
  }
}
