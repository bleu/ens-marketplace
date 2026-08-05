import { indexer, type IndexedName } from "envio";
import { ZERO_ADDRESS } from "./shared";

indexer.onEvent({ contract: "Registry", event: "Registered" }, async ({ event, context }) => {
  const name: IndexedName = {
    id: event.params.canonicalId.toString(),
    name: event.params.name,
    parentId: undefined,
    owner: event.params.owner,
    // Not emitted by Registered — filled in once/if a ResolverChanged event arrives.
    resolver: ZERO_ADDRESS,
    updatedAt: BigInt(event.block.timestamp),
  };
  context.IndexedName.set(name);
});

indexer.onEvent({ contract: "Registry", event: "SubnameRegistered" }, async ({ event, context }) => {
  const parent = await context.IndexedName.get(event.params.parentId.toString());
  const name: IndexedName = {
    id: event.params.canonicalId.toString(),
    name: parent ? `${event.params.label}.${parent.name}` : event.params.label,
    parentId: event.params.parentId.toString(),
    owner: event.params.owner,
    resolver: ZERO_ADDRESS,
    updatedAt: BigInt(event.block.timestamp),
  };
  context.IndexedName.set(name);
});

indexer.onEvent({ contract: "Registry", event: "OwnerChanged" }, async ({ event, context }) => {
  const existing = await context.IndexedName.get(event.params.canonicalId.toString());
  if (!existing) {
    context.log.warn(`OwnerChanged for unknown canonicalId ${event.params.canonicalId}`);
    return;
  }
  context.IndexedName.set({
    ...existing,
    owner: event.params.newOwner,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "Registry", event: "ResolverChanged" }, async ({ event, context }) => {
  const existing = await context.IndexedName.get(event.params.canonicalId.toString());
  if (!existing) {
    context.log.warn(`ResolverChanged for unknown canonicalId ${event.params.canonicalId}`);
    return;
  }
  context.IndexedName.set({
    ...existing,
    resolver: event.params.newResolver,
    updatedAt: BigInt(event.block.timestamp),
  });
});
