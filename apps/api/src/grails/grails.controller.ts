import { Controller, Get, Query } from "@nestjs/common";
import { GrailsService, type SortKey } from "./grails.service";

/// Everything arrives as a string (or absent). Taken as one `@Query()` object rather than
/// a dozen positional `@Query("name")` params — the list grew past the point where
/// positional arguments were readable, and it lets the spec call this directly.
export interface GrailsSearchQuery {
  page?: string;
  minPrice?: string;
  maxPrice?: string;
  minLength?: string;
  maxLength?: string;
  startsWith?: string;
  endsWith?: string;
  lengths?: string;
  lengthAtLeast?: string;
  sort?: string;
  q?: string;
  includeOutliers?: string;
}

const SORT_KEYS: readonly SortKey[] = ["price-asc", "price-desc", "length-asc", "name-asc", "recent"];

/// An unrecognised sort falls back to the default rather than erroring — a stale
/// bookmarked URL naming a sort we've since renamed should still show listings.
function toSortKey(value: string | undefined): SortKey | undefined {
  return SORT_KEYS.find((key) => key === value);
}

function toPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/// Comma-separated, and anything unparsable is dropped rather than becoming a NaN that
/// would silently match nothing.
function toIntList(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const parsed = value.split(",").map(toPositiveInt).filter((n): n is number => n !== undefined);
  return parsed.length > 0 ? parsed : undefined;
}

@Controller("grails")
export class GrailsController {
  constructor(private readonly grails: GrailsService) {}

  /// GET /grails/search?page=&q=&lengths=3,4&lengthAtLeast=6&sort=price-asc&includeOutliers=
  ///   &minPrice=&maxPrice=&minLength=&maxLength=&startsWith=&endsWith=
  @Get("search")
  async search(@Query() query: GrailsSearchQuery) {
    return this.grails.search(
      {
        minPriceEth: query.minPrice,
        maxPriceEth: query.maxPrice,
        minLength: toPositiveInt(query.minLength),
        maxLength: toPositiveInt(query.maxLength),
        startsWith: query.startsWith,
        endsWith: query.endsWith,
        lengths: toIntList(query.lengths),
        lengthAtLeast: toPositiveInt(query.lengthAtLeast),
        sort: toSortKey(query.sort),
        query: query.q,
        // Compared against "true", not just checked for presence — the client omits the
        // param when the band is on, but a URL carrying `includeOutliers=false` must not
        // read as "include them".
        includeOutliers: query.includeOutliers === "true",
      },
      toPositiveInt(query.page) ?? 1,
    );
  }

  /// GET /grails/by-name?name=alice.eth — replaces Grails' fuzzy q= search with an exact,
  /// case-insensitive match (apps/web's current route already re-filters q= results down
  /// to an exact match itself, so this is a straight port of that same intent).
  @Get("by-name")
  async byName(@Query("name") name: string) {
    const listing = name ? await this.grails.findByName(name) : null;
    return { listing };
  }
}
