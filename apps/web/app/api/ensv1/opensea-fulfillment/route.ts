import { NextRequest, NextResponse } from "next/server";

/// Server-side proxy to OpenSea's dedicated fulfillment-data endpoint — keeps
/// OPENSEA_API_KEY out of the browser. Necessary because OpenSea's bulk browse feed
/// (app/api/ensv1/listings, GET /listings/collection/{slug}/all) always returns
/// protocol_data.signature: null on every listing (verified live — order data there is
/// display-only). The real, submittable signed order only comes from this endpoint,
/// and only when fetched fresh right before a purchase — not reused from browse time,
/// since the listing could have been filled or cancelled since then.
/// POST body: { orderHash, protocolAddress, fulfillerAddress }
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenSea API key not configured" }, { status: 501 });
  }

  let body: { orderHash?: string; protocolAddress?: string; fulfillerAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { orderHash, protocolAddress, fulfillerAddress } = body;
  if (!orderHash || !protocolAddress || !fulfillerAddress) {
    return NextResponse.json({ error: "Missing orderHash, protocolAddress, or fulfillerAddress" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.opensea.io/api/v2/listings/fulfillment_data", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        listing: { hash: orderHash, chain: "ethereum", protocol_address: protocolAddress },
        fulfiller: { address: fulfillerAddress },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("POST /api/ensv1/opensea-fulfillment: OpenSea request failed", res.status, text);
      return NextResponse.json({ error: `OpenSea fulfillment request failed: ${res.status}` }, { status: 502 });
    }
    const json = await res.json();
    const order = json.fulfillment_data?.orders?.[0];
    if (!order?.signature || !order?.parameters) {
      // Most likely the listing was filled or cancelled between browse time and now.
      return NextResponse.json(
        { error: "This listing is no longer fulfillable — it may have just been sold or cancelled" },
        { status: 409 },
      );
    }
    return NextResponse.json({ protocol_data: order });
  } catch (err) {
    console.error("POST /api/ensv1/opensea-fulfillment failed:", err);
    return NextResponse.json({ error: "OpenSea fulfillment request failed" }, { status: 502 });
  }
}
