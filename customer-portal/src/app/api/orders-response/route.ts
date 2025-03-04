// A global array that won't persist across serverless restarts.
const globalSubDates: string[] = [];

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Expect a single field: { subDate: "2025-03-03 22:49:28" }
    const { subDate } = await request.json();
    console.log("🔍 Full Zapier Response:", { subDate });

    // Validate
    if (!subDate || typeof subDate !== "string") {
      return NextResponse.json({ error: "Invalid payload; missing subDate" }, { status: 400 });
    }

    // Store the subDate in memory
    globalSubDates.push(subDate);

    return NextResponse.json({ status: "stored", total: globalSubDates.length });
  } catch (error) {
    console.error("❌ Error receiving subDate:", error);
    return NextResponse.json({ error: "Failed to process subDate" }, { status: 500 });
  }
}

// For polling from the dashboard: GET /api/orders-response
export async function GET() {
  // Return the entire array of submission dates
  return NextResponse.json(globalSubDates);
}
