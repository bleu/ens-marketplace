import type { DomainActivity } from "envio";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/// JSON.stringify throws on bigint by default — event params (canonicalId, price, etc.)
/// are all bigint, so every activity record needs this replacer.
function stringifyArgs(params: Record<string, unknown>): string {
  return JSON.stringify(params, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

export function activityRecord(
  event: {
    transaction: { hash: string };
    logIndex: number;
    block: { number: number; timestamp: number };
  },
  canonicalId: bigint,
  eventName: string,
  params: Record<string, unknown>,
): DomainActivity {
  return {
    id: `${event.transaction.hash}-${event.logIndex}`,
    canonicalId: canonicalId.toString(),
    eventName,
    argsJson: stringifyArgs(params),
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    occurredAt: BigInt(event.block.timestamp),
  };
}
