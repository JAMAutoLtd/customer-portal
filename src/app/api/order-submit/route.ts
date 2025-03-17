import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const orderData = await request.json()
    console.log('❤️ orderData', orderData)

    const {
      serviceCategory,
      vin,
      address,
      earliestDate,
      notes,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      servicesRequired,
    } = orderData

    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    })

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error(
        'Error getting session or user not authenticated:',
        sessionError
      )
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    const ymm = `${vehicleYear} ${vehicleMake} ${vehicleModel}`.trim()

    // Create address record
    const { data: addressData, error: addressError } = await supabase
      .from('addresses')
      .insert([{ street_address: address }])
      .select()
      .single()

    if (addressError) {
      console.error('Error creating address:', addressError)
      return NextResponse.json(
        { error: 'Failed to create address' },
        { status: 500 }
      )
    }

    const addressId = addressData.id

    // Create vehicle record if VIN is provided
    let vehicleId = null
    if (vin) {
      const { data: existingVehicle } = await supabase
        .from('vehicles')
        .select('id')
        .eq('vin', vin)
        .single()

      if (existingVehicle) {
        vehicleId = existingVehicle.id
      } else {
        const { data: vehicleData, error: vehicleError } = await supabase
          .from('vehicles')
          .insert([{ vin, ymm }])
          .select()
          .single()

        if (vehicleError) {
          console.error('Error creating vehicle:', vehicleError)
        } else {
          vehicleId = vehicleData.id
        }
      }
    }

    const earliestDateTime = new Date(earliestDate)

    const { data: orderResult, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          user_id: userId,
          vehicle_id: vehicleId,
          address_id: addressId,
          earliest_available_time: earliestDateTime.toISOString(),
          notes: notes,
        },
      ])
      .select()
      .single()

    if (orderError) {
      console.error('Error creating order:', orderError)
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      )
    }

    const orderId = orderResult.id

    // Process services
    const servicesToAdd = []

    // ADAS Calibration
    if (
      servicesRequired.adasCalibration &&
      servicesRequired.adasCalibration.length > 0
    ) {
      for (const adasService of servicesRequired.adasCalibration) {
        servicesToAdd.push(`ADAS Calibration - ${adasService}`)
      }
    }

    // Airbag Module Reset
    if (servicesRequired.airbagModuleReset) {
      servicesToAdd.push('Airbag Module Reset')
    }

    // Module Replacement
    if (
      servicesRequired.moduleReplacement &&
      servicesRequired.moduleReplacement.length > 0
    ) {
      for (const moduleService of servicesRequired.moduleReplacement) {
        servicesToAdd.push(`Module Replacement - ${moduleService}`)
      }
    }

    // Key Programming
    if (servicesRequired.keyProgramming) {
      const { service, keyType, keySource, quantity, partNumber } =
        servicesRequired.keyProgramming
      let keyServiceName = `Key Programming - ${service} - ${keyType}`

      if (keySource) {
        keyServiceName += ` - ${keySource}`
      }

      if (quantity) {
        keyServiceName += ` - Qty: ${quantity}`
      }

      if (partNumber) {
        keyServiceName += ` - Part#: ${partNumber}`
      }

      servicesToAdd.push(keyServiceName)
    }

    // Diagnostic or Wiring
    if (servicesRequired.diagnosticOrWiring) {
      servicesToAdd.push('Diagnostic or Wiring Repair')
    }

    // Add services to the database and create junction records
    for (const serviceName of servicesToAdd) {
      // Check if service exists
      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('id')
        .eq('service_name', serviceName)
        .single()

      // Only proceed if the service exists
      if (!serviceError && serviceData) {
        const serviceId = serviceData.id

        // Create junction record in order_services table
        await supabase
          .from('order_services')
          .insert([{ order_id: orderId, service_id: serviceId }])
      } else {
        console.error(
          `Service "${serviceName}" not found in database, skipping`
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Order submitted successfully',
      orderId,
    })
  } catch (error) {
    console.error('Error submitting order:', error)
    return NextResponse.json(
      { error: 'Failed to submit order' },
      { status: 500 }
    )
  }
}
