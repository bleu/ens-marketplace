"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Mark } from "@/components/Mark";
import { useNetworkMode } from "@/lib/network-mode";

function Chevron() {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 opacity-70"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [networkMode] = useNetworkMode();
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);

  const isExplore = pathname.startsWith("/domains") && !pathname.endsWith("/list");

  async function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the typed value directly from the submitted form (uncontrolled
    // input) rather than from React state. A fully-controlled `value={query}`
    // input is silently reset to its initial "" on the first post-mount
    // render, which discards anything typed via native DOM events during the
    // window between a fresh (non-<Link>) page load and React finishing
    // hydration — a window that's easily wide enough to hit by hand in dev.
    // Reading straight from the DOM at submit time sidesteps that entirely.
    const query = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!query) return;
    // Only the ENSv1 (mainnet) view has a by-name lookup wired up today — the ENSv2
    // alpha registry has no search of its own yet, so the form is a no-op there.
    if (networkMode !== "ensv1") return;

    setSearching(true);
    setNotFound(false);
    setSearchError(false);

    // Real mainnet lookup via the ENS subgraph proxy (see app/api/ensv1/search).
    try {
      const res = await fetch(`/api/ensv1/search?name=${encodeURIComponent(query)}`);
      if (res.status === 404) {
        setNotFound(true);
      } else if (!res.ok) {
        throw new Error(`status ${res.status}`);
      } else {
        setMobileOpen(false);
        router.push(`/domains/ensv1/${encodeURIComponent(query)}`);
      }
    } catch (err) {
      console.error("ENSv1 name search failed:", err);
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
        name="q"
        defaultValue=""
        onChange={() => {
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
                className="btn-cta flex h-[42px] cursor-pointer items-center gap-2 rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium"
                style={{ background: "var(--accent)", color: "var(--brand-ink)" }}
              >
                Wrong network
                <Chevron />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openChainModal}
                  aria-label={`Network: ${chain.name}. Switch network`}
                  className="btn-outline flex h-[42px] cursor-pointer items-center gap-2 rounded-[var(--radius-2)] border px-3 font-mono text-xs"
                >
                  {chain.hasIcon && chain.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a 18px static SVG; next/image would need dangerouslyAllowSVG
                    <img src={chain.iconUrl} alt="" width={18} height={18} className="flex-shrink-0 rounded-full" />
                  ) : (
                    <span
                      aria-hidden
                      className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                      style={{ background: "var(--color-sinal-success)" }}
                    />
                  )}
                  <span className="whitespace-nowrap">{chain.name}</span>
                  <Chevron />
                </button>
                <button
                  type="button"
                  onClick={openAccountModal}
                  className="btn-cta h-[42px] flex-1 cursor-pointer rounded-[var(--radius-2)] px-4 font-sans text-sm font-medium lg:flex-none"
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
        // Was rgba(10,13,24,0.82) + blur(14px) — translucent enough that a
        // vividly colored hero/preview image scrolled underneath (e.g. the
        // salmon subname-preview card, or a name-detail hero) bled through
        // as a blurred color glow behind the mobile nav menu items, and made
        // content passing under the header (e.g. the Buy-now CTA on
        // /domains/[canonicalId] at certain scroll positions) look like it
        // was being sliced mid-glyph rather than cleanly covered. Near-opaque
        // keeps the frosted-glass look without letting page content bleed
        // through it.
        background: "rgba(10,13,24,0.97)",
        backdropFilter: "blur(14px)",
        borderColor: "var(--line)",
      }}
    >
      <div className="flex h-[76px] items-center gap-4 lg:gap-7">
        <Link href="/domains" className="flex flex-shrink-0 items-center gap-3">
          <Mark size={32} radius={7} />
          <span
            className="whitespace-nowrap font-[var(--font-display)] text-xl font-normal tracking-[0.02em]"
            style={{ color: "var(--fg)" }}
          >
            Farol
          </span>
        </Link>

        <div className="hidden lg:flex lg:flex-1">{searchForm}</div>

        <nav className="hidden items-center gap-6 font-sans text-sm font-medium lg:flex">{navLinks}</nav>

        <div className="ml-auto hidden items-center gap-4 lg:flex">{connectButton}</div>

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
          <div className="flex flex-col items-stretch gap-3">{connectButton}</div>
        </div>
      )}
    </header>
  );
}
