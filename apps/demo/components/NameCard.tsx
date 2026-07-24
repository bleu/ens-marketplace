/// Deterministic gradient avatar for a name, keyed off its canonicalId so the same
/// name always renders the same tile (not random) without needing any real artwork.
const GRADIENTS = [
  "linear-gradient(135deg,#5b8cff,#4bd0ff)",
  "linear-gradient(135deg,#20c5d9,#1d87af)",
  "linear-gradient(135deg,#78ea96,#20a7d9)",
  "linear-gradient(135deg,#ff8668,#ce695e)",
  "linear-gradient(135deg,#6b4bff,#b04bff)",
  "linear-gradient(135deg,#ffb84b,#ff6b6b)",
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
