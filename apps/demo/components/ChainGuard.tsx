"use client";

import { usePathname } from "next/navigation";
import { foundry } from "wagmi/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

/// Warns when a connected wallet is on the wrong network. The demo currently runs
/// against a local Anvil chain (see docs/local-demo.md), not real Sepolia/mainnet yet, so
/// a fresh wallet session very likely needs to add/switch to it. Real ENSv1 detail pages
/// (app/domains/ensv1/[name]) are the one exception — those are read-only against real
/// mainnet data regardless of wallet chain, and their own Buy flow already prompts a
/// mainnet switch contextually only when the user actually tries to buy — so this global
/// guard would otherwise incorrectly nag a mainnet-connected wallet to switch to Anvil
/// just to view a real name's read-only details.
export function ChainGuard() {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (pathname.startsWith("/domains/ensv1")) return null;
  if (!isConnected || chainId === foundry.id) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-2)] border px-4 py-3 text-sm"
      style={{ borderColor: "rgba(255,134,104,0.4)", background: "rgba(255,134,104,0.08)" }}
    >
      <span style={{ color: "var(--accent)" }}>
        Wrong network — this demo runs on the local Anvil chain (id {foundry.id}). See
        docs/local-demo.md to start it.
      </span>
      <button
        type="button"
        onClick={() => switchChain({ chainId: foundry.id })}
        disabled={isPending}
        className="shrink-0 rounded-[var(--radius-1)] px-3 py-1 font-medium disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
      >
        {isPending ? "Switching…" : "Switch network"}
      </button>
    </div>
  );
}
