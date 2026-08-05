import { NextResponse } from "next/server";

const DOMAINS_API_URL = process.env.DOMAINS_API_URL ?? "http://localhost:3001";

/// GET /api/domains/:canonicalId/last-sale
export async function GET(_req: Request, { params }: { params: Promise<{ canonicalId: string }> }) {
  const { canonicalId } = await params;

  try {
    const res = await fetch(`${DOMAINS_API_URL}/domains/${canonicalId}/last-sale`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`domains/:id/last-sale request failed: ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error("GET /api/domains/[canonicalId]/last-sale failed:", err);
    return NextResponse.json({ error: "domains/last-sale request failed" }, { status: 502 });
  }
}
