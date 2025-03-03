import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    console.log("🔍 Full Zapier Response:", data);

    // ✅ Allow CORS for external access
    const headers = new Headers({
      "Access-Control-Allow-Origin": "*", // Allows any origin to access the API
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // ✅ Extract orders properly
    const orders = data.orders ?? [];

    return NextResponse.json(orders, { headers });
  } catch (error) {
    console.error("❌ Error receiving orders from Zapier:", error);
    return NextResponse.json({ error: "Failed to process orders" }, { status: 500 });
  }
}

// ✅ Handle CORS Preflight Requests
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
