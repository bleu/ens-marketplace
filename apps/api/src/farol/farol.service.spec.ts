import { beforeEach, describe, expect, it } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { NAME_WRAPPER_ADDRESS } from "../grails/ensv1-types";
import { FarolService, type CreateListingInput } from "./farol.service";
import { FakeFarolTable, fakeSeaportReads, signedOrder } from "./farol.test-doubles";

/// These specs run against an in-memory stand-in for the FarolListing table and a stubbed
/// viem client, so what they pin down is the service's own logic — which fields it derives
/// from a signed order, and which requests it refuses. The SQL those queries compile to is
/// not exercised here.

/// 2020, in real wall-clock seconds — the expiry filter compares against the actual clock,
/// so a past date is all a spec needs to represent an order that has run out.
const LONG_PAST = 1_600_000_000;
const SELLER = "0x1111111111111111111111111111111111111111";

/// A well-formed POST body for a wrapped name. Overrides carry whatever the test is about.
/// The salt rises per call the way seaport-js randomizes it, so two fixtures are two
/// distinct orders rather than one order hashed twice.
let fixtureCount = 0;
function listingOf(overrides: Partial<CreateListingInput> = {}): CreateListingInput {
  return {
    name: "clock.eth",
    tokenContract: NAME_WRAPPER_ADDRESS,
    tokenId: "42",
    itemType: 3,
    protocolData: signedOrder({ salt: String(++fixtureCount) }),
    ...overrides,
  };
}

let table: FakeFarolTable;
let service: FarolService;

beforeEach(() => {
  table = new FakeFarolTable();
  service = new FarolService(table.asPrisma(), fakeSeaportReads({ orderHash: "0xaabb" }));
});

describe("FarolService.create", () => {
  /// The POST body carries a name and a token, but every economic field — who gets paid,
  /// how much, when the order expires, which counter it was signed under — is read out of
  /// the signed order instead, because those are the only values a buyer's wallet will
  /// actually honour. A body claiming a different price would otherwise produce a row that
  /// advertises one number and charges another.
  it("takes price, seller, counter and validity window from the signed order", async () => {
    await service.create(
      listingOf({
        protocolData: signedOrder({
          offerer: SELLER,
          priceWei: "40000000000000000000",
          counter: "7",
          startTime: 1000,
          endTime: 2000,
        }),
      }),
    );

    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({
      orderHash: "0xaabb",
      sellerAddress: SELLER,
      priceCurrency: "0x0000000000000000000000000000000000000000",
      counter: "7",
      startTime: 1000,
      endTime: 2000,
    });
    expect(String(table.rows[0].priceWei)).toBe("40000000000000000000");
  });

  /// The one thing worth refusing outright. Without it the endpoint is a free write to a
  /// table apps/web renders buy buttons from — any ERC-721 on mainnet could be posted under
  /// a borrowed ENS name, and the listing would look native right up to the point a buyer
  /// paid for the wrong token.
  it("refuses a token that isn't ENS's registrar or wrapper", async () => {
    const boredApe = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";

    await expect(service.create(listingOf({ tokenContract: boredApe, itemType: 2 }))).rejects.toThrow(BadRequestException);

    expect(table.rows).toEqual([]);
  });

  /// Insert-only, never upsert. An order hash is public the moment a listing is, so an
  /// upsert here would let anyone re-POST a real hash with fabricated contents and rewrite
  /// the price of someone else's listing.
  it("refuses a second order carrying an existing order hash, leaving the stored one alone", async () => {
    await service.create(listingOf({ protocolData: signedOrder({ offerer: SELLER, priceWei: "40000000000000000000" }) }));

    await expect(
      service.create(
        listingOf({
          protocolData: signedOrder({ offerer: "0x2222222222222222222222222222222222222222", priceWei: "1" }),
        }),
      ),
    ).rejects.toThrow(ConflictException);

    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({ sellerAddress: SELLER });
    expect(String(table.rows[0].priceWei)).toBe("40000000000000000000");
  });
});

