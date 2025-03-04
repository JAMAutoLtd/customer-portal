// A global array that won't persist across serverless restarts.
type Order = {
  subDate: string;
  vehicleYear: string;
  vehicleMM: string;
  serviceReq: string;
  orderComplete: string;
};

const globalOrders: Order[] = [];

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Expect all fields from Zapier
    const order = await request.json();
    console.log("🔍 Full Zapier Response:", order);

    // Validate required fields
    if (!order.subDate || typeof order.subDate !== "string") {
      return NextResponse.json({ error: "Invalid payload; missing subDate" }, { status: 400 });
    }

    // Store the complete order object
    globalOrders.push({
      subDate: order.subDate,
      vehicleYear: order.vehicleYear || '',
      vehicleMM: order.vehicleMM || '',
      serviceReq: order.serviceReq || '',
      orderComplete: order.orderComplete || ''
    });

    return NextResponse.json({ status: "stored", total: globalOrders.length });
  } catch (error) {
    console.error("❌ Error receiving order:", error);
    return NextResponse.json({ error: "Failed to process order" }, { status: 500 });
  }
}

// For polling from the dashboard: GET /api/orders-response
export async function GET() {
  // Return the array of orders
  return NextResponse.json(globalOrders);
}
