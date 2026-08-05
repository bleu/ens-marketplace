"use client";

import { mainnet, sepolia } from "wagmi/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

const SUPPORTED_CHAIN_IDS: readonly number[] = [mainnet.id, sepolia.id];

/// Warns when a connected wallet is on a chain with no deployed marketplace contracts or
/// real-data source. Supported today: Mainnet (real ENSv1 names, and the app's default
/// chain — see lib/wagmi.ts) and Sepolia (our own mock marketplace, see
/// contracts/script/DeployV2Sepolia.s.sol, plus the real ENSv2 alpha — see
/// lib/ensv2-alpha.ts). The nudge points at mainnet because that's the one chain with
/// something to show whatever page you landed on; the ENSv2 pages have their own
/// `<SepoliaRequired />` panel for the narrower "switch to Sepolia" case.
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
        Wrong network — this demo reads real ENS names on Ethereum mainnet and our own
        ENSv2 marketplace on Sepolia.
      </span>
      <button
        type="button"
        onClick={() => switchChain({ chainId: mainnet.id })}
        disabled={isPending}
        className="shrink-0 rounded-[var(--radius-1)] px-3 py-1 font-medium disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
      >
        {isPending ? "Switching…" : "Switch to Ethereum mainnet"}
      </button>
    </div>
  );
}
