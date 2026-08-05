import { NextRequest, NextResponse } from "next/server";

const DOMAINS_API_URL = process.env.DOMAINS_API_URL ?? "http://localhost:3001";

/// GET /api/subnames/search?page=
export async function GET(req: NextRequest) {
  const url = new URL(`${DOMAINS_API_URL}/subnames/search`);
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`subnames/search request failed: ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("GET /api/subnames/search failed:", err);
    return NextResponse.json({ error: "subnames/search request failed" }, { status: 502 });
  }
}
