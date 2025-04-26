import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
    }

    // Get orders data with address and vehicle details
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(
        `
        id, 
        repair_order_number, 
        earliest_available_time, 
        notes, 
        invoice,
        addresses:address_id(id, street_address, lat, lng),
        vehicles:vehicle_id(id, vin, year, make, model)
      `,
      )
      .eq('user_id', user.id)
      .order('id', { ascending: false })

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json(
        { detail: 'Failed to fetch orders' },
        { status: 500 },
      )
    }

    // Get additional details for each order
    const ordersWithDetails = await Promise.all(
      (ordersData || []).map(async (order) => {
        const { data: servicesData } = await supabase
          .from('order_services')
          .select('services:service_id(id, service_name)')
          .eq('order_id', order.id)

        const { data: uploadsData } = await supabase
          .from('order_uploads')
          .select('id, file_name, file_url')
          .eq('order_id', order.id)

        const { data: jobsData } = await supabase
          .from('jobs')
          .select(
            'id, status, requested_time, estimated_sched, job_duration, notes',
          )
          .eq('order_id', order.id)

        const vehicle = order.vehicles
          ? {
              ...order.vehicles,
              ymm: `${order.vehicles.year || ''} ${
                order.vehicles.make || ''
              } ${order.vehicles.model || ''}`.trim(),
            }
          : null

        return {
          id: order.id,
          repair_order_number: order.repair_order_number,
          earliest_available_time: order.earliest_available_time,
          notes: order.notes,
          invoice: order.invoice,
          address: order.addresses,
          vehicle: vehicle,
          services: servicesData?.map((item) => item.services) || [],
          uploads: uploadsData || [],
          jobs: jobsData || [],
        }
      }),
    )

    return NextResponse.json(ordersWithDetails)
  } catch (error) {
    console.error('Error in orders API:', error)
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 },
    )
  }
}
