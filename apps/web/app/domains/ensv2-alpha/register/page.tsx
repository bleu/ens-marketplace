"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, keccak256, parseUnits, toBytes, toHex, zeroAddress, zeroHash } from "viem";
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  ENSV2_ALPHA_ETH_REGISTRAR,
  ENSV2_ALPHA_PAYMENT_TOKEN,
  ENSV2_ALPHA_PAYMENT_TOKEN_DECIMALS,
  MAX_COMMITMENT_AGE_SECONDS,
  MIN_COMMITMENT_AGE_SECONDS,
  ethRegistrarAbi,
  paymentTokenAbi,
} from "@/lib/ensv2-alpha";
import { isPositiveInteger } from "@/lib/format";
import { gradientFor } from "@/components/NameCard";

type Step = "idle" | "committing" | "waiting" | "approving" | "registering";

const DEFAULT_DURATION_DAYS = 365;
const MIN_DURATION_DAYS = 29; // registrar's MIN_REGISTER_DURATION is 28 days — 29 avoids an off-by-rounding revert.

/// A commitment persists on-chain for up to MAX_COMMITMENT_AGE_SECONDS (24h) — a page
/// reload during the mandatory ~60s wait shouldn't orphan it. Keyed by connected address
/// so switching accounts doesn't resume someone else's in-flight commitment.
interface PersistedCommitment {
  label: string;
  durationDays: string;
  secret: `0x${string}`;
  commitment: `0x${string}`;
}

function storageKey(address: string | undefined): string {
  return `ensv2-alpha-commitment:${address ?? "disconnected"}`;
}

