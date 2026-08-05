import { NextRequest, NextResponse } from "next/server";

const DOMAINS_API_URL = process.env.DOMAINS_API_URL ?? "http://localhost:3001";

/// GET /api/subnames/count?parentId=<registry canonicalId>
export async function GET(req: NextRequest) {
  const url = new URL(`${DOMAINS_API_URL}/subnames/count`);
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`subnames/count request failed: ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("GET /api/subnames/count failed:", err);
    return NextResponse.json({ error: "subnames/count request failed" }, { status: 502 });
  }
}
