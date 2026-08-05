/// The Farol mark: the nautical chart symbol for a light — a filled dot with a tapered
/// flare. Charts print light beacons in magenta, which is why the flare is salmao rather
/// than the app's aqua brand color. The tile is deep and the flare is bright (not the
/// other way round) so the glyph reads as a light source and the glow belongs to it.
/// The flare's base chord is deliberately much narrower than the dot's diameter, so the
/// round bulb stays a visible silhouette instead of the two merging into one leaf shape.
const FLARE = "M6.3 15.3C11.5 10.5 16 6.5 21 3.5C17 9.5 13 13.8 8.7 17.7Z";

export function Mark({ size = 32, radius = 7 }: { size?: number; radius?: number }) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "linear-gradient(135deg,var(--color-ink-950),var(--color-profundo-700))",
        boxShadow: "0 0 24px rgba(255,134,104,0.4)",
      }}
    >
      <svg
        width={size * 0.72}
        height={size * 0.72}
        viewBox="0 0 24 24"
        fill="var(--color-salmao-500)"
        aria-hidden="true"
      >
        <circle cx="7.5" cy="16.5" r="4" />
        <path d={FLARE} />
      </svg>
    </div>
  );
}
