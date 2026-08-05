import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { parseEther } from "viem";
import { PrismaService } from "../prisma/prisma.service";
import { GrailsService } from "./grails.service";
import { GrailsController } from "./grails.controller";

/// Asserts the controller's query-string handling by its effect on the results, against
/// the real service and a real database — not by inspecting the SearchFilters object it
/// builds. Every param here arrives as a string off the wire, and the mistakes worth
/// catching (a CSV left unsplit, "false" read as truthy) are exactly the ones a
/// shape-assertion on a mocked service would wave through.

const prisma = new PrismaService();
const controller = new GrailsController(new GrailsService(prisma));

let nextOrderHash = 1;

async function seed(names: { name: string; priceEth?: string }[]) {
  await prisma.grailsListing.createMany({
    data: names.map(({ name, priceEth }) => ({
      orderHash: `0x${String(nextOrderHash++).padStart(64, "0")}`,
      name,
      nameLength: name.replace(/\.eth$/i, "").length,
      tokenId: String(nextOrderHash),
      priceWei: new Prisma.Decimal(parseEther(priceEth ?? "1").toString()),
      priceCurrency: "0x0000000000000000000000000000000000000000",
      protocolAddress: "",
      protocolData: { parameters: { offerer: "0x", offer: [] }, signature: "0x" },
      sellerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: "active",
    })),
  });
}

beforeEach(async () => {
  await prisma.grailsListing.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GrailsController.search query params", () => {
  it("reads the length chips from a comma-separated list", async () => {
    await seed([{ name: "abc.eth" }, { name: "abcd.eth" }, { name: "abcde.eth" }]);

    const result = await controller.search({ lengths: "3,4" });

    expect(result.listings.map((l) => l.name).sort()).toEqual(["abc.eth", "abcd.eth"]);
  });

  it("applies sort, the open-ended chip and the text query from the query string", async () => {
    await seed([
      { name: "cryptopunk.eth", priceEth: "0.5" },
      { name: "punkzzzz.eth", priceEth: "5" },
      { name: "unrelated.eth", priceEth: "2" },
    ]);

    const result = await controller.search({ q: "punk", lengthAtLeast: "6", sort: "price-desc" });

    expect(result.listings.map((l) => l.name)).toEqual(["punkzzzz.eth", "cryptopunk.eth"]);
  });

  it("keeps the sanity band on unless includeOutliers is exactly true", async () => {
    await seed([{ name: "dust.eth", priceEth: "0.0001" }, { name: "normal.eth", priceEth: "1" }]);

    const banded = await controller.search({ includeOutliers: "false" });
    expect(banded.listings.map((l) => l.name)).toEqual(["normal.eth"]);

    const unbanded = await controller.search({ includeOutliers: "true" });
    expect(unbanded.listings.map((l) => l.name)).toEqual(["dust.eth", "normal.eth"]);
  });

  it("falls back to the default sort and page for junk values", async () => {
    await seed([{ name: "cheap.eth", priceEth: "0.5" }, { name: "pricey.eth", priceEth: "5" }]);

    const result = await controller.search({ sort: "by-vibes", page: "-3", lengths: "abc" });

    expect(result.listings.map((l) => l.name)).toEqual(["cheap.eth", "pricey.eth"]);
  });
});
