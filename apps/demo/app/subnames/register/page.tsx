"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { REGISTRY_ADDRESS, registryAbi } from "@/lib/contracts";
import { nameToCanonicalId, subnameToCanonicalId } from "@/lib/canonicalId";
import { isZeroAddress, shortAddr } from "@/lib/format";

export default function RegisterSubnamePage() {
  const router = useRouter();
  const { address } = useAccount();
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

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && subnameId !== undefined) {
      router.push(`/subnames/${subnameId.toString()}`);
    }
  }, [isSuccess, subnameId, router]);

  const isOwnerOfParent = parentOwner && address && (parentOwner as string).toLowerCase() === address.toLowerCase();
  const alreadyExists = subnameOwner !== undefined && !isZeroAddress(subnameOwner as `0x${string}`);

  const register = () => {
    if (parentId === undefined || !address) return;
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "registerSubname",
      args: [parentId, label, address],
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Register a subname</h1>

      <input
        value={parentName}
        onChange={(e) => setParentName(e.target.value)}
        placeholder="Parent name, e.g. alice.eth"
        className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label, e.g. shop"
        className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
      />

      {parentId !== undefined && parentOwner !== undefined && (
        <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
          {isZeroAddress(parentOwner as `0x${string}`) && <p className="text-gray-500">Parent name isn&apos;t registered yet.</p>}
          {!isZeroAddress(parentOwner as `0x${string}`) && !isOwnerOfParent && (
            <p className="text-gray-500">Parent owned by {shortAddr(parentOwner as `0x${string}`)}, not you.</p>
          )}
          {isOwnerOfParent && label && alreadyExists && <p className="text-gray-500">This subname already exists.</p>}
          {isOwnerOfParent && label && !alreadyExists && (
            <button onClick={register} disabled={isPending} className="rounded-md bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">
              {isPending ? "Registering…" : `Register ${label}.${parentName}`}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
