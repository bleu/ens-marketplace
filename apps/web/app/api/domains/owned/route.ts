import { NextRequest, NextResponse } from "next/server";

const DOMAINS_API_URL = process.env.DOMAINS_API_URL ?? "http://localhost:3001";

/// GET /api/domains/owned?address=0x...
export async function GET(req: NextRequest) {
  const url = new URL(`${DOMAINS_API_URL}/domains/owned`);
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`domains/owned request failed: ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("GET /api/domains/owned failed:", err);
    return NextResponse.json({ error: "domains/owned request failed" }, { status: 502 });
  }
}
