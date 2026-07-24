import { NextRequest, NextResponse } from "next/server";
import { lookupEnsV1Domain } from "@/lib/ensv1";

/// Server-side proxy to the ENS subgraph — keeps THEGRAPH_API_KEY out of the browser.
/// GET /api/ensv1/search?name=alice.eth
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "Missing required 'name' query param" }, { status: 400 });
  }
  try {
    const domain = await lookupEnsV1Domain(name);
    if (!domain) {
      return NextResponse.json({ error: "Name not found" }, { status: 404 });
    }
    return NextResponse.json({ domain });
  } catch (err) {
    console.error("GET /api/ensv1/search failed:", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
  }
}
