/// Deterministic gradient avatar for a name, keyed off its canonicalId so the same
/// name always renders the same tile (not random) without needing any real artwork.
/// All stops reference design tokens from globals.css so the marketplace grid never
/// shows a hue outside the salmao/lima/profundo brand system. Weighted warm, since these
/// tiles fill the whole grid and are what sets the page's overall temperature.
const GRADIENTS = [
  "linear-gradient(135deg,var(--color-salmao-300),var(--color-salmao-700))",
  "linear-gradient(135deg,var(--color-salmao-500),var(--color-profundo-700))",
  "linear-gradient(135deg,var(--color-lima-500),var(--color-salmao-500))",
  "linear-gradient(135deg,var(--color-salmao-700),var(--color-ink-950))",
  "linear-gradient(135deg,var(--color-lima-300),var(--color-lima-500))",
  "linear-gradient(135deg,var(--color-profundo-300),var(--color-profundo-700))",
];

export function gradientFor(id: bigint): string {
  const idx = Number(id % BigInt(GRADIENTS.length));
  return GRADIENTS[idx];
}

export function NameCard({ canonicalId, size = 46 }: { canonicalId: bigint; size?: number }) {
  return (
    <div
      className="flex flex-shrink-0 items-end rounded-[10px] p-1.5"
      style={{
        width: size,
        height: size,
        background: gradientFor(canonicalId),
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          width: size * 0.26,
          height: size * 0.35,
          background: "rgba(255,255,255,0.92)",
          clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
        }}
      />
    </div>
  );
}
