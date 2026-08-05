import { formatEther } from "viem";

export interface ActivityItem {
  event: string;
  color: string;
  detail: string;
  at: number;
  txHash: string;
}

interface ActivityRow {
  eventName: string;
  argsJson: string;
  occurredAt: string | number;
  txHash: string;
}

/// Mirrors apps/demo/lib/events.ts's formatActivity exactly (same event names, colors,
/// and ETH-formatted detail strings) — the indexer stores raw event params (argsJson),
/// display formatting stays a frontend/API-layer concern rather than baked into the index.
export function formatActivity(row: ActivityRow): ActivityItem {
  const args = JSON.parse(row.argsJson) as Record<string, string>;
  const base = { at: Number(row.occurredAt), txHash: row.txHash };
  switch (row.eventName) {
    case "Listed":
      return { ...base, event: "Listed", color: "var(--brand)", detail: `${formatEther(BigInt(args.price))} ETH` };
    case "Relisted":
      return { ...base, event: "Relisted", color: "var(--brand)", detail: `${formatEther(BigInt(args.newPrice))} ETH` };
    case "Filled":
      return { ...base, event: "Sale", color: "var(--highlight)", detail: `${formatEther(BigInt(args.price))} ETH` };
    case "Refilled":
      return { ...base, event: "Sale (diff accepted)", color: "var(--highlight)", detail: `${formatEther(BigInt(args.price))} ETH` };
    case "OrderSuspended":
      return { ...base, event: "Suspended", color: "var(--accent)", detail: "state changed since listing" };
    case "Cancelled":
      return { ...base, event: "Cancelled", color: "var(--fg-muted)", detail: "—" };
    default:
      return { ...base, event: row.eventName, color: "var(--fg-muted)", detail: "—" };
  }
}
