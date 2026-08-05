import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers } from "envio";
const { Addresses } = TestHelpers;

describe("Registry", () => {
  it("Registered creates an IndexedName", async (t) => {
    const indexer = createTestIndexer();
    const owner = Addresses.mockAddresses[0]!;

    await indexer.process({
      chains: {
        31337: {
          simulate: [
            { contract: "Registry", event: "Registered", params: { canonicalId: 1n, name: "alice.eth", owner } },
          ],
        },
      },
    });

    const name = await indexer.IndexedName.getOrThrow("1");
    t.expect({ name: name.name, owner: name.owner, parentId: name.parentId }).toEqual({
      name: "alice.eth",
      owner,
      parentId: undefined,
    });
  });

  it("SubnameRegistered joins the subname label with its parent's name", async (t) => {
    const indexer = createTestIndexer();
    const owner = Addresses.mockAddresses[0]!;

    await indexer.process({
      chains: {
        31337: {
          simulate: [
            { contract: "Registry", event: "Registered", params: { canonicalId: 1n, name: "alice.eth", owner } },
            {
              contract: "Registry",
              event: "SubnameRegistered",
              params: { parentId: 1n, canonicalId: 2n, label: "sub", owner },
            },
          ],
        },
      },
    });

    const subname = await indexer.IndexedName.getOrThrow("2");
    t.expect({ name: subname.name, parentId: subname.parentId }).toEqual({ name: "sub.alice.eth", parentId: "1" });
  });
});

describe("OrderManager", () => {
  it("Listed then Filled moves a DomainOrder from Active to Filled", async (t) => {
    const indexer = createTestIndexer();
    const seller = Addresses.mockAddresses[0]!;
    const buyer = Addresses.mockAddresses[1]!;
    const pinnedHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

    await indexer.process({
      chains: {
        31337: {
          simulate: [
            {
              contract: "OrderManager",
              event: "Listed",
              params: { canonicalId: 1n, seller, price: 1_000_000_000_000_000_000n, pinnedHash },
            },
            {
              contract: "OrderManager",
              event: "Filled",
              params: { canonicalId: 1n, buyer, price: 1_000_000_000_000_000_000n },
            },
          ],
        },
      },
    });

    const filled = await indexer.DomainOrder.getOrThrow("1");
    t.expect(filled.status, "Filled should set status to 3 (Filled)").toBe(3);

    const activity = await indexer.DomainActivity.getAll();
    t.expect(activity.map((a: { eventName: string }) => a.eventName).sort()).toEqual(["Filled", "Listed"]);
  });

  it("Listed denormalizes the name from IndexedName, and later events carry it forward", async (t) => {
    const indexer = createTestIndexer();
    const seller = Addresses.mockAddresses[0]!;
    const pinnedHash = "0x0000000000000000000000000000000000000000000000000000000000000001";

    await indexer.process({
      chains: {
        31337: {
          simulate: [
            { contract: "Registry", event: "Registered", params: { canonicalId: 1n, name: "alice.eth", owner: seller } },
            {
              contract: "OrderManager",
              event: "Listed",
              params: { canonicalId: 1n, seller, price: 1_000_000_000_000_000_000n, pinnedHash },
            },
            { contract: "OrderManager", event: "Relisted", params: { canonicalId: 1n, newPrice: 2_000_000_000_000_000_000n, pinnedHash } },
          ],
        },
      },
    });

    const order = await indexer.DomainOrder.getOrThrow("1");
    t.expect(order.name, "name should carry forward through Relisted, not just Listed").toBe("alice.eth");
  });
});

describe("LeaseVault", () => {
  it("Announced then LeaseStarted sets the tenant without clearing the listing", async (t) => {
    const indexer = createTestIndexer();
    const parent = Addresses.mockAddresses[0]!;
    const tenant = Addresses.mockAddresses[1]!;

    await indexer.process({
      chains: {
        31337: {
          simulate: [
            {
              contract: "LeaseVault",
              event: "Announced",
              params: { canonicalId: 5n, parent, pricePerTerm: 100n, termSeconds: 3600n },
            },
            {
              contract: "LeaseVault",
              event: "LeaseStarted",
              params: { canonicalId: 5n, tenant, activeUntil: 999_999n },
            },
          ],
        },
      },
    });

    const listing = await indexer.SubnameListing.getOrThrow("5");
    t.expect({ active: listing.active, tenant: listing.tenant, leaseActiveUntil: listing.leaseActiveUntil }).toEqual({
      active: true,
      tenant,
      leaseActiveUntil: 999_999n,
    });
  });
});
