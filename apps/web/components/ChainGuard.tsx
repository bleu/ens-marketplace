"use client";

import { foundry, mainnet, sepolia } from "wagmi/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

const SUPPORTED_CHAIN_IDS: readonly number[] = [foundry.id, sepolia.id, mainnet.id];

/// Warns when a connected wallet is on a chain with no deployed marketplace contracts or
/// real-data source. Supported today: local Anvil (see docs/local-dev.md), Sepolia (see
/// contracts/script/DeployV2Sepolia.s.sol, and the real ENSv2 alpha — see
/// lib/ensv2-alpha.ts), and Mainnet (real ENSv1 names via the Source picker on /domains —
/// see lib/network-mode.tsx). No special-case pathname exception needed now that Mainnet
/// is a genuinely supported chain, not just tolerated for one read-only route.
export function ChainGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || SUPPORTED_CHAIN_IDS.includes(chainId)) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-2)] border px-4 py-3 text-sm"
      style={{ borderColor: "rgba(255,134,104,0.4)", background: "rgba(255,134,104,0.08)" }}
    >
      <span style={{ color: "var(--accent)" }}>
        Wrong network — Farol runs on local Anvil, Sepolia, or Mainnet. See
        docs/local-dev.md to start Anvil, or switch networks.
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
      <button
        type="button"
        onClick={() => switchChain({ chainId: mainnet.id })}
        disabled={isPending}
        className="shrink-0 rounded-[var(--radius-1)] px-3 py-1 font-medium disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
      >
        {isPending ? "Switching…" : "Switch to Mainnet"}
      </button>
    </div>
  );
}
