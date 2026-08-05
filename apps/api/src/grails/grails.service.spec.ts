import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { GrailsService } from "./grails.service";

/// Runs against a real Postgres (see test/postgres-harness.ts for why, and for how the
/// database is provided).

const prisma = new PrismaService();
const service = new GrailsService(prisma);

let nextOrderHash = 1;

interface Fixture {
  name: string;
  priceEth?: string;
  priceWei?: string;
  scrapedAt?: Date;
}

async function seed(fixtures: Fixture[]) {
  await prisma.grailsListing.createMany({
    data: fixtures.map((fixture) => ({
      orderHash: `0x${String(nextOrderHash++).padStart(64, "0")}`,
      name: fixture.name,
      nameLength: fixture.name.replace(/\.eth$/i, "").length,
      tokenId: String(nextOrderHash),
      priceWei: new Prisma.Decimal(fixture.priceWei ?? parseEther(fixture.priceEth ?? "1").toString()),
      priceCurrency: "0x0000000000000000000000000000000000000000",
      protocolAddress: "",
      protocolData: {
        parameters: { offerer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", offer: [] },
        signature: "0xdeadbeef",
      },
      sellerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "active",
      ...(fixture.scrapedAt ? { scrapedAt: fixture.scrapedAt } : {}),
    })),
  });
}

beforeEach(async () => {
  await prisma.grailsListing.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GrailsService.search sorting", () => {
  it("puts the cheapest listing first by default", async () => {
    await seed([{ name: "cheap.eth", priceEth: "0.5" }, { name: "middling.eth", priceEth: "2" }, { name: "pricey.eth", priceEth: "5" }]);

    const result = await service.search({}, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["cheap.eth", "middling.eth", "pricey.eth"]);
  });

  it("puts the most expensive listing first for price-desc", async () => {
    await seed([{ name: "cheap.eth", priceEth: "0.5" }, { name: "middling.eth", priceEth: "2" }, { name: "pricey.eth", priceEth: "5" }]);

    const result = await service.search({ sort: "price-desc" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["pricey.eth", "middling.eth", "cheap.eth"]);
  });

  // Prices deliberately run opposite to label length here, so a query that ignored `sort`
  // and fell back to the price-asc default couldn't pass by coincidence.
  it("puts the shortest label first for length-asc", async () => {
    await seed([{ name: "sevenxx.eth", priceEth: "0.5" }, { name: "four.eth", priceEth: "2" }, { name: "abc.eth", priceEth: "5" }]);

    const result = await service.search({ sort: "length-asc" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["abc.eth", "four.eth", "sevenxx.eth"]);
  });

  it("orders alphabetically for name-asc", async () => {
    await seed([{ name: "zebra.eth", priceEth: "0.5" }, { name: "apple.eth", priceEth: "5" }, { name: "mango.eth", priceEth: "2" }]);

    const result = await service.search({ sort: "name-asc" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["apple.eth", "mango.eth", "zebra.eth"]);
  });

  it("puts the most recently scraped listing first for recent", async () => {
    await seed([
      { name: "oldest.eth", priceEth: "0.5", scrapedAt: new Date("2026-01-01T00:00:00Z") },
      { name: "newest.eth", priceEth: "5", scrapedAt: new Date("2026-03-01T00:00:00Z") },
      { name: "middle.eth", priceEth: "2", scrapedAt: new Date("2026-02-01T00:00:00Z") },
    ]);

    const result = await service.search({ sort: "recent" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["newest.eth", "middle.eth", "oldest.eth"]);
  });
});

describe("GrailsService.search length chips", () => {
  it("returns every selected length and nothing else", async () => {
    await seed([{ name: "abc.eth" }, { name: "abcd.eth" }, { name: "abcde.eth" }, { name: "abcdef.eth" }]);

    const result = await service.search({ lengths: [3, 4] }, 1);

    expect(result.listings.map((l) => l.name).sort()).toEqual(["abc.eth", "abcd.eth"]);
  });

  // The sidebar's last chip is open-ended ("6+"), so the group can't collapse to a single
  // `in` list — selecting it alongside exact-length chips has to widen the result, not
  // narrow it.
  it("ORs the open-ended chip with the exact-length chips", async () => {
    await seed([{ name: "abc.eth" }, { name: "abcd.eth" }, { name: "abcde.eth" }, { name: "abcdef.eth" }, { name: "abcdefgh.eth" }]);

    const result = await service.search({ lengths: [3, 4], lengthAtLeast: 6 }, 1);

    expect(result.listings.map((l) => l.name).sort()).toEqual(["abc.eth", "abcd.eth", "abcdef.eth", "abcdefgh.eth"]);
  });

  it("narrows, not widens, when a price ceiling is combined with a length chip", async () => {
    await seed([
      { name: "abc.eth", priceEth: "0.5" },
      { name: "xyz.eth", priceEth: "5" },
      { name: "abcde.eth", priceEth: "0.5" },
    ]);

    const result = await service.search({ lengths: [3], maxPriceEth: "1" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["abc.eth"]);
  });
});

/// The absurd fixture below is the real row documented in docs/grails-migration.md — the
/// ~1.2e26 wei (about 120 million ETH) listing that overflowed a Postgres bigint during
/// the first scrape. Nothing is dropped at scrape time; this band is display-only.
const ABSURD_PRICE_WEI = "120000000000000000000000000";

describe("GrailsService.search price sanity band", () => {
  it("hides dust and absurd listings by default", async () => {
    await seed([
      { name: "dust.eth", priceEth: "0.0001" },
      { name: "normal.eth", priceEth: "1" },
      { name: "absurd.eth", priceWei: ABSURD_PRICE_WEI },
    ]);

    const result = await service.search({}, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["normal.eth"]);
  });

  it("shows both tails again when outliers are included", async () => {
    await seed([
      { name: "dust.eth", priceEth: "0.0001" },
      { name: "normal.eth", priceEth: "1" },
      { name: "absurd.eth", priceWei: ABSURD_PRICE_WEI },
    ]);

    const result = await service.search({ includeOutliers: true }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["dust.eth", "normal.eth", "absurd.eth"]);
  });

  // The band is a bound on what the feed shows, not a competing filter — an explicit
  // ceiling inside the band still applies, and one outside it doesn't widen past it.
  it("keeps whichever price bound is tighter when the band and an explicit filter disagree", async () => {
    await seed([
      { name: "cheap.eth", priceEth: "0.5" },
      { name: "pricey.eth", priceEth: "50" },
      { name: "absurd.eth", priceWei: ABSURD_PRICE_WEI },
    ]);

    const withinBand = await service.search({ maxPriceEth: "1" }, 1);
    expect(withinBand.listings.map((l) => l.name)).toEqual(["cheap.eth"]);

    const beyondBand = await service.search({ maxPriceEth: "999999999" }, 1);
    expect(beyondBand.listings.map((l) => l.name)).toEqual(["cheap.eth", "pricey.eth"]);
  });
});

describe("GrailsService.search fuzzy name query", () => {
  it("finds a name despite a typo in the query", async () => {
    await seed([{ name: "vitalik.eth" }, { name: "unrelated.eth" }]);

    const result = await service.search({ query: "vitalikk" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["vitalik.eth"]);
  });

  // The whole reason the sidebar can drop separate starts-with / ends-with / contains
  // inputs for one box: a query buried in the middle of a name still matches.
  it("matches a query in the middle of a name, not just at the start", async () => {
    await seed([{ name: "cryptopunk.eth" }, { name: "unrelated.eth" }]);

    const result = await service.search({ query: "punk" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["cryptopunk.eth"]);
  });

  it("returns nothing when no name is close to the query", async () => {
    await seed([{ name: "alice.eth" }, { name: "bob.eth" }]);

    const result = await service.search({ query: "zzzqqqx" }, 1);

    expect(result.listings).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("still applies the other filters alongside a text query", async () => {
    await seed([
      { name: "vitalik.eth", priceEth: "0.5" },
      { name: "vitalikk.eth", priceEth: "50" },
    ]);

    const result = await service.search({ query: "vitalik", maxPriceEth: "1" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["vitalik.eth"]);
  });

  // A text query can only reach FUZZY_CANDIDATE_LIMIT names, so a very broad query is
  // truncated. Pinned deliberately: the number the header shows has to be the number the
  // user can actually page through, or "page 12 of 15" dead-ends on an empty table.
  it("caps a very broad query and reports the capped count as the total", async () => {
    await seed(Array.from({ length: 520 }, (_, i) => ({ name: `punk${String(i).padStart(4, "0")}.eth` })));

    const result = await service.search({ query: "punk" }, 1);

    expect(result.total).toBe(500);
    expect(result.totalPages).toBe(10);

    const lastPage = await service.search({ query: "punk" }, 10);
    expect(lastPage.listings).toHaveLength(50);
    expect(lastPage.next).toBeNull();
  });
});

describe("GrailsService.search chip counts", () => {
  // Counting the length group *through* its own selection is the whole point: if picking
  // "3" made every other chip read 0, the counts would be useless for deciding where to
  // go next, and the sidebar would look like a dead end.
  it("counts every length chip regardless of which one is selected", async () => {
    await seed([
      { name: "abc.eth" },
      { name: "xyz.eth" },
      { name: "abcd.eth" },
      { name: "abcde.eth" },
      { name: "abcdef.eth" },
      { name: "abcdefgh.eth" },
    ]);

    const result = await service.search({ lengths: [3] }, 1);

    expect(result.listings).toHaveLength(2);
    expect(result.lengthCounts).toEqual({ "3": 2, "4": 1, "5": 1, "6+": 2 });
  });

  it("reflects the other active filters in the counts", async () => {
    await seed([
      { name: "abc.eth", priceEth: "0.5" },
      { name: "xyz.eth", priceEth: "50" },
      { name: "abcd.eth", priceEth: "0.5" },
    ]);

    const result = await service.search({ maxPriceEth: "1" }, 1);

    expect(result.lengthCounts).toEqual({ "3": 1, "4": 1, "5": 0, "6+": 0 });
  });
});
