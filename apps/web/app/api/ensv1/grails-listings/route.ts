import { NextRequest, NextResponse } from "next/server";

/// Grails' own live API (api.grails.app) is being discontinued — see
/// docs/grails-migration.md. This route now proxies to our own service (apps/api, a
/// separate NestJS + Prisma app in this monorepo) instead of calling Grails directly.
/// That service returns the exact same shape this route always has
/// (`{listings, unresolvedCount, next, total, totalPages}` / `{listing}`), scraped from
/// Grails ahead of the cutoff and re-scraped on a schedule for as long as Grails' API
/// stays reachable (see .github/workflows/scrape-grails.yml) — so nothing downstream
/// (lib/ensv1-client.ts's useGrailsListings, app/domains/page.tsx) needed to change at all.
const GRAILS_API_URL = process.env.GRAILS_API_URL ?? "http://localhost:3001";

/// GET /api/ensv1/grails-listings?page=1          — one page of the browsable Explore feed
/// GET /api/ensv1/grails-listings?name=alice.eth   — exact-name lookup
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const path = name ? "/grails/by-name" : "/grails/search";
  const url = new URL(`${GRAILS_API_URL}${path}`);
  // Every incoming param is forwarded as-is, so adding a filter needs no change here —
  // apps/api's GrailsController accepts the same param names the client sends (page, q,
  // lengths, lengthAtLeast, sort, includeOutliers, minPrice, maxPrice, minLength,
  // maxLength, startsWith, endsWith, name).
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Grails API request failed: ${res.status}`);
    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    console.error("GET /api/ensv1/grails-listings failed:", err);
    return NextResponse.json({ error: "Grails request failed" }, { status: 502 });
  }
}
