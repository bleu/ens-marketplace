/// The mark as a standalone SVG data URI, for the generated icon/OG images.
/// `ImageResponse` renders through satori, which handles an `<img>` data URI far more
/// reliably than inline SVG children, and it can't read CSS custom properties either —
/// hence the literal palette values (salmao-500, ink-950, profundo-700) rather than
/// `var(--color-…)`. Kept in sync by hand with `components/Mark.tsx`.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ff8668"><circle cx="7.5" cy="16.5" r="4"/><path d="M6.3 15.3C11.5 10.5 16 6.5 21 3.5C17 9.5 13 13.8 8.7 17.7Z"/></svg>`;

export const markDataUri = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export const TILE_GRADIENT = "linear-gradient(135deg,#0a0d18,#2a3a4c)";
