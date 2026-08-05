import { parseEther } from "viem";

/// The query params apps/web sends when browsing listings, in the vocabulary Grails' own
/// API used — kept because apps/web sends one set of params to both sources.
export interface SearchFilters {
  minPriceEth?: string;
  maxPriceEth?: string;
  minLength?: number;
  maxLength?: number;
  startsWith?: string;
  endsWith?: string;
}

/// Structurally compatible with both GrailsListingWhereInput and FarolListingWhereInput —
/// the two tables carry the same columns for everything filterable here.
export interface ListingFilterWhere {
  priceWei?: { gte?: string; lte?: string };
  nameLength?: { gte?: number; lte?: number };
  name?: { startsWith?: string; endsWith?: string; mode?: "insensitive" };
}

/// One filter translation for both listing tables, so Farol rows can't answer the same
/// query differently from Grails rows in a grid that mixes them.
export function listingFilterWhere(filters: SearchFilters): ListingFilterWhere {
  const where: ListingFilterWhere = {};

  // Unparsable ETH values drop the filter instead of erroring, matching what Grails' own
  // API did with junk input. Compared as strings, not bigint: priceWei is a Decimal column
  // and Prisma's DecimalFilter takes string | number | Decimal.
  const priceRange: { gte?: string; lte?: string } = {};
  if (filters.minPriceEth) {
    try {
      priceRange.gte = parseEther(filters.minPriceEth).toString();
    } catch {
      /* invalid input, omit the filter */
    }
  }
  if (filters.maxPriceEth) {
    try {
      priceRange.lte = parseEther(filters.maxPriceEth).toString();
    } catch {
      /* invalid input, omit the filter */
    }
  }
  if (Object.keys(priceRange).length > 0) where.priceWei = priceRange;

  if (filters.minLength !== undefined || filters.maxLength !== undefined) {
    where.nameLength = { gte: filters.minLength, lte: filters.maxLength };
  }

  // A single StringFilter carries both bounds at once — Prisma ANDs them into one clause.
  if (filters.startsWith || filters.endsWith) {
    where.name = {
      ...(filters.startsWith ? { startsWith: filters.startsWith } : {}),
      ...(filters.endsWith ? { endsWith: filters.endsWith } : {}),
      mode: "insensitive",
    };
  }

  return where;
}
