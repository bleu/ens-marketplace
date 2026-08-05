const VARIANTS = {
  active: { fg: "var(--color-lima-500)", bg: "rgba(120,234,150,0.12)" },
  suspended: { fg: "var(--color-salmao-500)", bg: "rgba(255,134,104,0.12)" },
  neutral: { fg: "var(--fg-dim)", bg: "rgba(242,244,241,0.06)" },
  chain: { fg: "var(--brand)", bg: "rgba(var(--brand-rgb),0.12)" },
} as const;

export function StatusBadge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
}) {
  const v = VARIANTS[variant];
  return (
    <span
      className="inline-block rounded-[5px] px-[7px] py-[2px] font-mono text-[9px] leading-[1.4] tracking-[var(--tracking-wide)] uppercase"
      style={{ color: v.fg, background: v.bg }}
    >
      {children}
    </span>
  );
}
