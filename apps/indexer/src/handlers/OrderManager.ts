import { indexer, type DomainOrder } from "envio";
import { activityRecord } from "./shared";

/// Matches CanonicalIdOrderManager.sol's Status enum exactly.
const Status = { None: 0, Active: 1, Suspended: 2, Filled: 3, Cancelled: 4 } as const;

indexer.onEvent({ contract: "OrderManager", event: "Listed" }, async ({ event, context }) => {
  const order: DomainOrder = {
    id: event.params.canonicalId.toString(),
    seller: event.params.seller,
    price: event.params.price,
    pinnedHash: event.params.pinnedHash,
    status: Status.Active,
    updatedAt: BigInt(event.block.timestamp),
  };
  context.DomainOrder.set(order);
  context.DomainActivity.set(activityRecord(event, event.params.canonicalId, "Listed", event.params));
});

indexer.onEvent({ contract: "OrderManager", event: "Relisted" }, async ({ event, context }) => {
  const existing = await context.DomainOrder.get(event.params.canonicalId.toString());
  if (existing) {
    context.DomainOrder.set({
      ...existing,
      price: event.params.newPrice,
      pinnedHash: event.params.pinnedHash,
      status: Status.Active,
      updatedAt: BigInt(event.block.timestamp),
    });
  } else {
    context.log.warn(`Relisted for unknown canonicalId ${event.params.canonicalId}`);
  }
  context.DomainActivity.set(activityRecord(event, event.params.canonicalId, "Relisted", event.params));
});

indexer.onEvent({ contract: "OrderManager", event: "Cancelled" }, async ({ event, context }) => {
  const existing = await context.DomainOrder.get(event.params.canonicalId.toString());
  if (existing) {
    context.DomainOrder.set({ ...existing, status: Status.Cancelled, updatedAt: BigInt(event.block.timestamp) });
  } else {
    context.log.warn(`Cancelled for unknown canonicalId ${event.params.canonicalId}`);
  }
  context.DomainActivity.set(activityRecord(event, event.params.canonicalId, "Cancelled", event.params));
});

indexer.onEvent({ contract: "OrderManager", event: "Filled" }, async ({ event, context }) => {
  const existing = await context.DomainOrder.get(event.params.canonicalId.toString());
  if (existing) {
    context.DomainOrder.set({
      ...existing,
      price: event.params.price,
      status: Status.Filled,
      updatedAt: BigInt(event.block.timestamp),
    });
  } else {
    context.log.warn(`Filled for unknown canonicalId ${event.params.canonicalId}`);
  }
  context.DomainActivity.set(activityRecord(event, event.params.canonicalId, "Filled", event.params));
});

indexer.onEvent({ contract: "OrderManager", event: "OrderSuspended" }, async ({ event, context }) => {
  const existing = await context.DomainOrder.get(event.params.canonicalId.toString());
  if (existing) {
    context.DomainOrder.set({ ...existing, status: Status.Suspended, updatedAt: BigInt(event.block.timestamp) });
  } else {
    context.log.warn(`OrderSuspended for unknown canonicalId ${event.params.canonicalId}`);
  }
  context.DomainActivity.set(activityRecord(event, event.params.canonicalId, "OrderSuspended", event.params));
});

indexer.onEvent({ contract: "OrderManager", event: "Refilled" }, async ({ event, context }) => {
  const existing = await context.DomainOrder.get(event.params.canonicalId.toString());
  if (existing) {
    context.DomainOrder.set({
      ...existing,
      price: event.params.price,
      status: Status.Filled,
      updatedAt: BigInt(event.block.timestamp),
    });
  } else {
    context.log.warn(`Refilled for unknown canonicalId ${event.params.canonicalId}`);
  }
  context.DomainActivity.set(activityRecord(event, event.params.canonicalId, "Refilled", event.params));
});
