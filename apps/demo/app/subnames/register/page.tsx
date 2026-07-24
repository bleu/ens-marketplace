"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { REGISTRY_ADDRESS, registryAbi } from "@/lib/contracts";
import { nameToCanonicalId, subnameToCanonicalId } from "@/lib/canonicalId";
import { isZeroAddress, shortAddr } from "@/lib/format";

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
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

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
    <main className="mx-auto max-w-lg animate-[fadeIn_0.2s_var(--ease-out)] p-8 pt-12">
      <div className="mb-3 font-mono text-[11px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--color-profundo-300)" }}>
        Announce a subname
      </div>
      <h1 className="mb-8 font-[var(--font-display)] text-4xl font-light tracking-[var(--tracking-snug)]" style={{ color: "var(--fg)" }}>
        Register a <span className="font-[var(--font-display-italic)] italic">subname</span>
      </h1>

      <div className="mb-3 flex flex-col gap-3">
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
          {isOwnerOfParent && label && alreadyExists && <p style={{ color: "var(--fg-dim)" }}>This subname already exists.</p>}
          {isOwnerOfParent && label && !alreadyExists && (
            <button
              onClick={register}
              disabled={isPending}
              className="h-11 rounded-[var(--radius-2)] px-4 font-sans text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
            >
              {isPending ? "Registering…" : `Register ${label}.${parentName}`}
            </button>
          )}
        </div>
      )}
      {writeError && (
        <p className="mt-3 font-mono text-xs" style={{ color: "var(--accent)" }}>
          {writeError.message.split("\n")[0]}
        </p>
      )}
    </main>
  );
}
