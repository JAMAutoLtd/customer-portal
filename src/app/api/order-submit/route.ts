import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const orderData = await request.json()

    const {
      vin,
      address,
      earliestDate,
      notes,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      selectedServiceIds,
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

    if (selectedServiceIds && selectedServiceIds.length > 0) {
      const { error: orderServicesError } = await supabase
        .from('order_services')
        .insert(
          selectedServiceIds.map((serviceId: string) => ({
            order_id: orderId,
            service_id: parseInt(serviceId),
          }))
        )

      if (orderServicesError) {
        console.error('Error creating order services:', orderServicesError)
        return NextResponse.json(
          { error: 'Failed to create order services' },
          { status: 500 }
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
