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

    const earliestDateTime = new Date(earliestDate)

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

    // Ensure year is a valid number
    const yearNum = parseInt(vehicleYear)
    if (
      isNaN(yearNum) ||
      yearNum < 1900 ||
      yearNum > new Date().getFullYear() + 1
    ) {
      return NextResponse.json(
        { error: 'Invalid vehicle year' },
        { status: 400 }
      )
    }

    // Prepare vehicle data
    const vehicleData = {
      vin: vin || null,
      year: yearNum,
      make: vehicleMake?.toUpperCase()?.trim() || 'UNKNOWN',
      model: vehicleModel?.toUpperCase()?.trim() || 'UNKNOWN',
    }

    // Upsert vehicle record
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .upsert(vehicleData, {
        onConflict: vin ? 'vin' : undefined,
        ignoreDuplicates: !vin,
      })
      .select()
      .single()

    if (vehicleError) {
      console.error('Error upserting vehicle:', vehicleError)
      return NextResponse.json(
        {
          error: 'Failed to create/update vehicle record',
          details: vehicleError.message,
        },
        { status: 500 }
      )
    }

    const vehicleId = vehicle.id

    // Create order with vehicle ID
    const { data: orderResult, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          user_id: userId,
          vehicle_id: vehicleId,
          address_id: addressId,
          earliest_available_time: earliestDateTime.toISOString(),
          notes: notes || null,
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
