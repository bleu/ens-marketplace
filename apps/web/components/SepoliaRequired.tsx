"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { useAccount, useSwitchChain } from "wagmi";

/// Shown in place of any ENSv2 surface when the current chain has no marketplace
/// deployment (see lib/contracts.ts's `getContractAddresses`). Mainnet is the chain wagmi
/// reports before a wallet connects, so the disconnected branch is the common case, not an
/// edge one — `useSwitchChain` alone would leave a wallet-less visitor with a button that
/// can't do anything.
export function SepoliaRequired() {
  const { isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  return (
    <div className="mx-auto max-w-[560px] px-4 py-16 text-center">
      <div
        className="rounded-[var(--radius-3)] border p-8"
        style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.02)" }}
      >
        <div
          className="mb-2 font-mono text-[10px] uppercase tracking-[var(--tracking-wide)]"
          style={{ color: "var(--fg-kicker)" }}
        >
          Sepolia required
        </div>
        <div
          className="mb-3 font-[var(--font-display)] text-2xl font-light tracking-[var(--tracking-snug)]"
          style={{ color: "var(--fg)" }}
        >
          Our ENSv2 marketplace lives on Sepolia
        </div>
        <p className="mb-7 font-mono text-[13px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          These are our own mock ENSv2 contracts, deployed on Sepolia and nowhere
          else. {isConnected ? "Switch networks to browse and trade them." : "Connect a wallet on Sepolia to browse and trade them."}
        </p>
        {isConnected ? (
          <button
            type="button"
            onClick={() => switchChain({ chainId: sepolia.id })}
            disabled={isPending}
            className="h-[52px] rounded-[var(--radius-2)] px-8 font-sans text-[15px] font-semibold disabled:opacity-50"
            style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
          >
            {isPending ? "Switching…" : "Switch to Sepolia"}
          </button>
        ) : (
          <div className="flex justify-center [&>button]:h-[52px] [&>button]:rounded-[var(--radius-2)] [&>button]:px-8 [&>button]:font-sans [&>button]:text-[15px] [&>button]:font-semibold">
            <ConnectButton />
          </div>
        )}
      </div>
    </div>
  );
}
