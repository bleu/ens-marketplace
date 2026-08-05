"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatUnits } from "viem";
import { useAccount, useBalance, useChainId, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEnsV1Domain, useEnsV1ListingForName } from "@/lib/ensv1-client";
import { ensAppUrl, grailsUrl, namehash, openseaAssetUrl, type EnsV1Listing } from "@/lib/ensv1";
import { fulfillListing, isInsufficientBalanceError, useEthersSigner } from "@/lib/seaport";
import { Network } from "@/lib/contracts";
import { AddressLink } from "@/components/AddressLink";
import { gradientFor } from "@/components/NameCard";

type BuyStep = "idle" | "confirming" | "pending" | "success" | "error";

export default function EnsV1DomainDetailPage() {
  const params = useParams<{ name: string }>();
  const name = params.name;

  const { domain, isLoading: domainLoading, isError: domainError, notFound, refetch: refetchDomain } = useEnsV1Domain(name);
  const { listing, isLoading: listingLoading, notConfigured } = useEnsV1ListingForName(name);

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const signer = useEthersSigner();

  const [buyStep, setBuyStep] = useState<BuyStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);

  const gradient = gradientFor(BigInt(namehash(name)));
  const onMainnet = chainId === mainnet.id;

  // Proactive check so "insufficient balance" shows up before the user even reaches the
  // confirm step, rather than only surfacing after they click through and Seaport's own
  // pre-flight check rejects the attempt. Only meaningful for ETH-denominated listings
  // (a wallet's native balance says nothing about its WETH/other-token balance) — for
  // anything else this simply doesn't block, and Seaport's own check remains the
  // authoritative guard either way.
  const { data: ethBalance } = useBalance({ address, chainId: mainnet.id, query: { enabled: isConnected && onMainnet } });
  const insufficientBalance =
    !!listing &&
    listing.price.currency === "ETH" &&
    !!ethBalance &&
    ethBalance.value < BigInt(listing.price.value);

  async function confirmPurchase() {
    if (!listing || !signer) return;
    setBuyStep("pending");
    setBuyError(null);
    try {
      const tx = await fulfillListing(signer, listing, await signer.getAddress());
      setTxHash("hash" in tx ? (tx as { hash: string }).hash : null);
      setBuyStep("success");
    } catch (err) {
      if (isInsufficientBalanceError(err)) {
        // Expected, common outcome for a real-money flow — not a bug, so this
        // deliberately skips console.error (which Next's dev overlay surfaces as if the
        // app had crashed) in favor of a quieter warn plus a dedicated UI message.
        console.warn("ENSv1 purchase rejected: insufficient balance", err);
        setBuyError("insufficient-balance");
      } else {
        console.error("ENSv1 purchase failed:", err);
        setBuyError(err instanceof Error ? err.message.split("\n")[0] : "Purchase failed");
      }
      setBuyStep("error");
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-[900px] animate-[fadeIn_0.2s_var(--ease-out)] p-4 lg:p-8">
        <BackLink />
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            This name isn&apos;t registered.
          </p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            &quot;{name}&quot; has no owner on real mainnet ENS.
          </p>
        </div>
      </main>
    );
  }

  if (domainError) {
    return (
      <main className="mx-auto max-w-[900px] animate-[fadeIn_0.2s_var(--ease-out)] p-4 lg:p-8">
        <BackLink />
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            Couldn&apos;t load this name.
          </p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            The subgraph lookup failed — this is usually a transient rate limit on the
            shared free endpoint. Try again in a moment.
          </p>
          <button
            onClick={refetchDomain}
            className="mt-5 h-10 rounded-[var(--radius-2)] border px-5 font-mono text-sm"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (domainLoading || !domain) {
    return <main className="p-4 font-mono text-sm text-[var(--fg-dim)] lg:p-8">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-[1200px] animate-[fadeIn_0.2s_var(--ease-out)] p-4 lg:p-8">
      <BackLink />

      <div className="grid grid-cols-1 gap-9 lg:grid-cols-[420px_1fr]">
        {/* left card */}
        <div className="lg:sticky lg:top-[108px]">
          <div className="overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            <div className="flex aspect-square flex-col justify-between p-7" style={{ background: gradient }}>
              <div
                style={{
                  width: 40,
                  height: 58,
                  background: "rgba(255,255,255,0.95)",
                  clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
                }}
              />
              <div
                className="font-sans text-[46px] font-bold break-all text-white"
                style={{ letterSpacing: "-0.02em", textShadow: "0 2px 20px rgba(0,0,0,0.25)" }}
              >
                {domain.name}
              </div>
            </div>
          </div>

          <div
            className="mt-4 rounded-[var(--radius-3)] border p-[18px] font-mono text-xs"
            style={{ borderColor: "rgba(255,134,104,0.4)", background: "rgba(255,134,104,0.08)", color: "var(--accent)" }}
          >
            Real mainnet ENS name — read-only. A purchase below is a genuine on-chain
            transaction using real ETH.
          </div>

          {!notConfigured && listing && (
            <div className="mt-4">
              <BuyBox
                listing={listing}
                onMainnet={onMainnet}
                isConnected={isConnected}
                switching={switching}
                buyStep={buyStep}
                txHash={txHash}
                buyError={buyError}
                insufficientBalance={insufficientBalance}
                ethBalance={ethBalance?.value}
                onConnect={() => openConnectModal?.()}
                onSwitch={() => switchChain({ chainId: mainnet.id })}
                onStartConfirm={() => setBuyStep("confirming")}
                onCancelConfirm={() => setBuyStep("idle")}
                onConfirmPurchase={confirmPurchase}
              />
            </div>
          )}
          {!notConfigured && listingLoading && (
            <p className="mt-4 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              Checking Grails and OpenSea for an active listing…
            </p>
          )}
          {!notConfigured && !listing && !listingLoading && (
            <p className="mt-4 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
              Not currently listed for sale on Grails or OpenSea.
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <a
              href={ensAppUrl(domain.name)}
              target="_blank"
              rel="noreferrer"
              className="btn-outline flex h-11 flex-1 items-center justify-center rounded-[var(--radius-2)] border font-sans text-sm font-medium"
            >
              View on ENS App
            </a>
            {listing?.source === "opensea" && (
              <a
                href={openseaAssetUrl(
                  listing.listing.protocol_data.parameters.offer[0].token as `0x${string}`,
                  listing.listing.protocol_data.parameters.offer[0].identifierOrCriteria,
                )}
                target="_blank"
                rel="noreferrer"
                className="btn-outline flex h-11 flex-1 items-center justify-center rounded-[var(--radius-2)] border font-sans text-sm font-medium"
              >
                View on OpenSea
              </a>
            )}
            {listing?.source === "grails" && (
              <a
                href={grailsUrl(domain.name)}
                target="_blank"
                rel="noreferrer"
                className="btn-outline flex h-11 flex-1 items-center justify-center rounded-[var(--radius-2)] border font-sans text-sm font-medium"
              >
                View on Grails
              </a>
            )}
          </div>
        </div>

        {/* right column */}
        <div className="flex flex-col">
          <div className="overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            {[
              { k: "Owner", v: <AddressLink address={domain.owner} network={Network.Mainnet} /> },
              {
                k: "Resolver",
                v: domain.resolver ? <AddressLink address={domain.resolver} network={Network.Mainnet} /> : "—",
              },
              {
                k: "Resolved address",
                v: domain.resolvedAddress ? <AddressLink address={domain.resolvedAddress} network={Network.Mainnet} /> : "—",
              },
              { k: "Registered", v: domain.registrationDate ? new Date(domain.registrationDate * 1000).toLocaleDateString() : "—" },
              { k: "Expires", v: domain.expiryDate ? new Date(domain.expiryDate * 1000).toLocaleDateString() : "—" },
              { k: "Network", v: "Ethereum mainnet (ENSv1, real)" },
            ].map((d) => (
              <div key={d.k} className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
                <span className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                  {d.k}
                </span>
                <span className="font-mono text-[13px]" style={{ color: "var(--fg)" }}>
                  {d.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function BackLink() {
  return (
    <Link href="/domains" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="m15 18-6-6 6-6" />
      </svg>
      Back to explore
    </Link>
  );
}

function BuyBox({
  listing,
  onMainnet,
  isConnected,
  switching,
  buyStep,
  txHash,
  buyError,
  insufficientBalance,
  ethBalance,
  onConnect,
  onSwitch,
  onStartConfirm,
  onCancelConfirm,
  onConfirmPurchase,
}: {
  listing: EnsV1Listing;
  onMainnet: boolean;
  isConnected: boolean;
  switching: boolean;
  buyStep: BuyStep;
  txHash: string | null;
  buyError: string | null;
  insufficientBalance: boolean;
  ethBalance: bigint | undefined;
  onConnect: () => void;
  onSwitch: () => void;
  onStartConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmPurchase: () => void;
}) {
  const price = formatUnits(BigInt(listing.price.value), listing.price.decimals);

  if (buyStep === "success") {
    return (
      <div
        className="rounded-[var(--radius-3)] border p-[18px] font-mono text-sm"
        style={{ borderColor: "rgba(120,234,150,0.4)", background: "rgba(120,234,150,0.08)", color: "var(--color-lima-500)" }}
      >
        Purchase submitted.
        {txHash && (
          <>
            {" "}
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "underline" }}
            >
              View on Etherscan →
            </a>
          </>
        )}
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={onConnect}
        className="btn-cta h-[52px] w-full rounded-[var(--radius-2)] font-sans text-[15px] font-semibold"
        style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
      >
        Connect wallet to buy · {price} {listing.price.currency}
      </button>
    );
  }

  if (!onMainnet) {
    return (
      <button
        onClick={onSwitch}
        disabled={switching}
        className="h-[52px] w-full rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
      >
        {switching ? "Switching…" : "Switch to Ethereum mainnet to buy"}
      </button>
    );
  }

  if (insufficientBalance) {
    return (
      <div
        className="rounded-[var(--radius-3)] border p-[18px] font-mono text-xs"
        style={{ borderColor: "var(--color-sinal-danger)", background: "rgba(206,105,94,0.08)", color: "var(--color-sinal-danger)" }}
      >
        Not enough ETH to buy this name. This listing costs {price} {listing.price.currency}
        {ethBalance !== undefined && <> — your wallet has {formatUnits(ethBalance, 18)} ETH</>}. You&apos;ll also need
        a bit more to cover gas.
      </div>
    );
  }

  if (buyStep === "confirming") {
    return (
      <div className="rounded-[var(--radius-3)] border p-[18px]" style={{ borderColor: "var(--accent)", background: "rgba(255,134,104,0.08)" }}>
        <p className="font-sans text-sm font-medium" style={{ color: "var(--fg)" }}>
          Confirm real purchase
        </p>
        <p className="mt-1 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
          This spends real ETH on real Ethereum mainnet, buying directly from the
          seller&apos;s real {listing.source === "grails" ? "Grails" : "OpenSea"} listing.
          This cannot be undone.
        </p>
        <p className="mt-2 font-mono text-lg" style={{ color: "var(--fg)" }}>
          {price} {listing.price.currency}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onConfirmPurchase}
            className="btn-cta h-11 flex-1 rounded-[var(--radius-2)] font-sans text-sm font-semibold"
            style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
          >
            Confirm purchase
          </button>
          <button
            onClick={onCancelConfirm}
            className="h-11 rounded-[var(--radius-2)] border px-4 font-sans text-sm"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (buyError === "insufficient-balance") {
    return (
      <div
        className="rounded-[var(--radius-3)] border p-[18px] font-mono text-xs"
        style={{ borderColor: "var(--color-sinal-danger)", background: "rgba(206,105,94,0.08)", color: "var(--color-sinal-danger)" }}
      >
        Not enough ETH to buy this name — the transaction was rejected before submitting,
        so no gas was spent. This listing costs {price} {listing.price.currency} plus gas.
      </div>
    );
  }

  return (
    <>
      {buyError && (
        <p className="mb-2 font-mono text-xs" style={{ color: "var(--color-sinal-danger)" }}>
          {buyError}
        </p>
      )}
      <button
        onClick={onStartConfirm}
        disabled={buyStep === "pending"}
        className="btn-cta h-[52px] w-full rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-50"
        style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
      >
        {buyStep === "pending" ? "Confirming…" : `Buy now · ${price} ${listing.price.currency}`}
      </button>
    </>
  );
}
