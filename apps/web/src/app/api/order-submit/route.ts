import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { determineJobPriority } from '@/utils/jobs'
import { requireAuth, logSecurityEvent } from '@/middleware/permissions'
import { Database } from '@/types/database.types'

const JOB_DURATION = 90

export async function POST(request: Request) {
  const { userProfile, error: permissionError } = await requireAuth(request)

  if (permissionError) {
    await logSecurityEvent(
      userProfile,
      'order_submit_denied',
      'order-submit',
      false,
      {
        reason: 'authentication_required',
      },
    )
    return permissionError
  }

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
      // For staff created orders
      customerId,
      createdByStaff,
      staffUserId,
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
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser()

    if (sessionError || !user) {
      console.error(
        'Error getting session or user not authenticated:',
        sessionError,
      )
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 },
      )
    }

    // Determine the customer for the order
    let orderUserId = user.id
    let customerType: Database['public']['Enums']['customer_type'] =
      'residential' // default

    if (createdByStaff && customerId) {
      // Staff creating order for a customer - validate staff has permission
      if (!userProfile?.is_admin || !userProfile?.isTechnician) {
        await logSecurityEvent(
          userProfile,
          'unauthorized_staff_order_creation',
          'order-submit',
          false,
          {
            attempted_customer_id: customerId,
            staff_user_id: user.id,
          },
        )
        return NextResponse.json(
          { error: 'Insufficient permissions to create orders for customers' },
          { status: 403 },
        )
      }

      // Use the customer ID from the request
      orderUserId = customerId

      // Get customer's profile
      const { data: customerProfile, error: customerProfileError } =
        await supabase
          .from('users')
          .select('customer_type')
          .eq('id', customerId)
          .single()

      if (customerProfileError) {
        console.error('Error getting customer profile:', customerProfileError)
        return NextResponse.json(
          { error: 'Failed to retrieve customer profile' },
          { status: 500 },
        )
      }

      customerType = customerProfile.customer_type
    } else {
      // Self-service order - use authenticated user
      const { data: userProfileData, error: userProfileError } = await supabase
        .from('users')
        .select('customer_type')
        .eq('id', orderUserId)
        .single()

      if (userProfileError) {
        console.error('Error getting user profile:', userProfileError)
        return NextResponse.json(
          { error: 'Failed to retrieve user profile' },
          { status: 500 },
        )
      }

      customerType = userProfileData.customer_type
    }

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
        { status: 500 },
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
        { status: 400 },
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
        { status: 500 },
      )
    }

    const vehicleId = vehicle.id

    // Create order with vehicle ID and staff tracking
    const newOrderData: any = {
      user_id: orderUserId,
      vehicle_id: vehicleId,
      address_id: addressId,
      earliest_available_time: earliestDateTime.toISOString(),
      notes: notes || null,
    }

    // Add staff tracking fields if this is a staff-created order
    if (createdByStaff && staffUserId) {
      newOrderData.created_by_staff = true
      newOrderData.staff_user_id = staffUserId
    }

    const { data: orderResult, error: orderError } = await supabase
      .from('orders')
      .insert([newOrderData])
      .select()
      .single()

    if (orderError) {
      console.error('Error creating order:', orderError)
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 },
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
          })),
        )

      if (orderServicesError) {
        console.error('Error creating order services:', orderServicesError)
        return NextResponse.json(
          { error: 'Failed to create order services' },
          { status: 500 },
        )
      }

      // Get service details for each selected service
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id, service_name, service_category')
        .in(
          'id',
          selectedServiceIds.map((id: string) => parseInt(id)),
        )

      if (servicesError) {
        console.error('Error fetching services:', servicesError)
        return NextResponse.json(
          { error: 'Failed to fetch service details' },
          { status: 500 },
        )
      }

      // Create jobs with appropriate priorities
      const jobPromises = services.map(async (service) => {
        const priority = determineJobPriority(
          customerType,
          service.service_category,
        )

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
          { status: 500 },
        )
      }
    }

    // Log successful order creation
    await logSecurityEvent(userProfile, 'order_created', 'order-submit', true, {
      order_id: orderId,
      customer_id: orderUserId,
      created_by_staff: createdByStaff || false,
      staff_user_id: createdByStaff ? user.id : undefined,
      customer_type: customerType,
      services_count: selectedServiceIds?.length || 0,
    })

    return NextResponse.json({
      success: true,
      message: 'Order submitted successfully',
      orderId,
    })
  } catch (error) {
    console.error('Error submitting order:', error)
    return NextResponse.json(
      { error: 'Failed to submit order' },
      { status: 500 },
    )
  }
}
