"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ORDER_MANAGER_ADDRESS, REGISTRY_ADDRESS, orderManagerAbi, registryAbi } from "@/lib/contracts";
import { nameToCanonicalId } from "@/lib/canonicalId";
import { isZeroAddress, shortAddr } from "@/lib/format";

type Step = "idle" | "registering" | "approving" | "listing";

export default function ListDomainPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [step, setStep] = useState<Step>("idle");

  const canonicalId = name ? nameToCanonicalId(name) : undefined;

  const { data: owner, refetch: refetchOwner } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "ownerOf",
    args: canonicalId !== undefined ? [canonicalId] : undefined,
    query: { enabled: canonicalId !== undefined },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!isSuccess || step === "idle") return;
    if (step === "registering") {
      refetchOwner();
      setStep("idle");
    } else if (step === "approving") {
      if (!canonicalId) return;
      writeContract({
        address: ORDER_MANAGER_ADDRESS,
        abi: orderManagerAbi,
        functionName: "list",
        args: [canonicalId, parseEther(price || "0")],
      });
      setStep("listing");
    } else if (step === "listing") {
      setStep("idle");
      router.push(`/domains/${canonicalId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const busy = isPending || step === "approving" || step === "listing";
  const isOwnedByMe = owner && address && (owner as string).toLowerCase() === address.toLowerCase();
  const isUnregistered = isZeroAddress(owner as `0x${string}` | undefined);

  const register = () => {
    if (!address) return;
    setStep("registering");
    writeContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "register", args: [name, address] });
  };

  const listForSale = () => {
    if (!canonicalId) return;
    setStep("approving");
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "approveTransfer",
      args: [canonicalId, ORDER_MANAGER_ADDRESS],
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">List a domain</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. charlie.eth"
        className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
      />

      {canonicalId !== undefined && owner !== undefined && (
        <div className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
          {isUnregistered && (
            <>
              <p className="mb-2 text-gray-500">Not registered yet.</p>
              <button
                onClick={register}
                disabled={busy || !address}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
              >
                {step === "registering" ? "Registering…" : "Register to my address"}
              </button>
            </>
          )}

          {!isUnregistered && isOwnedByMe && (
            <>
              <p className="mb-2 text-gray-500">You own this name.</p>
              <div className="flex gap-2">
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Price (ETH)"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 dark:border-gray-700 dark:bg-transparent"
                />
                <button
                  onClick={listForSale}
                  disabled={busy || !price}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
                >
                  {step === "approving" ? "Approving…" : step === "listing" ? "Listing…" : "List for sale"}
                </button>
              </div>
            </>
          )}

          {!isUnregistered && !isOwnedByMe && (
            <p className="text-gray-500">Owned by {shortAddr(owner as `0x${string}`)} — not available to list.</p>
          )}
        </div>
      )}
    </main>
  );
}
