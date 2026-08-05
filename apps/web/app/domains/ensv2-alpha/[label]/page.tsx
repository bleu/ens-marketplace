"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { isAddress, zeroAddress } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import {
  ENSV2_ALPHA_ETH_REGISTRAR,
  ENSV2_ALPHA_ETH_REGISTRY,
  ENSV2_ALPHA_FROM_BLOCK,
  RegistryStatus,
  ethRegistrarAbi,
  ethRegistryAbi,
} from "@/lib/ensv2-alpha";
import { getContractEventsChunked } from "@/lib/events";
import { shortAddr } from "@/lib/format";
import { gradientFor } from "@/components/NameCard";
import { StatusBadge } from "@/components/StatusBadge";

interface ActivityItem {
  event: string;
  color: string;
  detail: string;
  txHash: string;
}

function statusLabel(status: number | undefined): { label: string; variant: "active" | "suspended" | "neutral" } {
  switch (status) {
    case RegistryStatus.Registered:
      return { label: "Registered", variant: "active" };
    case RegistryStatus.Reserved:
      return { label: "Reserved", variant: "neutral" };
    default:
      return { label: "Available", variant: "neutral" };
  }
}

export default function EnsV2AlphaDetailPage() {
  const params = useParams<{ label: string }>();
  const label = decodeURIComponent(params.label);
  // Explicit chainId throughout — always Sepolia regardless of the connected wallet's
  // actual chain (see lib/ensv2-alpha.ts's useEnsV2AlphaRegisteredNames for why).
  const client = usePublicClient({ chainId: sepolia.id });

  const { data: tokenId, isError: tokenIdError } = useReadContract({
    address: ENSV2_ALPHA_ETH_REGISTRY,
    abi: ethRegistryAbi,
    functionName: "findTokenId",
    args: [label],
    chainId: sepolia.id,
  });

  const { data, isLoading, isError: readsError } = useReadContracts({
    contracts: [
      { address: ENSV2_ALPHA_ETH_REGISTRY, abi: ethRegistryAbi, functionName: "getStatus", args: [tokenId ?? 0n], chainId: sepolia.id } as const,
      { address: ENSV2_ALPHA_ETH_REGISTRY, abi: ethRegistryAbi, functionName: "getResolver", args: [label], chainId: sepolia.id } as const,
      { address: ENSV2_ALPHA_ETH_REGISTRY, abi: ethRegistryAbi, functionName: "getSubregistry", args: [label], chainId: sepolia.id } as const,
      { address: ENSV2_ALPHA_ETH_REGISTRY, abi: ethRegistryAbi, functionName: "getExpiry", args: [tokenId ?? 0n], chainId: sepolia.id } as const,
      { address: ENSV2_ALPHA_ETH_REGISTRY, abi: ethRegistryAbi, functionName: "getOwner", args: [tokenId ?? 0n], chainId: sepolia.id } as const,
    ],
    query: { enabled: tokenId !== undefined },
  });

  const [status, resolver, subregistry, expiry, owner] = data?.map((d) => d.result) ?? [];

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = useState(false);

  const refreshActivity = useCallback(async () => {
    if (!client || tokenId === undefined) return;
    try {
      const [registered, renewed, resolverUpdated, expiryUpdated, regeneratedFrom, regeneratedTo, unregistered] = await Promise.all([
        getContractEventsChunked(client, {
          address: ENSV2_ALPHA_ETH_REGISTRAR,
          abi: ethRegistrarAbi,
          eventName: "NameRegistered",
          fromBlock: ENSV2_ALPHA_FROM_BLOCK,
        }),
        getContractEventsChunked(client, { address: ENSV2_ALPHA_ETH_REGISTRAR, abi: ethRegistrarAbi, eventName: "NameRenewed", fromBlock: ENSV2_ALPHA_FROM_BLOCK }),
        getContractEventsChunked(client, {
          address: ENSV2_ALPHA_ETH_REGISTRY,
          abi: ethRegistryAbi,
          eventName: "ResolverUpdated",
          args: { tokenId },
          fromBlock: ENSV2_ALPHA_FROM_BLOCK,
        }),
        getContractEventsChunked(client, {
          address: ENSV2_ALPHA_ETH_REGISTRY,
          abi: ethRegistryAbi,
          eventName: "ExpiryUpdated",
          args: { tokenId },
          fromBlock: ENSV2_ALPHA_FROM_BLOCK,
        }),
        getContractEventsChunked(client, {
          address: ENSV2_ALPHA_ETH_REGISTRY,
          abi: ethRegistryAbi,
          eventName: "TokenRegenerated",
          args: { oldTokenId: tokenId },
          fromBlock: ENSV2_ALPHA_FROM_BLOCK,
        }),
        getContractEventsChunked(client, {
          address: ENSV2_ALPHA_ETH_REGISTRY,
          abi: ethRegistryAbi,
          eventName: "TokenRegenerated",
          args: { newTokenId: tokenId },
          fromBlock: ENSV2_ALPHA_FROM_BLOCK,
        }),
        getContractEventsChunked(client, {
          address: ENSV2_ALPHA_ETH_REGISTRY,
          abi: ethRegistryAbi,
          eventName: "LabelUnregistered",
          args: { tokenId },
          fromBlock: ENSV2_ALPHA_FROM_BLOCK,
        }),
      ]);

      const registeredForThis = registered.filter((log) => log.args.tokenId === tokenId);
      const renewedForThis = renewed.filter((log) => log.args.tokenId === tokenId);

      const items: ActivityItem[] = [
        ...registeredForThis.map((log) => ({
          event: "Registered",
          color: "var(--brand)",
          detail: `${log.args.label} · ${Number(log.args.duration)}s term`,
          txHash: log.transactionHash ?? "",
        })),
        ...renewedForThis.map((log) => ({
          event: "Renewed",
          color: "var(--brand)",
          detail: `new expiry ${new Date(Number(log.args.newExpiry) * 1000).toLocaleDateString()}`,
          txHash: log.transactionHash ?? "",
        })),
        ...resolverUpdated.map((log) => ({
          event: "Resolver changed",
          color: "var(--accent)",
          detail: shortAddr(log.args.resolver),
          txHash: log.transactionHash ?? "",
        })),
        ...expiryUpdated.map((log) => ({
          event: "Expiry updated",
          color: "var(--fg-muted)",
          detail: new Date(Number(log.args.newExpiry) * 1000).toLocaleDateString(),
          txHash: log.transactionHash ?? "",
        })),
        ...regeneratedFrom.map((log) => ({
          event: "Token regenerated (this ID retired)",
          color: "var(--color-sinal-danger)",
          detail: `→ new tokenId ${log.args.newTokenId}`,
          txHash: log.transactionHash ?? "",
        })),
        ...regeneratedTo.map((log) => ({
          event: "Token regenerated (became this ID)",
          color: "var(--color-sinal-danger)",
          detail: `from tokenId ${log.args.oldTokenId}`,
          txHash: log.transactionHash ?? "",
        })),
        ...unregistered.map(() => ({ event: "Unregistered", color: "var(--fg-muted)", detail: "—", txHash: "" })),
      ];
      setActivity(items);
      setActivityError(false);
    } catch (err) {
      console.error("EnsV2AlphaDetailPage: failed to scan activity events", err);
      setActivityError(true);
    }
  }, [client, tokenId]);

  useEffect(() => {
    refreshActivity();
  }, [refreshActivity]);

  if (tokenIdError) {
    return (
      <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-4 lg:p-8">
        <BackLink />
        <div className="rounded-[var(--radius-3)] border p-10 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="font-[var(--font-display)] text-2xl font-light" style={{ color: "var(--fg)" }}>
            Couldn&apos;t read this name from the real ENSv2 alpha registry.
          </p>
        </div>
      </main>
    );
  }

  if (tokenId === undefined || (isLoading && !data)) {
    return <main className="p-4 font-mono text-sm text-[var(--fg-dim)] lg:p-8">Loading…</main>;
  }

  const badge = statusLabel(status as number | undefined);
  const isUnregistered = status === RegistryStatus.Available;

  return (
    <main className="mx-auto max-w-[1400px] animate-[fadeIn_0.2s_var(--ease-out)] p-4 lg:p-8">
      <BackLink />

      <div className="grid grid-cols-1 gap-9 lg:grid-cols-[420px_1fr]">
        <div className="lg:sticky lg:top-[108px]">
          <div
            className="mb-6 flex aspect-square flex-col justify-between rounded-2xl p-8"
            style={{ background: gradientFor(tokenId) }}
          >
            <div style={{ width: 40, height: 58, background: "rgba(255,255,255,0.95)", clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
            <div className="font-sans text-3xl font-bold break-all text-white">{label}</div>
          </div>
          <div className="flex items-center justify-between font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
            <span>Real ENSv2 · Sepolia Alpha</span>
            <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
          </div>
        </div>

        <div>
          <h1 className="mb-6 font-[var(--font-display)] text-[40px] font-light tracking-[var(--tracking-snug)]" style={{ color: "var(--fg)" }}>
            {label}
          </h1>

          {readsError && (
            <p className="mb-6 font-mono text-sm" style={{ color: "var(--accent)" }}>
              Couldn&apos;t read this name&apos;s full state — some fields below may be missing.
            </p>
          )}

          {isUnregistered ? (
            <div className="mb-9 rounded-[var(--radius-3)] border p-8 text-center" style={{ borderColor: "var(--line)" }}>
              <p className="mb-4 font-mono text-sm" style={{ color: "var(--fg-muted)" }}>
                Not registered on the real ENSv2 alpha yet.
              </p>
              <Link
                href="/domains/ensv2-alpha/register"
                className="inline-flex h-11 items-center rounded-[var(--radius-2)] px-5 font-sans text-sm font-semibold"
                style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
              >
                Register it for real
              </Link>
            </div>
          ) : (
            <div className="mb-9 grid grid-cols-2 gap-4">
              <DetailField label="Token ID" value={tokenId.toString()} mono />
              <DetailField label="Owner" value={owner && isAddress(owner as string) ? shortAddr(owner as `0x${string}`) : "—"} mono />
              <DetailField
                label="Expiry"
                value={expiry ? new Date(Number(expiry) * 1000).toLocaleDateString() : "—"}
              />
              <DetailField
                label="Resolver"
                value={resolver && resolver !== zeroAddress ? shortAddr(resolver as `0x${string}`) : "Not set"}
                mono
              />
              <DetailField
                label="Subregistry"
                value={subregistry && subregistry !== zeroAddress ? shortAddr(subregistry as `0x${string}`) : "None"}
                mono
              />
              <DetailField label="Registry" value="ENS Labs' real ENSv2 alpha (Sepolia)" />
            </div>
          )}

          <div className="mb-3 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
            Activity — real on-chain events
          </div>
          <div className="rounded-[var(--radius-3)] border" style={{ borderColor: "var(--line)" }}>
            {activityError && (
              <p className="p-6 font-mono text-sm" style={{ color: "var(--accent)" }}>
                Couldn&apos;t load activity — the event scan failed.
              </p>
            )}
            {!activityError && activity.length === 0 && (
              <p className="p-6 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
                No activity yet.
              </p>
            )}
            {!activityError &&
              activity.map((item, i) => (
                <div
                  key={`${item.txHash}-${i}`}
                  className="flex items-center justify-between border-b p-4 last:border-b-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="font-sans text-sm font-medium" style={{ color: item.color }}>
                    {item.event}
                  </span>
                  <span className="font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
                    {item.detail}
                  </span>
                </div>
              ))}
          </div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
            &quot;Token regenerated&quot; is the real ENSv2 mechanic our own marketplace&apos;s
            suspend-on-mutation design anticipated — a resolver/owner change that requires
            regeneration retires the old token ID entirely rather than silently keeping it valid.
          </p>
        </div>
      </div>
    </main>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[10px] border p-4" style={{ borderColor: "var(--line)" }}>
      <div className="mb-1.5 font-mono text-[10px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
        {label}
      </div>
      <div className={mono ? "font-mono text-sm" : "font-sans text-sm"} style={{ color: "var(--fg)" }}>
        {value}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/domains" className="mb-6 inline-flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="m15 18-6-6 6-6" />
      </svg>
      Back to Explore
    </Link>
  );
}
