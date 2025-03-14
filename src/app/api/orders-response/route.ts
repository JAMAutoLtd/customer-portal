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
    // Expect all fields from Zapier with comma-separated values
    const orderData = await request.json();
    console.log("🔍 Full Zapier Response:", orderData);

    // Split all fields into arrays
    const dates = (orderData.subDate || '').split(',').map((s: string) => s.trim());
    const years = (orderData.vehicleYear || '').split(',').map((s: string) => s.trim());
    const makeModels = (orderData.vehicleMM || '').split(',').map((s: string) => s.trim());
    const services = (orderData.serviceReq || '').split(',').map((s: string) => s.trim());
    const completeStatus = (orderData.orderComplete || '').split(',').map((s: string) => s.trim());

    // Create individual order objects
    const orders = dates.map((date: string, i: number) => ({
      subDate: date,
      vehicleYear: years[i] || '',
      vehicleMM: makeModels[i] || '',
      serviceReq: services[i] || '',
      orderComplete: completeStatus[i] || ''
    }));

    // Store all orders
    globalOrders.push(...orders);

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
