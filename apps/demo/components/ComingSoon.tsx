/// Wraps a control that mirrors the design but has no real contract backing yet
/// (offers, OpenSea cross-listing, categories, valuation, ...). Deliberately never
/// looks like a live control that silently no-ops — visually present, genuinely inert.
export function ComingSoon({
  children,
  label = "Coming soon",
  className = "",
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none select-none opacity-40 ${className}`}
      title={label}
      aria-disabled="true"
    >
      {children}
    </div>
  );
}

/// Full content-panel replacement for a tab/section that has no real data source
/// (Offers, Valuation, ...) — a labeled placeholder box, not fake numbers.
export function ComingSoonPanel({ title, description }: { title: string; description: string }) {
  return (
    <div
      className="rounded-[var(--radius-3)] border border-[var(--line)] p-8 text-center"
      style={{ background: "rgba(242,244,241,0.02)" }}
    >
      <div
        className="mb-2 font-mono text-[10px] uppercase tracking-[var(--tracking-wide)]"
        style={{ color: "var(--color-profundo-300)" }}
      >
        Coming soon
      </div>
      <div className="mb-2 font-[var(--font-display)] text-2xl font-light tracking-[var(--tracking-snug)] text-[var(--fg)]">
        {title}
      </div>
      <div className="mx-auto max-w-md font-mono text-[13px] text-[var(--fg-muted)]">{description}</div>
    </div>
  );
}
