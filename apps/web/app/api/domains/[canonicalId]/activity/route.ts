import { NextResponse } from "next/server";

const DOMAINS_API_URL = process.env.DOMAINS_API_URL ?? "http://localhost:3001";

/// GET /api/domains/:canonicalId/activity
export async function GET(_req: Request, { params }: { params: Promise<{ canonicalId: string }> }) {
  const { canonicalId } = await params;

  try {
    const res = await fetch(`${DOMAINS_API_URL}/domains/${canonicalId}/activity`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`domains/:id/activity request failed: ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("GET /api/domains/[canonicalId]/activity failed:", err);
    return NextResponse.json({ error: "domains/activity request failed" }, { status: 502 });
  }
}
