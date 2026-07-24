"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { REGISTRY_ADDRESS, registryAbi } from "@/lib/contracts";
import { nameToCanonicalId, subnameToCanonicalId } from "@/lib/canonicalId";
import { isZeroAddress, shortAddr } from "@/lib/format";
import { gradientFor } from "@/components/NameCard";

export default function RegisterSubnamePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [parentName, setParentName] = useState("");
  const [label, setLabel] = useState("");

  const parentId = parentName ? nameToCanonicalId(parentName) : undefined;

  const { data: parentOwner } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "ownerOf",
    args: parentId !== undefined ? [parentId] : undefined,
    query: { enabled: parentId !== undefined },
  });

  const subnameId = parentId !== undefined && label ? subnameToCanonicalId(parentId, label) : undefined;

  const { data: subnameOwner } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "ownerOf",
    args: subnameId !== undefined ? [subnameId] : undefined,
    query: { enabled: subnameId !== undefined },
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isConfirming;

  useEffect(() => {
    if (isSuccess && subnameId !== undefined) {
      router.push(`/subnames/${subnameId.toString()}`);
    }
  }, [isSuccess, subnameId, router]);

  const isOwnerOfParent = parentOwner && address && (parentOwner as string).toLowerCase() === address.toLowerCase();
  const alreadyExists = subnameOwner !== undefined && !isZeroAddress(subnameOwner as `0x${string}`);

  const register = () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (parentId === undefined || !address) return;
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "registerSubname",
      args: [parentId, label, address],
    });
  };

  return (
    <main className="mx-auto max-w-[1120px] animate-[fadeIn_0.2s_var(--ease-out)] p-8 pt-12">
      <div className="mb-3 font-mono text-[11px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--color-profundo-300)" }}>
        Announce a subname
      </div>
      <h1 className="mb-10 font-[var(--font-display)] text-[56px] font-light tracking-[var(--tracking-snug)]" style={{ color: "var(--fg)" }}>
        Register a <span className="font-[var(--font-display-italic)] italic">subname</span>
      </h1>

      <div className="grid grid-cols-[1fr_360px] items-start gap-10">
        <div>
          <div className="mb-3 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
            Parent name and label
          </div>
          <div className="mb-9 flex flex-col gap-3">
            <input
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Parent name, e.g. alice.eth"
              className="h-12 rounded-[8px] border px-4 font-mono text-sm outline-none"
              style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label, e.g. shop"
              className="h-12 rounded-[8px] border px-4 font-mono text-sm outline-none"
              style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
            />
          </div>

          {parentId !== undefined && parentOwner !== undefined && (
            <div className="rounded-[var(--radius-3)] border p-5 font-mono text-sm" style={{ borderColor: "var(--line)" }}>
              {isZeroAddress(parentOwner as `0x${string}`) && (
                <p style={{ color: "var(--fg-dim)" }}>Parent name isn&apos;t registered yet.</p>
              )}
              {!isZeroAddress(parentOwner as `0x${string}`) && !isOwnerOfParent && (
                <p style={{ color: "var(--fg-dim)" }}>Parent owned by {shortAddr(parentOwner as `0x${string}`)}, not you.</p>
              )}
              {isOwnerOfParent && !label && <p style={{ color: "var(--fg-dim)" }}>Enter a label to register under this parent.</p>}
              {isOwnerOfParent && label && alreadyExists && <p style={{ color: "var(--fg-dim)" }}>This subname already exists.</p>}
              {isOwnerOfParent && label && !alreadyExists && (
                <p style={{ color: "var(--brand)" }}>Ready to register {label}.{parentName} →</p>
              )}
            </div>
          )}
          {writeError && (
            <p className="mt-3 font-mono text-xs" style={{ color: "var(--accent)" }}>
              {writeError.message.split("\n")[0]}
            </p>
          )}
        </div>

        {/* preview — mirrors /domains/list's create-flow layout so this
            sibling "create" page doesn't read as unfinished next to it. */}
        <div className="sticky top-[108px] rounded-[var(--radius-3)] border p-6" style={{ borderColor: "var(--line)" }}>
          <div className="mb-4 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--color-profundo-300)" }}>
            Preview
          </div>
          <div
            className="flex aspect-square flex-col justify-between rounded-xl p-5"
            style={{ background: subnameId !== undefined ? gradientFor(subnameId) : "var(--bg-raised)" }}
          >
            <div
              style={{ width: 26, height: 38, background: "rgba(255,255,255,0.95)", clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }}
            />
            <div className="font-sans text-2xl font-bold break-all text-white">
              {label && parentName ? `${label}.${parentName}` : "—"}
            </div>
          </div>
          <div className="mt-4 flex justify-between font-mono text-xs">
            <span style={{ color: "var(--fg-dim)" }}>Settles on</span>
            <span style={{ color: "var(--brand)" }}>Namechain (local)</span>
          </div>
          <div className="mt-2.5 flex justify-between font-mono text-xs">
            <span style={{ color: "var(--fg-dim)" }}>Admin role</span>
            <span style={{ color: "var(--fg)" }}>Granted to your address</span>
          </div>
          <button
            onClick={register}
            disabled={busy || !parentId || !label || (isConnected && (!isOwnerOfParent || alreadyExists))}
            className="mt-6 h-[52px] w-full rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-40"
            style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
          >
            {busy ? "Registering…" : "Register subname"}
          </button>
          <div className="mt-3 text-center font-mono text-[11px] leading-[1.5]" style={{ color: "var(--fg-dim)" }}>
            Signed with your wallet. No expiry tracking in this PoC.
          </div>
        </div>
      </div>
    </main>
  );
}
