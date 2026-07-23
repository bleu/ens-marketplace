import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChainGuard } from "@/components/ChainGuard";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bleu ENS Marketplace</h1>
        <ConnectButton />
      </div>

      <ChainGuard />

      <p className="text-sm text-gray-500">
        PoC demo running against a local mock ENSv2-shaped registry (not real Sepolia
        yet) — see docs/local-demo.md to start it.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/domains"
          className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
        >
          <h2 className="text-lg font-medium">Domains</h2>
          <p className="mt-1 text-sm text-gray-500">
            Browse listings, list a name for sale, buy one.
          </p>
        </Link>
        <Link
          href="/subnames"
          className="rounded-xl border border-gray-200 p-6 transition-colors hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
        >
          <h2 className="text-lg font-medium">Subnames</h2>
          <p className="mt-1 text-sm text-gray-500">
            Browse rentals, announce a subname for rent, rent one.
          </p>
        </Link>
      </div>
    </main>
  );
}
