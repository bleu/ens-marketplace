"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatEther, parseEther } from "viem";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Network, OrderStatus, orderManagerAbi, registryAbi, useContractAddresses, useCurrentNetwork } from "@/lib/contracts";
import { parseCanonicalId } from "@/lib/canonicalId";
import { computeStateHash } from "@/lib/statehash";
import { isPositiveNumber, shortAddr, shortId } from "@/lib/format";
import { useNameActivity, useSubnameCount } from "@/lib/events";
import { gradientFor } from "@/components/NameCard";
import { Tabs, type TabItem } from "@/components/Tabs";
import { ComingSoonPanel } from "@/components/ComingSoon";

const DETAIL_TABS: TabItem[] = [
  { id: "market", label: "Market" },
  { id: "activity", label: "Activity" },
  { id: "valuation", label: "Valuation", disabled: true },
  { id: "details", label: "Details" },
];

export default function DomainDetailPage() {
  const params = useParams<{ canonicalId: string }>();
  const parsedCanonicalId = parseCanonicalId(params.canonicalId);
  // Hooks below must run unconditionally (rules of hooks), so an invalid id falls back
  // to 0n — a canonicalId that can never be registered — and the invalid-id message is
  // rendered explicitly further down rather than relying on the generic "doesn't exist"
  // fallthrough, so the user sees the actual bad value they navigated to.
  const canonicalId = parsedCanonicalId ?? 0n;
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { registry, orderManager } = useContractAddresses();
  const network = useCurrentNetwork();
  const [relistPrice, setRelistPrice] = useState("");
  const [tab, setTab] = useState("market");

  const { data, isError: readsError, refetch } = useReadContracts({
    contracts: [
      { address: orderManager, abi: orderManagerAbi, functionName: "orders", args: [canonicalId] },
      { address: orderManager, abi: orderManagerAbi, functionName: "diff", args: [canonicalId] },
      { address: registry, abi: registryAbi, functionName: "nameOf", args: [canonicalId] },
      { address: registry, abi: registryAbi, functionName: "resolverOf", args: [canonicalId] },
    ],
    query: { refetchInterval: 3000 },
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const order = data?.[0]?.result;
  const diff = data?.[1]?.result;
  const name = data?.[2]?.result as string | undefined;
  const resolver = data?.[3]?.result as string | undefined;

  const subnameCount = useSubnameCount(canonicalId);
  const activity = useNameActivity(canonicalId);

  if (parsedCanonicalId === null) {
    return (
      <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-8">
        <Link href="/domains" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to explore
        </Link>
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            This name doesn&apos;t exist.
          </p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            &quot;{params.canonicalId}&quot; is not a valid domain id.
          </p>
        </div>
      </main>
    );
  }

  if (readsError) {
    return (
      <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-8">
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            Couldn&apos;t load this name.
          </p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            The on-chain read failed — check your connection and try again.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-5 h-10 rounded-[var(--radius-2)] border px-5 font-mono text-sm"
            style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!order || name === undefined) return <main className="p-8 font-mono text-sm text-[var(--fg-dim)]">Loading…</main>;

  const [seller, price, , , , status] = order as readonly [
    `0x${string}`,
    bigint,
    `0x${string}`,
    `0x${string}`,
    `0x${string}`,
    number,
  ];

  // A mapping read for a canonicalId that was never registered/listed still returns a
  // valid zero-value struct (not a revert) — nameOf() returning "" is the actual signal
  // that nothing real exists at this id, and OrderStatus.None means it was never listed.
  // Without this guard the page below would render a fully actionable listing (Owner
  // 0x0…0, Price 0 ETH) for any mistyped or guessed id.
  if (!name || status === OrderStatus.None) {
    return (
      <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-8">
        <Link href="/domains" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to explore
        </Link>
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            {!name ? "This name doesn't exist." : "This name isn't listed for sale."}
          </p>
          <p className="mt-2 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
            {!name
              ? `No name is registered at canonical id ${canonicalId.toString()}.`
              : "It hasn't been listed on the marketplace yet."}
          </p>
        </div>
      </main>
    );
  }

  const isSeller = address?.toLowerCase() === seller.toLowerCase();
  const busy = isPending || isConfirming;

  const withWallet = (fn: () => void) => () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    fn();
  };

  const buy = withWallet(() =>
    writeContract({ address: orderManager, abi: orderManagerAbi, functionName: "buy", args: [canonicalId], value: price })
  );
  const cancel = withWallet(() =>
    writeContract({ address: orderManager, abi: orderManagerAbi, functionName: "cancel", args: [canonicalId] })
  );
  const relist = withWallet(() => {
    if (!isPositiveNumber(relistPrice)) return;
    writeContract({
      address: orderManager,
      abi: orderManagerAbi,
      functionName: "relist",
      args: [canonicalId, parseEther(relistPrice)],
    });
  });
  const acceptDiffAndBuy = withWallet(() => {
    if (!diff) return;
    const [, , liveOwner, liveResolver] = diff as readonly [string, string, string, string, boolean];
    const expectedHash = computeStateHash(liveOwner as `0x${string}`, liveResolver as `0x${string}`);
    writeContract({
      address: orderManager,
      abi: orderManagerAbi,
      functionName: "acceptDiffAndRefill",
      args: [canonicalId, expectedHash],
      value: price,
    });
  });

  return (
    <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-8">
      <Link href="/domains" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to explore
      </Link>

      {/* items-stretch (the grid default) rather than items-start: makes the right
          column's grid cell match the left column's height instead of shrinking to
          its own content, so the right column's flex-1 tab panels below have
          somewhere to grow into and don't leave a bare void under a short tab body. */}
      <div className="grid grid-cols-1 gap-9 lg:grid-cols-[420px_1fr]">
        {/* left card */}
        <div className="lg:sticky lg:top-[108px]">
          <div className="overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            <div
              className="flex aspect-square flex-col justify-between p-7"
              style={{ background: gradientFor(canonicalId) }}
            >
              <div
                style={{ width: 40, height: 58, background: "rgba(255,255,255,0.95)", clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }}
              />
              <div
                className="font-sans text-[46px] font-bold break-all text-white"
                style={{ letterSpacing: "-0.02em", textShadow: "0 2px 20px rgba(0,0,0,0.25)" }}
              >
                {name ?? canonicalId.toString()}
              </div>
            </div>
          </div>

          {status === OrderStatus.Active && !isSeller && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={buy}
                disabled={busy}
                className="btn-cta h-[52px] flex-1 rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-50"
                style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
              >
                {busy ? "Confirming…" : `Buy now · ${formatEther(price)} ETH`}
              </button>
              <button
                className="flex h-[52px] w-[52px] items-center justify-center rounded-[var(--radius-2)] border"
                style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
                title="Watchlist — coming soon"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                </svg>
              </button>
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            {[
              { k: "Owner", v: shortAddr(seller as `0x${string}`) },
              { k: "Chain", v: "Namechain · ENSv2 (local)" },
              { k: "Price", v: `${formatEther(price)} ETH` },
            ].map((m) => (
              <div key={m.k} className="flex items-center justify-between border-b px-[18px] py-3.5" style={{ borderColor: "var(--line)" }}>
                <span className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                  {m.k}
                </span>
                <span className="font-mono text-[13px]" style={{ color: "var(--fg)" }}>
                  {m.v}
                </span>
              </div>
            ))}
          </div>

          <div
            className="mt-5 rounded-[var(--radius-3)] border p-[18px]"
            style={{ borderColor: "rgba(32,197,217,0.3)", background: "rgba(32,197,217,0.05)" }}
          >
            <div className="flex items-center justify-between">
              <span className="font-[var(--font-display)] text-[22px] font-light tracking-[var(--tracking-snug)]">
                {subnameCount} subname{subnameCount === 1 ? "" : "s"}
              </span>
              <span
                className="rounded-[5px] border px-2 py-[3px] font-mono text-[10px] tracking-[0.04em] uppercase"
                style={{ color: "var(--brand)", borderColor: "rgba(32,197,217,0.4)" }}
              >
                ENSv2 · real
              </span>
            </div>
            <div className="mt-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
              Issue and lease subnames — real, working rental contract.{" "}
              <Link href="/subnames" style={{ color: "var(--brand)" }}>
                Browse subnames →
              </Link>
            </div>
          </div>
        </div>

        {/* right column — fills the remaining grid track (rather than capping at a
            fixed max-width) so the two-column block spans the same width as the
            header/nav above it instead of leaving a dead strip on the right at wide
            viewports.
            Top-aligned with the left column (see grid className above): this used to
            be vertically centered against the left column instead, but the tab bar
            sits at the very top of this column, so re-centering it every time a
            shorter or taller tab body was selected made the tab row (and everything
            below it) jump up/down by however much the content height changed between
            tabs — jarring on every click. Top-aligning trades a shorter permanent gap
            under the left column for a fixed, stable position for the tabs. */}
        <div className="flex flex-col">
          <Tabs items={DETAIL_TABS} active={tab} onChange={setTab} />

          {tab === "market" && (
            <div className="flex flex-1 flex-col gap-5">
              {writeError && (
                <p className="font-mono text-xs" style={{ color: "var(--accent)" }}>
                  {writeError.message.split("\n")[0]}
                </p>
              )}

              {status === OrderStatus.Suspended && diff && (
                <div className="rounded-[var(--radius-3)] border p-6" style={{ borderColor: "rgba(255,134,104,0.4)", background: "rgba(255,134,104,0.08)" }}>
                  <p className="font-sans text-sm font-medium" style={{ color: "var(--accent)" }}>
                    This name&apos;s state changed since it was listed — the order suspended
                    itself instead of silently filling.
                  </p>
                  <DiffTable diff={diff as readonly [string, string, string, string, boolean]} />
                  {!isSeller && (
                    <button
                      onClick={acceptDiffAndBuy}
                      disabled={busy}
                      className="mt-4 h-11 rounded-[var(--radius-2)] px-6 font-sans text-sm font-semibold disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
                    >
                      {busy ? "Confirming…" : "Accept new state and buy anyway"}
                    </button>
                  )}
                </div>
              )}

              {isSeller && (status === OrderStatus.Active || status === OrderStatus.Suspended) && (
                <div className="rounded-[var(--radius-3)] border p-6" style={{ borderColor: "var(--line)" }}>
                  <p className="mb-3 font-sans text-sm font-medium" style={{ color: "var(--fg)" }}>
                    Seller controls
                  </p>
                  <div className="mb-3 flex gap-2">
                    <input
                      value={relistPrice}
                      onChange={(e) => setRelistPrice(e.target.value)}
                      placeholder="New price (ETH)"
                      aria-label="New price in ETH"
                      inputMode="decimal"
                      className="input-field h-11 flex-1 rounded-[8px] border px-3 font-mono text-sm outline-none"
                      style={{
                        borderColor: relistPrice && !isPositiveNumber(relistPrice) ? "var(--color-sinal-danger)" : "var(--line)",
                        background: "rgba(242,244,241,0.04)",
                        color: "var(--fg)",
                      }}
                    />
                    <button
                      onClick={relist}
                      disabled={busy || !isPositiveNumber(relistPrice)}
                      className="h-11 rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium disabled:opacity-50"
                      style={{ background: "var(--fg)", color: "var(--bg)" }}
                    >
                      Relist
                    </button>
                  </div>
                  <button
                    onClick={cancel}
                    disabled={busy}
                    className="h-11 w-full rounded-[var(--radius-2)] border font-sans text-sm disabled:opacity-50"
                    style={{ borderColor: "var(--color-salmao-700)", color: "var(--color-salmao-500)" }}
                  >
                    Cancel listing
                  </button>
                </div>
              )}

              {(status === OrderStatus.Filled || status === OrderStatus.Cancelled) && (
                <p className="font-mono text-sm" style={{ color: "var(--fg-muted)" }}>
                  {status === OrderStatus.Filled ? "This name has been sold." : "This listing was cancelled."}
                </p>
              )}

              <ComingSoonPanel title="Offers" description="Standing offers on unlisted names aren't live yet — grant scope." grow />
            </div>
          )}

          {tab === "activity" && (
            <div className="flex-1 overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
              {activity.length === 0 && (
                <p className="p-6 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
                  No activity yet.
                </p>
              )}
              {activity.map((a, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[130px_1fr_160px] items-center gap-3 border-b px-5 py-4"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: a.color }}>
                    {a.event}
                  </span>
                  <span className="font-mono text-sm" style={{ color: "var(--fg)" }}>
                    {a.detail}
                  </span>
                  <span className="text-right font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
                    {new Date(a.at * 1000).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === "valuation" && (
            <ComingSoonPanel
              title="Estimated value"
              description="Valuation modeling from comparable sales isn't live yet — no real pricing data source exists for this PoC."
              grow
            />
          )}

          {tab === "details" && (
            <div className="flex-1 overflow-hidden rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
              {[
                { k: "Token standard", v: "ERC-721-style" },
                {
                  k: "Registry",
                  v:
                    network === Network.Sepolia
                      ? "Mock ENSv2 registry (Sepolia testnet — not the real ENSv2 registry)"
                      : "Mock ENSv2 registry (local Anvil)",
                },
                { k: "Canonical ID", v: shortId(canonicalId.toString()), full: canonicalId.toString() },
                { k: "Resolver", v: resolver ? shortAddr(resolver as `0x${string}`) : "—" },
                { k: "Subnames", v: `${subnameCount} issued` },
                { k: "Category", v: "—" },
              ].map((d) => (
                <div key={d.k} className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
                  <span className="font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                    {d.k}
                  </span>
                  <span className="font-mono text-[13px]" style={{ color: "var(--fg)" }} title={d.full}>
                    {d.v}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function DiffTable({ diff }: { diff: readonly [string, string, string, string, boolean] }) {
  const [pinnedOwner, pinnedResolver, liveOwner, liveResolver] = diff;
  const ownerChanged = pinnedOwner.toLowerCase() !== liveOwner.toLowerCase();
  const resolverChanged = pinnedResolver.toLowerCase() !== liveResolver.toLowerCase();
  return (
    <table className="mt-3 w-full font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
      <thead>
        <tr className="text-left" style={{ color: "var(--fg-dim)" }}>
          <th className="pr-2 font-normal">Field</th>
          <th className="pr-2 font-normal">At listing</th>
          <th className="font-normal">Now</th>
        </tr>
      </thead>
      <tbody>
        <DiffRow label="Owner" before={pinnedOwner} after={liveOwner} changed={ownerChanged} />
        <DiffRow label="Resolver" before={pinnedResolver} after={liveResolver} changed={resolverChanged} />
      </tbody>
    </table>
  );
}

function DiffRow({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <tr style={changed ? { background: "rgba(255,134,104,0.1)" } : undefined}>
      <td className="pr-2 py-1.5 align-middle">
        <span className="flex items-center gap-1.5">
          {changed && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {/* Warning triangle, not a checkmark — this row flags a risky
                  state change, not a confirmed/good value. */}
              <path d="M12 3 22 20 2 20Z" />
              <path d="M12 9v5" />
              <path d="M12 17.5h.01" />
            </svg>
          )}
          {label}
        </span>
      </td>
      <td className="pr-2 py-1.5" style={changed ? { color: "var(--fg-muted)", textDecoration: "line-through" } : undefined}>
        {shortAddr(before as `0x${string}`)}
      </td>
      <td className="py-1.5" style={changed ? { color: "var(--accent)", fontWeight: 600 } : undefined}>
        {shortAddr(after as `0x${string}`)}
      </td>
    </tr>
  );
}
