// A global map that won't persist across serverless restarts.
const globalOrderMap = new Map<string, any[]>();

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, orders } = await request.json();
    console.log("🔍 Full Zapier Response:", { email, orders });

    if (!email || !Array.isArray(orders)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Store in an in-memory map keyed by the user's email
    globalOrderMap.set(email, orders);

    return NextResponse.json({ status: "stored" });
  } catch (error) {
    console.error("❌ Error receiving orders from Zapier:", error);
    return NextResponse.json({ error: "Failed to process orders" }, { status: 500 });
  }
}

// For polling from the dashboard: GET /api/orders-response?email=some@domain.com
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get("email");
  if (!userEmail) {
    return NextResponse.json({ error: "Missing email param" }, { status: 400 });
  }

  // Return the stored orders if found
  const foundOrders = globalOrderMap.get(userEmail) ?? [];
  return NextResponse.json(foundOrders);
}
