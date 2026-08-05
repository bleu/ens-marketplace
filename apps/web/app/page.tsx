"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const SOURCES = [
  {
    chain: "Anvil (local)",
    label: "Local",
    description: "Our own mock ENSv2 registry + order manager — full read/write, list/buy/relist/cancel.",
  },
  {
    chain: "Sepolia",
    label: "ENSv2",
    description: "ENS Labs' own real ENSv2 alpha contracts — real commit-reveal registration, paid in a real ERC-20.",
  },
  {
    chain: "Mainnet",
    label: "ENSv1 · Grails · OpenSea",
    description: "Real ENS names on Ethereum mainnet — read-only ownership, real active listings, a real Seaport buy flow.",
  },
] as const;

/// Which of the three sources is even reachable depends entirely on which chain a wallet
/// is connected to (see lib/network-mode.tsx's chain→mode pairing) — so there's nothing
/// meaningful to show before a wallet is connected. Once one is, /domains picks the right
/// source automatically; this page's only job is getting from "no wallet" to that point.
export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();

  useEffect(() => {
    if (isConnected) router.push("/domains");
  }, [isConnected, router]);

  if (isConnected) return null;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-76px)] max-w-[720px] flex-col items-center justify-center px-4 text-center">
      <div className="mb-3 font-mono text-[11px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--color-profundo-300)" }}>
        Farol
      </div>
      <h1 className="mb-5 font-[var(--font-display)] text-[48px] font-light tracking-[var(--tracking-snug)]" style={{ color: "var(--fg)" }}>
        Connect a wallet to <span className="font-[var(--font-display-italic)] italic">begin</span>
      </h1>
      <p className="mb-10 max-w-md font-mono text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        What you&apos;ll see depends on which chain your wallet is connected to — this beta
        runs three genuinely different sources side by side, not a single unified feed.
      </p>

      <div className="mb-10 [&>button]:h-[52px] [&>button]:rounded-[var(--radius-2)] [&>button]:px-8 [&>button]:font-sans [&>button]:text-[15px] [&>button]:font-semibold">
        <ConnectButton />
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {SOURCES.map((s) => (
          <div key={s.chain} className="rounded-[var(--radius-3)] border p-4 text-left" style={{ borderColor: "var(--line)" }}>
            <div className="mb-1.5 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--brand)" }}>
              {s.chain}
            </div>
            <div className="mb-2 font-sans text-sm font-semibold" style={{ color: "var(--fg)" }}>
              {s.label}
            </div>
            <div className="font-mono text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
              {s.description}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
