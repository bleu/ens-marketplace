import { indexer, type SubnameListing } from "envio";

indexer.onEvent({ contract: "LeaseVault", event: "Announced" }, async ({ event, context }) => {
  const existing = await context.SubnameListing.get(event.params.canonicalId.toString());
  const listing: SubnameListing = {
    id: event.params.canonicalId.toString(),
    parentAddress: event.params.parent,
    pricePerTerm: event.params.pricePerTerm,
    termSeconds: event.params.termSeconds,
    active: true,
    // announceForRent() doesn't reset the vault's own tenant/leaseActiveUntil mappings —
    // preserve whatever an earlier lease left behind, same as the contract itself does.
    tenant: existing?.tenant,
    leaseActiveUntil: existing?.leaseActiveUntil,
    updatedAt: BigInt(event.block.timestamp),
  };
  context.SubnameListing.set(listing);
});

indexer.onEvent({ contract: "LeaseVault", event: "Withdrawn" }, async ({ event, context }) => {
  const existing = await context.SubnameListing.get(event.params.canonicalId.toString());
  if (!existing) {
    context.log.warn(`Withdrawn for unknown canonicalId ${event.params.canonicalId}`);
    return;
  }
  context.SubnameListing.set({ ...existing, active: false, updatedAt: BigInt(event.block.timestamp) });
});

indexer.onEvent({ contract: "LeaseVault", event: "LeaseStarted" }, async ({ event, context }) => {
  const existing = await context.SubnameListing.get(event.params.canonicalId.toString());
  if (!existing) {
    context.log.warn(`LeaseStarted for unknown canonicalId ${event.params.canonicalId}`);
    return;
  }
  context.SubnameListing.set({
    ...existing,
    tenant: event.params.tenant,
    leaseActiveUntil: event.params.activeUntil,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "LeaseVault", event: "LeasedResolverSet" }, async ({ event, context }) => {
  const existing = await context.IndexedName.get(event.params.canonicalId.toString());
  if (!existing) {
    context.log.warn(`LeasedResolverSet for unknown canonicalId ${event.params.canonicalId}`);
    return;
  }
  context.IndexedName.set({
    ...existing,
    resolver: event.params.newResolver,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "LeaseVault", event: "LeaseReclaimed" }, async ({ event, context }) => {
  const existing = await context.SubnameListing.get(event.params.canonicalId.toString());
  if (!existing) {
    context.log.warn(`LeaseReclaimed for unknown canonicalId ${event.params.canonicalId}`);
    return;
  }
  context.SubnameListing.set({
    ...existing,
    tenant: undefined,
    leaseActiveUntil: undefined,
    updatedAt: BigInt(event.block.timestamp),
  });
});
