import { NextResponse } from "next/server";

export async function GET() {
  try {
    const ngrokURL = "https://b837-2604-3d09-137a-3f70-d4d4-245b-d024-3a73.ngrok-free.app/api/orders-response";

    console.log("🔄 Fetching orders from ngrok...");

    const response = await fetch(ngrokURL, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const responseData = await response.json();
    console.log("📦 Received Orders from ngrok:", responseData);

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("❌ Error fetching orders from ngrok:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
