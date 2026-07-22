import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-xl font-semibold">Bleu ENS Marketplace — PoC Demo</h1>
      <p className="max-w-md text-center text-sm text-gray-500">
        Bare scaffold. Slice 1 (Sepolia v2 register → list → buy →
        regeneration-safe) and Slice 2 (mainnet v1 swap-routed renewal) demo
        flows land here in later sessions — see docs/poc-slice-1.md and
        docs/poc-slice-2.md.
      </p>
      <ConnectButton />
    </main>
  );
}
