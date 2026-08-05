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
      // `inert` (not just aria-disabled on the wrapper) is what actually makes
      // nested native controls (e.g. a plain <button>) unfocusable and excluded
      // from the accessibility tree — aria-disabled on a div doesn't propagate
      // to children, and pointer-events-none only blocks mouse input, not
      // keyboard tabbing. This is what makes the control "genuinely inert".
      inert
    >
      {children}
    </div>
  );
}

/// Full content-panel replacement for a tab/section that has no real data source
/// (Offers, Valuation, ...) — a labeled placeholder box, not fake numbers.
///
/// Accepts `grow` so callers whose sibling column runs much taller (e.g. a detail
/// page's sticky media column) can let this panel fill the leftover height itself
/// — reads as a deliberately-sized card rather than a short box floating above a
/// few hundred px of bare page background.
export function ComingSoonPanel({
  title,
  description,
  grow = false,
}: {
  title: string;
  description: string;
  grow?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-3)] border border-[var(--line)] p-8 text-center ${
        grow ? "flex flex-1 flex-col items-center justify-center" : ""
      }`}
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