describe("FarolService.findByName", () => {
  /// apps/web's detail page renders whatever comes back here with the same component it
  /// uses for Grails and OpenSea rows, so a Farol listing has to arrive in that same
  /// EnsV1Listing shape — signature included, since unlike OpenSea's browse feed ours is
  /// already submittable.
  it("returns a stored listing in the shape the frontend already renders", async () => {
    await service.create(listingOf({ protocolData: signedOrder({ priceWei: "40000000000000000000" }) }));

    const listing = await service.findByName("clock.eth");

    expect(listing).toMatchObject({
      name: "clock.eth",
      price: { value: "40000000000000000000", decimals: 18, currency: "ETH" },
      source: "farol",
      listing: {
        order_hash: "0xaabb",
        protocol_address: "0x0000000000000068F116a894984e2DB1123eB395",
        protocol_data: { signature: "0xdeadbeef" },
      },
    });
  });

  /// The name arrives from a URL segment the visitor may have typed with capitals, while
  /// stored names are normalized. Grails' equivalent lookup is case-insensitive for the
  /// same reason, and the detail page uses one code path for both sources.
  it("finds a listing for a name typed with different capitalization", async () => {
    await service.create(listingOf());

    expect(await service.findByName("Clock.eth")).not.toBeNull();
  });

  it("has no listing for a name nobody listed", async () => {
    expect(await service.findByName("clock.eth")).toBeNull();
  });

  /// Nothing on-chain happens when an order's endTime passes, so an expired row sits in the
  /// table looking live until the sweep gets to it. Filtering on read is what stops the
  /// detail page offering a Buy button Seaport would reject.
  it("hides a listing whose order has already expired", async () => {
    await service.create(listingOf({ protocolData: signedOrder({ endTime: LONG_PAST }) }));

    expect(await service.findByName("clock.eth")).toBeNull();
  });
});

describe("FarolService.search", () => {
  beforeEach(() => {
    // Each order gets its own hash here, since these specs store several at once.
    service = new FarolService(table.asPrisma(), fakeSeaportReads());
  });

  /// The Explore-style feed. Same envelope GrailsService returns (listings, unresolvedCount,
  /// next, total, totalPages) because apps/web's hook reads both through one code path, and
  /// newest first because a seller's own fresh listing is the one they come back to check.
  it("returns listings newest first, with the same paging envelope Grails returns", async () => {
    await service.create(listingOf({ name: "first.eth" }));
    await service.create(listingOf({ name: "second.eth" }));

    const result = await service.search({}, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["second.eth", "first.eth"]);
    expect(result).toMatchObject({ unresolvedCount: 0, next: null, total: 2, totalPages: 1 });
  });

  /// `total` drives the page count apps/web shows, so it has to be counted under the same
  /// expiry filter as the rows themselves — otherwise the grid advertises pages that come
  /// back empty.
  it("leaves an expired listing out of both the page and the total", async () => {
    await service.create(listingOf({ name: "live.eth" }));
    await service.create(listingOf({ name: "gone.eth", protocolData: signedOrder({ endTime: LONG_PAST, salt: "99" }) }));

    const result = await service.search({}, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["live.eth"]);
    expect(result).toMatchObject({ total: 1, totalPages: 1 });
  });

  /// The filters exist because apps/web's listing hook sends the same query params to Farol
  /// and Grails. Prices arrive as ETH strings from a text input and are compared as wei.
  it("filters by a price range given in ETH", async () => {
    await service.create(listingOf({ name: "cheap.eth", protocolData: signedOrder({ priceWei: "500000000000000000" }) }));
    await service.create(listingOf({ name: "pricey.eth", protocolData: signedOrder({ priceWei: "5000000000000000000" }) }));

    const result = await service.search({ minPriceEth: "1" }, 1);

    expect(result.listings.map((l) => l.name)).toEqual(["pricey.eth"]);
    expect(result.total).toBe(1);
  });
});

