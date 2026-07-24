"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePublicClient } from "wagmi";
import { REGISTRY_ADDRESS, registryAbi } from "@/lib/contracts";
import { nameToCanonicalId } from "@/lib/canonicalId";
import { isZeroAddress } from "@/lib/format";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const publicClient = usePublicClient();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);

  const isExplore = pathname.startsWith("/domains") && !pathname.endsWith("/list");
  const isSubnames = pathname.startsWith("/subnames");

  async function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !publicClient) return;
    setSearching(true);
    setNotFound(false);
    setSearchError(false);
    try {
      const id = nameToCanonicalId(query.trim());
      const owner = await publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: "ownerOf",
        args: [id],
      });
      if (isZeroAddress(owner as `0x${string}`)) {
        setNotFound(true);
      } else {
        router.push(`/domains/${id.toString()}`);
      }
    } catch (err) {
      console.error("Name search failed:", err);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  }

  const searchForm = (
    <form
      onSubmit={onSearchSubmit}
      className="search-form flex h-[42px] w-full items-center gap-2.5 rounded-lg border px-4 lg:max-w-[360px] lg:flex-1"
      style={{ background: "rgba(242,244,241,0.05)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth={2}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNotFound(false);
          setSearchError(false);
        }}
        placeholder="Search names…"
        aria-label="Search names"
        className="flex-1 bg-transparent font-mono text-[13px] tracking-[var(--tracking-tight)] outline-none"
        style={{ color: "var(--fg)" }}
      />
      {searching && <span className="font-mono text-[10px] text-[var(--fg-dim)]">…</span>}
      <span role="status" aria-live="polite" className="contents">
        {notFound && <span className="font-mono text-[10px] text-[var(--accent)]">Not found</span>}
        {searchError && (
          <span className="font-mono text-[10px]" style={{ color: "var(--color-sinal-danger)" }}>
            Search failed — try again
          </span>
        )}
      </span>
    </form>
  );

  const navLinks = (
    <>
      <Link
        href="/domains"
        className={`nav-link cursor-pointer border-b-2 pb-1 ${isExplore ? "nav-link-active" : ""}`}
        onClick={() => setMobileOpen(false)}
      >
        Explore
      </Link>
      <Link
        href="/subnames"
        className={`nav-link cursor-pointer border-b-2 pb-1 ${isSubnames ? "nav-link-active" : ""}`}
        onClick={() => setMobileOpen(false)}
      >
        Subnames
      </Link>
      <span className="cursor-not-allowed" style={{ color: "var(--fg-muted)" }} title="Coming soon">
        Premium
      </span>
      <span className="cursor-not-allowed" style={{ color: "var(--fg-muted)" }} title="Coming soon">
        Categories
      </span>
    </>
  );

  const connectButton = (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        return (
          <div {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none" } })}>
            {!connected ? (
              <button
                type="button"
                onClick={openConnectModal}
                className="btn-cta flex h-[42px] items-center gap-2 rounded-[var(--radius-2)] px-5 font-sans text-sm font-semibold"
                style={{ background: "var(--brand-cta)", color: "var(--brand-ink)", boxShadow: "0 0 32px rgba(32,167,217,0.35)" }}
              >
                <div
                  style={{
                    width: 9,
                    height: 14,
                    background: "var(--brand-ink)",
                    clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
                    opacity: 0.85,
                  }}
                />
                Connect wallet
              </button>
            ) : chain.unsupported ? (
              <button
                type="button"
                onClick={openChainModal}
                className="h-[42px] rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium"
                style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
              >
                Wrong network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openChainModal}
                  className="h-[42px] rounded-[var(--radius-2)] border px-3 font-mono text-xs"
                  style={{ borderColor: "var(--line-strong)", color: "var(--fg-muted)" }}
                >
                  {chain.name}
                </button>
                <button
                  type="button"
                  onClick={openAccountModal}
                  className="btn-cta h-[42px] rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium"
                  style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
                >
                  {account.displayName}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );

  return (
    <header
      className="sticky top-0 z-40 border-b px-4 lg:px-8"
      style={{
        background: "rgba(10,13,24,0.82)",
        backdropFilter: "blur(14px)",
        borderColor: "var(--line)",
      }}
    >
      <div className="flex h-[76px] items-center gap-4 lg:gap-7">
        <Link href="/domains" className="flex flex-shrink-0 items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[7px]"
            style={{
              background: "linear-gradient(135deg,var(--color-aqua-500),var(--color-aqua-700))",
              boxShadow: "0 0 24px rgba(32,197,217,0.4)",
            }}
          >
            <div
              style={{
                width: 11,
                height: 17,
                background: "var(--color-ink-1000)",
                clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
              }}
            />
          </div>
          <span
            className="whitespace-nowrap font-[var(--font-display)] text-xl font-normal tracking-[0.02em]"
            style={{ color: "var(--fg)" }}
          >
            Bleu ENS Marketplace
          </span>
        </Link>

        <div className="hidden lg:flex lg:flex-1">{searchForm}</div>

        <nav className="hidden items-center gap-6 font-sans text-sm font-medium lg:flex">{navLinks}</nav>

        <div className="ml-auto hidden items-center gap-4 lg:flex">
          <Link
            href="/domains/list"
            className="btn-outline flex h-[42px] items-center rounded-[var(--radius-2)] border px-4 font-sans text-sm font-medium"
          >
            List a name
          </Link>
          {connectButton}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="ml-auto flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[var(--radius-2)] border lg:hidden"
          style={{ borderColor: "var(--line-strong)", color: "var(--fg)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            {mobileOpen ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <>
                <path d="M3 6h18" />
                <path d="M3 12h18" />
                <path d="M3 18h18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="flex flex-col gap-5 border-t pb-5 pt-4 lg:hidden" style={{ borderColor: "var(--line)" }}>
          {searchForm}
          <nav className="flex flex-col items-start gap-4 font-sans text-sm font-medium">{navLinks}</nav>
          <div className="flex flex-col items-stretch gap-3">
            <Link
              href="/domains/list"
              onClick={() => setMobileOpen(false)}
              className="btn-outline flex h-[42px] items-center justify-center rounded-[var(--radius-2)] border px-4 font-sans text-sm font-medium"
            >
              List a name
            </Link>
            {connectButton}
          </div>
        </div>
      )}
    </header>
  );
}
