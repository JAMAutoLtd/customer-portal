import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { StandardJobData } from '@/types/api'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get jobs with completed or cancelled status
    const { data: jobsData, error: jobsError } = await supabase
      .from('jobs')
      .select(
        `
        id,
        order_id,
        status,
        estimated_sched,
        assigned_technician,
        service_id,
        addresses:address_id (
          street_address,
          lat,
          lng
        ),
        services (
          id,
          service_name
        ),
        orders (
          id,
          users (
            id,
            full_name
          ),
          customer_vehicles:vehicle_id (
            year,
            make,
            model
          )
        )
      `,
      )
      .in('status', ['completed', 'cancelled'])
      .order('estimated_sched', { ascending: false }) // Most recent first for completed jobs

    if (jobsError) {
      console.error('Supabase query error:', jobsError)
      return NextResponse.json(
        { error: 'Failed to fetch completed jobs', details: jobsError.message },
        { status: 500 },
      )
    }

    if (!jobsData || jobsData.length === 0) {
      return NextResponse.json([])
    }

    const jobs = jobsData as unknown as StandardJobData[]

    const transformedJobs = jobs.map((job) => ({
      id: job.id,
      order_id: job.order_id,
      status: job.status,
      estimated_sched: job.estimated_sched,
      assigned_technician: job.assigned_technician,
      customer_name: job.orders.users.full_name,
      address: {
        street_address: job.addresses.street_address,
        lat: job.addresses.lat,
        lng: job.addresses.lng,
      },
      vehicle: {
        year: job.orders.customer_vehicles.year,
        make: job.orders.customer_vehicles.make,
        model: job.orders.customer_vehicles.model,
      },
      service_name: job.services.service_name,
      requested_time: job.estimated_sched, // Use estimated_sched as fallback
    }))

    return NextResponse.json(transformedJobs)
  } catch (error) {
    console.error('Error fetching completed jobs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch completed jobs' },
      { status: 500 },
    )
  }
}
