import Link from "next/link";

/// The listing flow (approve + list against OrderManager) doesn't work reliably, so the
/// whole surface is off rather than half-working: the nav entry is gone and this route
/// explains itself for anyone arriving from a bookmark or an old link. The form lives in
/// git history — reverting the commit that added this file brings it back.
export default function ListDomainPage() {
  return (
    <div className="mx-auto max-w-[560px] px-4 py-16 text-center">
      <div
        className="rounded-[var(--radius-3)] border p-8"
        style={{ borderColor: "var(--line)", background: "rgba(242,244,241,0.02)" }}
      >
        <div
          className="mb-2 font-mono text-[10px] uppercase tracking-[var(--tracking-wide)]"
          style={{ color: "var(--fg-kicker)" }}
        >
          Temporarily unavailable
        </div>
        <div
          className="mb-3 font-[var(--font-display)] text-2xl font-light tracking-[var(--tracking-snug)]"
          style={{ color: "var(--fg)" }}
        >
          Listing a name is turned off
        </div>
        <p className="mb-7 font-mono text-[13px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          We&apos;re fixing the listing flow. Nothing you&apos;ve already listed is affected — existing
          listings stay live and can still be bought or cancelled.
        </p>
        <Link
          href="/domains"
          className="inline-flex h-[52px] items-center rounded-[var(--radius-2)] px-8 font-sans text-[15px] font-semibold"
          style={{ background: "var(--brand-cta)", color: "var(--brand-ink)" }}
        >
          Browse names
        </Link>
      </div>
    </div>
  );
}
