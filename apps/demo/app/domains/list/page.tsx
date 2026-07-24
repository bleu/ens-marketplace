"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ORDER_MANAGER_ADDRESS, REGISTRY_ADDRESS, orderManagerAbi, registryAbi } from "@/lib/contracts";
import { nameToCanonicalId } from "@/lib/canonicalId";
import { isPositiveNumber, isZeroAddress, shortAddr } from "@/lib/format";
import { useOwnedNames } from "@/lib/events";
import { NameCard, gradientFor } from "@/components/NameCard";
import { ComingSoon } from "@/components/ComingSoon";

type Step = "idle" | "registering" | "approving" | "listing";

export default function ListDomainPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const owned = useOwnedNames(address);

  const [selectedId, setSelectedId] = useState<bigint | undefined>();
  const [registerName, setRegisterName] = useState("");
  const [price, setPrice] = useState("");
  const [step, setStep] = useState<Step>("idle");

  const canonicalId = selectedId ?? (registerName ? nameToCanonicalId(registerName) : undefined);
  const selectedName = owned.find((o) => o.canonicalId === selectedId)?.name ?? registerName;

  const { data: owner, refetch: refetchOwner } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "ownerOf",
    args: canonicalId !== undefined ? [canonicalId] : undefined,
    query: { enabled: canonicalId !== undefined },
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isSuccess, isError: isReceiptError, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!isSuccess || step === "idle") return;
    if (step === "registering") {
      refetchOwner();
      setStep("idle");
    } else if (step === "approving") {
      if (!canonicalId || !isPositiveNumber(price)) {
        setStep("idle");
        return;
      }
      writeContract({
        address: ORDER_MANAGER_ADDRESS,
        abi: orderManagerAbi,
        functionName: "list",
        args: [canonicalId, parseEther(price)],
      });
      setStep("listing");
    } else if (step === "listing") {
      setStep("idle");
      router.push(`/domains/${canonicalId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  // A rejected wallet signature or a reverted/failed transaction never fires
  // `isSuccess`, so without this the effect above never runs and `step` (and therefore
  // `busy`) would stay stuck forever with no way to retry short of a page reload.
  useEffect(() => {
    if ((writeError || isReceiptError) && step !== "idle") {
      setStep("idle");
    }
  }, [writeError, isReceiptError, step]);

  const busy = isPending || isConfirming || step !== "idle";
  const isOwnedByMe = owner && address && (owner as string).toLowerCase() === address.toLowerCase();
  const isUnregistered = isZeroAddress(owner as `0x${string}` | undefined);
  // Gated on `isConnected` — without a connected address there's no "me" to compare
  // the owner against, so asserting "not available" before that's even knowable would
  // be misleading (mirrors the equivalent check on /subnames/register).
  const isNameUnavailable = Boolean(isConnected && registerName && owner !== undefined && !isUnregistered && !isOwnedByMe);

  const register = () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!address || !registerName) return;
    setStep("registering");
    writeContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "register", args: [registerName, address] });
  };

  const listForSale = () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
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
    <main className="mx-auto flex min-h-[calc(100vh-76px)] max-w-[1120px] flex-col animate-[fadeIn_0.2s_var(--ease-out)] p-8 pt-12">
      <div className="mb-3 font-mono text-[11px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--color-profundo-300)" }}>
        Announce a name
      </div>
      <h1 className="mb-10 font-[var(--font-display)] text-[56px] font-light tracking-[var(--tracking-snug)]" style={{ color: "var(--fg)" }}>
        List a name for <span className="font-[var(--font-display-italic)] italic">sale</span>
      </h1>

      {/* Centers the two-column layout in whatever vertical space remains below the
          header instead of always docking it to the top — a short form (1-3 fields)
          otherwise leaves a lopsided void below the shorter column. Grows normally
          (no clipping) when the content is taller than the available space. */}
      <div className="flex flex-1 items-center">
      <div className="grid w-full grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-3 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
            Select a name from your wallet
          </div>
          {owned.length === 0 && (
            <p className="mb-9 font-mono text-sm" style={{ color: "var(--fg-dim)" }}>
              {address ? "No names owned by this wallet yet." : "Connect a wallet to see names you own."}
            </p>
          )}
          <div className="mb-9 grid grid-cols-2 gap-3">
            {owned.map((w) => (
              <button
                key={w.canonicalId.toString()}
                type="button"
                onClick={() => {
                  setSelectedId(w.canonicalId);
                  setRegisterName("");
                }}
                aria-pressed={selectedId === w.canonicalId}
                className="input-field flex w-full cursor-pointer items-center gap-3 rounded-[10px] border p-3 text-left"
                style={{
                  borderColor: selectedId === w.canonicalId ? "var(--brand)" : "var(--line)",
                  background: selectedId === w.canonicalId ? "rgba(32,197,217,0.08)" : "rgba(242,244,241,0.02)",
                }}
              >
                <NameCard canonicalId={w.canonicalId} size={40} />
                <div className="min-w-0">
                  <div className="truncate font-sans text-sm font-semibold" style={{ color: "var(--fg)" }}>
                    {w.name}
                  </div>
                  <div className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    Namechain L2
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mb-3 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
            Or register a new name (PoC helper)
          </div>
          <div
            className="mb-9 rounded-[10px] border p-4"
            style={{ borderColor: isNameUnavailable ? "rgba(206,105,94,0.4)" : "var(--line)" }}
          >
            <input
              value={registerName}
              onChange={(e) => {
                setRegisterName(e.target.value);
                setSelectedId(undefined);
              }}
              placeholder="e.g. charlie.eth"
              aria-label="Name to register"
              className="input-field h-11 w-full rounded-[8px] border px-3 font-mono text-sm outline-none"
              style={{
                borderColor: isNameUnavailable ? "var(--color-sinal-danger)" : "var(--line)",
                background: "rgba(242,244,241,0.04)",
                color: "var(--fg)",
              }}
            />
            {registerName && owner !== undefined && isUnregistered && (
              <button
                onClick={register}
                disabled={busy}
                className="mt-3 h-10 rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
              >
                {step === "registering" ? "Registering…" : "Register to my address"}
              </button>
            )}
            {isNameUnavailable && (
              <p className="mt-3 font-mono text-xs" style={{ color: "var(--color-sinal-danger)" }}>
                Owned by {shortAddr(owner as `0x${string}`)} — not available.
              </p>
            )}
            {!isConnected && registerName && owner !== undefined && !isUnregistered && (
              <p className="mt-3 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
                Connect your wallet to check ownership of this name.
              </p>
            )}
          </div>

          <div className="mb-3 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
            List across marketplaces
          </div>
          <div className="mb-9 flex flex-col gap-2.5">
            <div
              className="flex items-center justify-between rounded-[10px] border p-4"
              style={{ borderColor: "var(--brand)", background: "rgba(242,244,241,0.02)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-[26px] w-[26px] rounded-[6px]"
                  style={{ background: "linear-gradient(135deg,var(--color-aqua-500),var(--color-aqua-700))" }}
                />
                <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
                  Bleu ENS Marketplace
                </span>
                <span className="font-mono text-[11px]" style={{ color: "var(--brand)" }}>
                  0% fee
                </span>
              </div>
              <div
                className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border"
                style={{ background: "var(--brand)", borderColor: "var(--brand)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--brand-ink)" strokeWidth={3}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
            </div>
            <ComingSoon>
              <div className="flex items-center justify-between rounded-[10px] border p-4" style={{ background: "rgba(242,244,241,0.02)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px]" style={{ background: "#1868b7" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff">
                      <circle cx="12" cy="12" r="10" fill="#fff" opacity=".15" />
                      <path d="M12 4a8 8 0 100 16 8 8 0 000-16zm-1 11l-2-3h1.5V9.5h1V12H14l-2 3z" />
                    </svg>
                  </div>
                  <span className="font-sans text-[15px] font-semibold" style={{ color: "var(--fg)" }}>
                    OpenSea
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    2.5% fee
                  </span>
                </div>
                <div className="h-[22px] w-[22px] rounded-[6px] border" style={{ borderColor: "var(--line-strong)" }} />
              </div>
            </ComingSoon>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <div className="mb-2.5 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                Price (ETH)
              </div>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                aria-label="Price in ETH"
                disabled={busy}
                className="input-field h-[52px] w-full rounded-[8px] border px-4 font-mono text-lg outline-none disabled:opacity-50"
                style={{
                  borderColor: price && !isPositiveNumber(price) ? "var(--color-sinal-danger)" : "var(--line)",
                  background: "rgba(242,244,241,0.04)",
                  color: "var(--fg)",
                }}
              />
            </div>
            <div>
              <div className="mb-2.5 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
                Duration
              </div>
              <ComingSoon>
                <div
                  className="flex h-[52px] items-center justify-between rounded-[8px] border px-4 font-mono text-[15px]"
                  style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg-muted)" }}
                >
                  No expiry (PoC)
                </div>
              </ComingSoon>
            </div>
          </div>
        </div>

        {/* preview */}
        <div className="rounded-[var(--radius-3)] border p-6 lg:sticky lg:top-[108px]" style={{ borderColor: "var(--line)" }}>
          <div className="mb-4 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--color-profundo-300)" }}>
            Preview
          </div>
          <div
            className="flex aspect-square flex-col justify-between rounded-xl p-5"
            style={{ background: canonicalId !== undefined ? gradientFor(canonicalId) : "var(--bg-raised)" }}
          >
            <div
              style={{ width: 26, height: 38, background: "rgba(255,255,255,0.95)", clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }}
            />
            <div className="font-sans text-2xl font-bold break-all text-white">{selectedName || "—"}</div>
          </div>
          <div className="mt-4 flex justify-between font-mono text-xs">
            <span style={{ color: "var(--fg-dim)" }}>Settles on</span>
            <span style={{ color: "var(--brand)" }}>Namechain (local)</span>
          </div>
          <div className="mt-2.5 flex justify-between font-mono text-xs">
            <span style={{ color: "var(--fg-dim)" }}>You receive</span>
            <span style={{ color: "var(--fg)" }}>100% — 0% fee</span>
          </div>
          <button
            onClick={listForSale}
            disabled={busy || !canonicalId || !isPositiveNumber(price) || (isConnected && !isOwnedByMe)}
            // opacity-40 faded both the aqua background and the dark label text
            // toward the page's own near-black background at the same rate, so
            // the two nearly disappeared into each other — the disabled label
            // was close to illegible. opacity-70 keeps enough of the aqua fill
            // that the dark text still reads clearly against it.
            className="btn-cta mt-6 h-[52px] w-full rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-70"
            style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
          >
            {step === "approving" ? "Approving…" : step === "listing" ? "Listing…" : "List name"}
          </button>
          <div className="mt-3 text-center font-mono text-[11px] leading-[1.5]" style={{ color: "var(--fg-dim)" }}>
            Signed with your wallet. No expiry tracking in this PoC.
          </div>
          {writeError && (
            <p className="mt-3 text-center font-mono text-[11px]" style={{ color: "var(--accent)" }}>
              {writeError.message.split("\n")[0]}
            </p>
          )}
        </div>
      </div>
      </div>
    </main>
  );
}
