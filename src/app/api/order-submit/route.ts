import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { determineJobPriority } from '@/utils/jobs'

const JOB_DURATION = 60

export async function POST(request: Request) {
  try {
    const orderData = await request.json()

    const {
      vin,
      address,
      lat,
      lng,
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

    // Get user profile to determine customer type
    const { data: userProfile, error: userProfileError } = await supabase
      .from('users')
      .select('customer_type')
      .eq('id', userId)
      .single()

    if (userProfileError) {
      console.error('Error getting user profile:', userProfileError)
      return NextResponse.json(
        { error: 'Failed to retrieve user profile' },
        { status: 500 }
      )
    }

    const customerType = userProfile.customer_type

    const earliestDateTime = new Date(earliestDate)

    // Create address record with lat/lng if provided
    const addressData: { street_address: string; lat?: number; lng?: number } =
      {
        street_address: address,
      }

    if (lat !== undefined && lng !== undefined) {
      addressData.lat = lat
      addressData.lng = lng
    }

    const { data: addressResult, error: addressError } = await supabase
      .from('addresses')
      .insert([addressData])
      .select()
      .single()

    if (addressError) {
      console.error('Error creating address:', addressError)
      return NextResponse.json(
        { error: 'Failed to create address' },
        { status: 500 }
      )
    }

    const addressId = addressResult.id

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

    console.log('🌟 vehicleData', vehicleData)
    // Upsert vehicle record
    const { data: vehicle, error: vehicleError } = await supabase
      .from('customer_vehicles')
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
      // Create order_services entries
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

      // Get service details for each selected service
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id, service_name, service_category')
        .in(
          'id',
          selectedServiceIds.map((id: string) => parseInt(id))
        )

      if (servicesError) {
        console.error('Error fetching services:', servicesError)
        return NextResponse.json(
          { error: 'Failed to fetch service details' },
          { status: 500 }
        )
      }

      // Create jobs with appropriate priorities
      const jobPromises = services.map(async (service) => {
        // Get priority using the extracted function
        const priority = determineJobPriority(
          customerType,
          service.service_category
        )

        // Create job record
        return supabase.from('jobs').insert([
          {
            order_id: orderId,
            address_id: addressId,
            priority: priority,
            status: 'queued',
            requested_time: earliestDateTime.toISOString(),
            service_id: service.id,
            notes: notes || null,
            job_duration: JOB_DURATION,
          },
        ])
      })

      try {
        await Promise.all(jobPromises)
      } catch (jobError) {
        console.error('Error creating jobs:', jobError)
        return NextResponse.json(
          { error: 'Failed to create jobs' },
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