export default function EnsV2AlphaRegisterPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [label, setLabel] = useState("");
  const [durationDays, setDurationDays] = useState(String(DEFAULT_DURATION_DAYS));
  const [secret, setSecret] = useState<`0x${string}` | undefined>();
  const [commitment, setCommitment] = useState<`0x${string}` | undefined>();
  const [step, setStep] = useState<Step>("idle");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const client = usePublicClient({ chainId: sepolia.id });

  // Restores an in-flight commitment (this account, this browser) on mount/reconnect —
  // see PersistedCommitment's doc comment.
  useEffect(() => {
    if (!address) return;
    const raw = sessionStorage.getItem(storageKey(address));
    if (!raw) return;
    try {
      const persisted = JSON.parse(raw) as PersistedCommitment;
      setLabel(persisted.label);
      setDurationDays(persisted.durationDays);
      setSecret(persisted.secret);
      setCommitment(persisted.commitment);
      setStep("waiting");
    } catch {
      sessionStorage.removeItem(storageKey(address));
    }
  }, [address]);

  // Ticks once a second only while actually waiting out the commitment-age timer —
  // no point re-rendering every second in every other step.
  useEffect(() => {
    if (step !== "waiting") return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [step]);

  const durationSeconds = isPositiveInteger(durationDays) ? BigInt(durationDays) * 86400n : undefined;

  // Every call below pins chainId to Sepolia explicitly — this integration is always
  // Sepolia regardless of which chain the connected wallet/wagmi client is actually on
  // (Anvil, the app's default before any wallet connects, has none of these contracts).
  const { data: priceData } = useReadContract({
    address: ENSV2_ALPHA_ETH_REGISTRAR,
    abi: ethRegistrarAbi,
    functionName: "getRegisterPrice",
    args: label && durationSeconds !== undefined ? [label, durationSeconds, ENSV2_ALPHA_PAYMENT_TOKEN] : undefined,
    chainId: sepolia.id,
    query: { enabled: Boolean(label) && durationSeconds !== undefined },
  });
  const totalPrice = priceData ? priceData[0] + priceData[1] : undefined;

  const { data: commitTime, refetch: refetchCommitTime } = useReadContract({
    address: ENSV2_ALPHA_ETH_REGISTRAR,
    abi: ethRegistrarAbi,
    functionName: "commitmentAt",
    args: commitment ? [commitment] : undefined,
    chainId: sepolia.id,
    query: { enabled: Boolean(commitment) && step === "waiting", refetchInterval: 5000 },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ENSV2_ALPHA_PAYMENT_TOKEN,
    abi: paymentTokenAbi,
    functionName: "allowance",
    args: address ? [address, ENSV2_ALPHA_ETH_REGISTRAR] : undefined,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  });

  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: ENSV2_ALPHA_PAYMENT_TOKEN,
    abi: paymentTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isSuccess, isError: isReceiptError, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const secondsWaited = commitTime ? now - Number(commitTime) : 0;
  const canReveal = Boolean(commitTime) && secondsWaited >= MIN_COMMITMENT_AGE_SECONDS;
  const commitmentExpired = Boolean(commitTime) && secondsWaited > MAX_COMMITMENT_AGE_SECONDS;
  const needsApproval = allowance !== undefined && totalPrice !== undefined && allowance < totalPrice;

  const doRegister = useCallback(() => {
    if (!address || !secret || durationSeconds === undefined) return;
    setStep("registering");
    writeContract({
      address: ENSV2_ALPHA_ETH_REGISTRAR,
      abi: ethRegistrarAbi,
      functionName: "register",
      args: [label, address, secret, zeroAddress, zeroAddress, durationSeconds, ENSV2_ALPHA_PAYMENT_TOKEN, zeroHash],
      chainId: sepolia.id,
    });
  }, [address, secret, durationSeconds, label, writeContract]);

  useEffect(() => {
    if (!isSuccess || step === "idle") return;
    if (step === "committing") {
      refetchCommitTime();
      setStep("waiting");
    } else if (step === "approving") {
      refetchAllowance();
      doRegister();
    } else if (step === "registering") {
      if (address) sessionStorage.removeItem(storageKey(address));
      router.push(`/domains/ensv2-alpha/${encodeURIComponent(label)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  // Same reasoning as domains/list/page.tsx: a rejected signature or reverted tx never
  // fires isSuccess, so without this "step" (and "busy") would stay stuck forever.
  useEffect(() => {
    if ((writeError || isReceiptError) && step !== "idle" && step !== "waiting") {
      setStep("waiting");
    }
  }, [writeError, isReceiptError, step]);

  const busy = isPending || isConfirming || step === "committing" || step === "approving" || step === "registering";

  const startCommit = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!address || !label || durationSeconds === undefined || !client) return;
    const newSecret = secret ?? toHex(crypto.getRandomValues(new Uint8Array(32)));
    // Computed imperatively (an actual RPC call at click-time), not via a reactive
    // useReadContract — that read would only ever fire once `secret` was already in
    // state, but `secret` doesn't exist until this very function generates it, so it
    // could never resolve before this point was reached (the button silently did
    // nothing on every first attempt).
    const newCommitment = await client.readContract({
      address: ENSV2_ALPHA_ETH_REGISTRAR,
      abi: ethRegistrarAbi,
      functionName: "makeCommitment",
      args: [label, address, newSecret, zeroAddress, zeroAddress, durationSeconds, zeroHash],
    });
    setSecret(newSecret);
    setCommitment(newCommitment);
    sessionStorage.setItem(
      storageKey(address),
      JSON.stringify({ label, durationDays, secret: newSecret, commitment: newCommitment } satisfies PersistedCommitment),
    );
    setStep("committing");
    writeContract({ address: ENSV2_ALPHA_ETH_REGISTRAR, abi: ethRegistrarAbi, functionName: "commit", args: [newCommitment], chainId: sepolia.id });
  };

  const continueAfterWait = () => {
    if (needsApproval && totalPrice !== undefined) {
      setStep("approving");
      writeContract({
        address: ENSV2_ALPHA_PAYMENT_TOKEN,
        abi: paymentTokenAbi,
        functionName: "approve",
        args: [ENSV2_ALPHA_ETH_REGISTRAR, totalPrice],
        chainId: sepolia.id,
      });
    } else {
      doRegister();
    }
  };

  const mintTestUsdc = () => {
    if (!address) return;
    writeContract({
      address: ENSV2_ALPHA_PAYMENT_TOKEN,
      abi: paymentTokenAbi,
      functionName: "mint",
      args: [parseUnits("1000", ENSV2_ALPHA_PAYMENT_TOKEN_DECIMALS)],
      chainId: sepolia.id,
    });
    setTimeout(refetchBalance, 3000);
  };

  const cancelCommitment = () => {
    if (address) sessionStorage.removeItem(storageKey(address));
    setSecret(undefined);
    setCommitment(undefined);
    setStep("idle");
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-76px)] max-w-[1120px] flex-col animate-[fadeIn_0.2s_var(--ease-out)] p-4 pt-12 lg:p-8 lg:pt-12">
      <div className="mb-3 font-mono text-[11px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--fg-kicker)" }}>
        Real ENSv2 · Sepolia Alpha
      </div>
      <h1 className="mb-6 font-[var(--font-display)] text-[56px] font-light tracking-[var(--tracking-snug)]" style={{ color: "var(--fg)" }}>
        Register a <span className="font-[var(--font-display-italic)] italic">real</span> ENSv2 name
      </h1>

      <div
        className="mb-9 rounded-[var(--radius-3)] border p-5 font-mono text-[12px] leading-relaxed"
        style={{ borderColor: "rgba(var(--danger-rgb),0.4)", background: "rgba(var(--danger-rgb),0.06)", color: "var(--color-sinal-danger)" }}
      >
        These are ENS Labs&apos; pre-audit ENSv2 alpha contracts on Sepolia. They are
        unpublished, have already changed once during this alpha, and may change again
        without notice. Registering spends Sepolia test ETH for gas plus a test USDC token
        — no real-world value, but a real transaction.
      </div>

      <div className="flex flex-1 items-center">
        <div className="grid w-full grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-3 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
              Label
            </div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value.trim().toLowerCase())}
              disabled={step !== "idle"}
              placeholder="e.g. my-real-test-name"
              aria-label="Name label to register"
              className="input-field mb-9 h-12 w-full rounded-[8px] border px-4 font-mono text-sm outline-none disabled:opacity-60"
              style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
            />

            <div className="mb-3 font-mono text-[11px] tracking-[0.04em] uppercase" style={{ color: "var(--fg-dim)" }}>
              Duration (days, min {MIN_DURATION_DAYS})
            </div>
            <input
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              disabled={step !== "idle"}
              placeholder={String(DEFAULT_DURATION_DAYS)}
              aria-label="Registration duration in days"
              inputMode="numeric"
              className="input-field mb-9 h-12 w-full rounded-[8px] border px-4 font-mono text-sm outline-none disabled:opacity-60"
              style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.04)", color: "var(--fg)" }}
            />

            {totalPrice !== undefined && (
              <div className="mb-9 rounded-[10px] border p-4 font-mono text-sm" style={{ borderColor: "var(--line)" }}>
                <div className="flex justify-between" style={{ color: "var(--fg-dim)" }}>
                  <span>Price ({durationDays} days)</span>
                  <span style={{ color: "var(--fg)" }}>{formatUnits(totalPrice, ENSV2_ALPHA_PAYMENT_TOKEN_DECIMALS)} USDC</span>
                </div>
                {tokenBalance !== undefined && (
                  <div className="mt-2 flex items-center justify-between">
                    <span style={{ color: "var(--fg-dim)" }}>Your test USDC balance</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: tokenBalance < totalPrice ? "var(--color-sinal-danger)" : "var(--fg)" }}>
                        {formatUnits(tokenBalance, ENSV2_ALPHA_PAYMENT_TOKEN_DECIMALS)} USDC
                      </span>
                      {tokenBalance < totalPrice && (
                        <button
                          onClick={mintTestUsdc}
                          disabled={!isConnected}
                          className="h-7 rounded-[6px] border px-2.5 font-mono text-[11px] disabled:opacity-40"
                          style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
                        >
                          Mint 1000 test USDC
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === "waiting" && (
              <div className="mb-9 rounded-[10px] border p-4 font-mono text-sm" style={{ borderColor: "var(--brand)" }}>
                {commitmentExpired ? (
                  <>
                    <p style={{ color: "var(--color-sinal-danger)" }}>
                      This commitment expired (24h window passed) — start over.
                    </p>
                    <button
                      onClick={cancelCommitment}
                      className="mt-3 h-9 rounded-[var(--radius-2)] border px-4 font-mono text-xs"
                      style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
                    >
                      Start over
                    </button>
                  </>
                ) : canReveal ? (
                  <p style={{ color: "var(--brand)" }}>Commitment ready — you can register now.</p>
                ) : commitTime ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span style={{ color: "var(--fg-muted)" }}>Waiting to reveal…</span>
                      <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--brand)" }}>
                        {Math.max(0, MIN_COMMITMENT_AGE_SECONDS - secondsWaited)}s
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                        style={{
                          width: `${Math.min(100, (secondsWaited / MIN_COMMITMENT_AGE_SECONDS) * 100)}%`,
                          background: "var(--brand)",
                        }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-xs" style={{ color: "var(--fg-dim)" }}>
                      This delay prevents front-running — someone else can&apos;t see your commit and register the
                      name first.
                    </p>
                  </>
                ) : (
                  <p style={{ color: "var(--fg-muted)" }}>Confirming commitment on-chain…</p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-3)] border p-6 lg:sticky lg:top-[108px]" style={{ borderColor: "var(--line)" }}>
            <div className="mb-4 font-mono text-[10px] tracking-[var(--tracking-wide)] uppercase" style={{ color: "var(--fg-kicker)" }}>
              Preview
            </div>
            <div
              className="flex aspect-square flex-col justify-between rounded-xl p-5"
              style={{ background: label ? gradientFor(BigInt(keccak256(toBytes(label)))) : "var(--bg-raised)" }}
            >
              <div style={{ width: 26, height: 38, background: "rgba(255,255,255,0.95)", clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
              <div className="font-sans text-2xl font-bold break-all text-white">{label || "—"}</div>
            </div>
            <div className="mt-4 flex justify-between font-mono text-xs">
              <span style={{ color: "var(--fg-dim)" }}>Settles on</span>
              <span style={{ color: "var(--brand)" }}>Real Sepolia (ENSv2 alpha)</span>
            </div>

            {(step === "idle" || step === "committing") && (
              <button
                onClick={startCommit}
                disabled={busy || !label || durationSeconds === undefined || !isPositiveInteger(durationDays) || Number(durationDays) < MIN_DURATION_DAYS}
                className="mt-6 h-[52px] w-full rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-50"
                style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
              >
                {step === "committing" ? "Committing…" : "Commit"}
              </button>
            )}
            {(step === "waiting" || step === "approving" || step === "registering") && !commitmentExpired && (
              <button
                onClick={continueAfterWait}
                disabled={!canReveal || busy}
                className="mt-6 h-[52px] w-full rounded-[var(--radius-2)] font-sans text-[15px] font-semibold disabled:opacity-50"
                style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
              >
                {step === "approving" ? "Approving USDC…" : step === "registering" ? "Registering…" : needsApproval ? "Approve USDC" : "Register"}
              </button>
            )}

            <div className="mt-3 text-center font-mono text-[11px] leading-[1.5]" style={{ color: "var(--fg-dim)" }}>
              Two steps: commit now, wait {MIN_COMMITMENT_AGE_SECONDS}s, then register.
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
