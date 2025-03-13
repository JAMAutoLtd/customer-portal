import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const orderData = await request.json();

    // Extract data from the request
    const {
      serviceCategory,
      vin,
      address,
      earliestDate,
      earliestTime,
      notes,
      customerName,
      customerEmail,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      servicesRequired,
    } = orderData;

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Format YMM (Year Make Model)
    const ymm = `${vehicleYear} ${vehicleMake} ${vehicleModel}`.trim();

    // Convert service category to customer_type enum value
    let customerType;
    switch (serviceCategory) {
      case "Insurance Claim":
        customerType = "insurance";
        break;
      case "Salvage Repair or Commercial":
        customerType = "commercial";
        break;
      case "Residential or Personal":
      default:
        customerType = "residential";
        break;
    }

    console.log("Looking up user with email:", customerEmail);

    // Get user ID directly from the database
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("userid, email")
      .eq("email", customerEmail)
      .single();

    let userId;

    if (userError) {
      console.error("Error finding user by email:", userError.message);
      return NextResponse.json(
        { error: `User not found: ${userError.message}` },
        { status: 404 }
      );
    } else {
      userId = userData.userid;
      console.log("Found user in database with ID:", userId);
    }

    // Create address record
    const { data: addressData, error: addressError } = await supabase
      .from("addresses")
      .insert([{ streetaddress: address }])
      .select()
      .single();

    if (addressError) {
      console.error("Error creating address:", addressError);
      return NextResponse.json(
        { error: "Failed to create address" },
        { status: 500 }
      );
    }

    const addressId = addressData.addressid;

    const [hours, minutes] = earliestTime.split(":");
    const earliestDateTime = new Date(earliestDate);
    earliestDateTime.setHours(parseInt(hours), parseInt(minutes) || 0, 0, 0);

    const { data: orderResult, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          userid: userId,
          vin: vin || null,
          ymm: ymm,
          addressid: addressId,
          earliestavailabletime: earliestDateTime.toISOString(),
          notes: notes,
        },
      ])
      .select()
      .single();

    if (orderError) {
      console.error("Error creating order:", orderError);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 }
      );
    }

    const orderId = orderResult.orderid;

    // Process services
    const servicesToAdd = [];

    // ADAS Calibration
    if (
      servicesRequired.adasCalibration &&
      servicesRequired.adasCalibration.length > 0
    ) {
      for (const adasService of servicesRequired.adasCalibration) {
        servicesToAdd.push(`ADAS Calibration - ${adasService}`);
      }
    }

    // Airbag Module Reset
    if (servicesRequired.airbagModuleReset) {
      servicesToAdd.push("Airbag Module Reset");
    }

    // Module Replacement
    if (
      servicesRequired.moduleReplacement &&
      servicesRequired.moduleReplacement.length > 0
    ) {
      for (const moduleService of servicesRequired.moduleReplacement) {
        servicesToAdd.push(`Module Replacement - ${moduleService}`);
      }
    }

    // Key Programming
    if (servicesRequired.keyProgramming) {
      const { service, keyType, keySource, quantity, partNumber } =
        servicesRequired.keyProgramming;
      let keyServiceName = `Key Programming - ${service} - ${keyType}`;

      if (keySource) {
        keyServiceName += ` - ${keySource}`;
      }

      if (quantity) {
        keyServiceName += ` - Qty: ${quantity}`;
      }

      if (partNumber) {
        keyServiceName += ` - Part#: ${partNumber}`;
      }

      servicesToAdd.push(keyServiceName);
    }

    // Diagnostic or Wiring
    if (servicesRequired.diagnosticOrWiring) {
      servicesToAdd.push("Diagnostic or Wiring Repair");
    }

    // Add services to the database and create junction records
    for (const serviceName of servicesToAdd) {
      // Check if service exists, if not create it
      const { data: serviceData, error: serviceError } = await supabase
        .from("services")
        .select("serviceid")
        .eq("servicename", serviceName)
        .single();

      let serviceId;

      if (serviceError) {
        // Service doesn't exist, create it
        const { data: newService, error: newServiceError } = await supabase
          .from("services")
          .insert([{ servicename: serviceName }])
          .select()
          .single();

        if (newServiceError) {
          console.error("Error creating service:", newServiceError);
          continue;
        }

        serviceId = newService.serviceid;
      } else {
        serviceId = serviceData.serviceid;
      }

      // Create junction record
      await supabase
        .from("ordersservicesjunction")
        .insert([{ orderid: orderId, serviceid: serviceId }]);
    }

    return NextResponse.json({
      success: true,
      message: "Order submitted successfully",
      orderId,
    });
  } catch (error) {
    console.error("Error submitting order:", error);
    return NextResponse.json(
      { error: "Failed to submit order" },
      { status: 500 }
    );
  }
}