describe("FarolService.recheck", () => {
  /// A Seaport cancellation happens on-chain, with nothing to tell us about it. The seller's
  /// browser calls this the moment their cancel transaction confirms, so their listing
  /// disappears immediately instead of lingering until the next sweep.
  it("drops a listing the seller has cancelled on-chain", async () => {
    await service.create(listingOf());

    const result = await new FarolService(
      table.asPrisma(),
      fakeSeaportReads({ orderHash: "0xaabb", orderStatus: { cancelled: true } }),
    ).recheck("0xaabb");

    expect(result).toEqual({ removed: true });
    expect(await service.findByName("clock.eth")).toBeNull();
  });

  /// The same endpoint is unauthenticated, so it has to be safe for anyone to call on
  /// anyone's listing: a live order stays exactly where it is.
  it("keeps a listing whose order is still live", async () => {
    await service.create(listingOf());

    const result = await service.recheck("0xaabb");

    expect(result).toEqual({ removed: false });
    expect(await service.findByName("clock.eth")).not.toBeNull();
  });

  /// Filled orders are the other way a listing stops being real. Seaport reports this as
  /// totalFilled reaching totalSize rather than as a flag.
  it("drops a listing whose order has been filled", async () => {
    await service.create(listingOf());

    const result = await new FarolService(
      table.asPrisma(),
      fakeSeaportReads({ orderHash: "0xaabb", orderStatus: { totalFilled: 1n, totalSize: 1n } }),
    ).recheck("0xaabb");

    expect(result).toEqual({ removed: true });
    expect(await service.findByName("clock.eth")).toBeNull();
  });
});

describe("FarolService.sweep", () => {
  beforeEach(() => {
    service = new FarolService(table.asPrisma(), fakeSeaportReads());
  });

  /// The background half of the same problem recheck solves per-order: orders die on-chain
  /// (or by an offerer's counter bump) with nothing notifying us, and a listing nobody
  /// revisits would otherwise stay buyable-looking forever.
  it("removes a cancelled listing and leaves a live one alone", async () => {
    await service.create(listingOf({ name: "live.eth" }));
    await service.create(listingOf({ name: "gone.eth" }));
    const cancelled = table.rows[1].orderHash;

    const summary = await sweeperFor({ statusByHash: { [cancelled]: { cancelled: true } } }).sweep();

    expect(summary).toEqual({ checked: 2, removed: 1 });
    expect(await service.findByName("gone.eth")).toBeNull();
    expect(await service.findByName("live.eth")).not.toBeNull();
  });

  /// incrementCounter is how a wallet invalidates everything it has ever signed at once, and
  /// it leaves each individual order's own status untouched — so the stored counter is the
  /// only thing that reveals it.
  it("removes every listing signed under a counter the seller has since bumped", async () => {
    await service.create(listingOf({ name: "old.eth", protocolData: signedOrder({ offerer: SELLER, counter: "0" }) }));
    await service.create(listingOf({ name: "new.eth", protocolData: signedOrder({ offerer: SELLER, counter: "1" }) }));

    const summary = await sweeperFor({ counters: { [SELLER]: 1n } }).sweep();

    expect(summary).toEqual({ checked: 2, removed: 1 });
    expect(await service.findByName("old.eth")).toBeNull();
    expect(await service.findByName("new.eth")).not.toBeNull();
  });

  /// Expired rows are already hidden from every read, so deleting them changes nothing a
  /// visitor sees — it keeps the table from growing without bound, and keeps each sweep from
  /// spending an RPC call on an order that can never come back.
  it("prunes expired listings without asking the chain about them", async () => {
    await service.create(listingOf({ name: "gone.eth", protocolData: signedOrder({ endTime: LONG_PAST }) }));

    const summary = await sweeperFor({}).sweep();

    expect(summary).toEqual({ checked: 0, removed: 1 });
    expect(table.rows).toEqual([]);
  });
});

function sweeperFor(reads: Parameters<typeof fakeSeaportReads>[0]): FarolService {
  return new FarolService(table.asPrisma(), fakeSeaportReads(reads));
}
