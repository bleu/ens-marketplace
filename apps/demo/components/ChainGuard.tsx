"use client";

import { usePathname } from "next/navigation";
import { foundry, sepolia } from "wagmi/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

const SUPPORTED_CHAIN_IDS: readonly number[] = [foundry.id, sepolia.id];

/// Warns when a connected wallet is on a chain with no deployed marketplace contracts.
/// Supported today: local Anvil (see docs/local-demo.md) and Sepolia (see
/// contracts/script/DeployV2Sepolia.s.sol) — mainnet isn't deployed yet (Slice 2). Real
/// ENSv1 detail pages (app/domains/ensv1/[name]) are the one exception — those are
/// read-only against real mainnet data regardless of wallet chain, and their own Buy flow
/// already prompts a mainnet switch contextually only when the user actually tries to buy
/// — so this global guard would otherwise incorrectly nag a mainnet-connected wallet to
/// switch away just to view a real name's read-only details.
export function ChainGuard() {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (pathname.startsWith("/domains/ensv1")) return null;
  if (!isConnected || SUPPORTED_CHAIN_IDS.includes(chainId)) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-2)] border px-4 py-3 text-sm"
      style={{ borderColor: "rgba(255,134,104,0.4)", background: "rgba(255,134,104,0.08)" }}
    >
      <span style={{ color: "var(--accent)" }}>
        Wrong network — this demo runs on local Anvil or Sepolia. See docs/local-demo.md to
        start Anvil, or switch to Sepolia.
      </span>
      <button
        type="button"
        onClick={() => switchChain({ chainId: foundry.id })}
        disabled={isPending}
        className="shrink-0 rounded-[var(--radius-1)] px-3 py-1 font-medium disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
      >
        {isPending ? "Switching…" : "Switch to Anvil"}
      </button>
      <button
        type="button"
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        className="shrink-0 rounded-[var(--radius-1)] px-3 py-1 font-medium disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
      >
        {isPending ? "Switching…" : "Switch to Sepolia"}
      </button>
    </div>
  );
}
