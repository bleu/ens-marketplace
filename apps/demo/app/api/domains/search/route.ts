import { NextRequest, NextResponse } from "next/server";

/// Proxies to apps/api's DomainsController, which queries the Envio HyperIndex indexer
/// (apps/indexer) instead of this route ever scanning eth_getLogs directly — see
/// docs/roadmap.md / the ENSv2-indexer plan for why (thousands-of-domains scale).
const DOMAINS_API_URL = process.env.DOMAINS_API_URL ?? "http://localhost:3001";

/// GET /api/domains/search?tab=names|listings&page=
export async function GET(req: NextRequest) {
  const url = new URL(`${DOMAINS_API_URL}/domains/search`);
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`domains/search request failed: ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("GET /api/domains/search failed:", err);
    return NextResponse.json({ error: "domains/search request failed" }, { status: 502 });
  }
}
