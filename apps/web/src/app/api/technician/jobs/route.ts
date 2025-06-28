import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  TechnicianJobData,
  AddressData,
  TechnicianJobOrderData,
} from '@/types/api'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status') // 'active', 'completed', or 'all'

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Get the technician ID for the current user
    const { data: technicianData, error: technicianError } = await supabase
      .from('technicians')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (technicianError || !technicianData) {
      return NextResponse.json(
        { error: 'User is not a technician or technician record not found' },
        { status: 403 },
      )
    }

    const technicianId = technicianData.id

    // Build query based on status filter
    let query = supabase
      .from('jobs')
      .select(
        `
        id,
        order_id,
        status,
        requested_time,
        estimated_sched,
        job_duration,
        notes,
        technician_notes,
        service_id,
        assigned_technician,
        address:address_id (
          street_address,
          lat,
          lng
        ),
        service:service_id (
          service_name
        ),
        order:order_id (
          user:user_id (
            full_name
          ),
          vehicle:vehicle_id (
            year,
            make,
            model
          )
        )
      `,
      )
      .eq('assigned_technician', technicianId)

    if (statusFilter === 'completed') {
      query = query.in('status', ['completed', 'cancelled'])
      query = query.order('estimated_sched', { ascending: false }) // Most recent first for completed
    } else if (statusFilter === 'all') {
      query = query.order('estimated_sched', { ascending: true })
    } else {
      query = query.not('status', 'in', '(pending_review,completed,cancelled)')
      query = query.order('estimated_sched', { ascending: true })
    }

    const { data: jobsData, error: jobsError } = await query

    if (jobsError) {
      console.error('Supabase query error:', jobsError)
      return NextResponse.json(
        { error: 'Failed to fetch jobs', details: jobsError.message },
        { status: 500 },
      )
    }

    if (!jobsData || jobsData.length === 0) {
      return NextResponse.json([])
    }

    const jobs = jobsData as unknown as TechnicianJobData[]

    // Format the response to match the expected structure in the frontend
    const formattedJobs = jobs.map((job) => {
      try {
        // Handle potential data structure issues safely
        const order = job.order || ({} as TechnicianJobOrderData)
        const address = job.address || ({} as AddressData)

        // Extract user info
        const userData = order.user || { full_name: 'Unknown' }

        // Extract vehicle info
        const vehicleData = order.vehicle || {
          year: 0,
          make: 'Unknown',
          model: 'Unknown',
        }

        // Extract service info
        let serviceName = 'Unknown service'
        if (job.service) {
          serviceName = job.service.service_name || 'Unknown service'
        }

        return {
          id: job.id,
          order_id: job.order_id,
          customer_name: userData.full_name || 'Unknown customer',
          address: {
            street_address: address.street_address || 'Unknown address',
            lat: address.lat,
            lng: address.lng,
          },
          vehicle: {
            year: vehicleData.year || 0,
            make: vehicleData.make || 'Unknown',
            model: vehicleData.model || 'Unknown',
          },
          service_name: serviceName,
          status: job.status,
          estimated_sched: job.estimated_sched,
          requested_time: job.requested_time,
          assigned_technician: job.assigned_technician || 0,
        }
      } catch (error) {
        console.error('Error formatting job data:', error, job)
        // Return partial data to prevent the entire request from failing
        return {
          id: job.id,
          order_id: job.order_id || 0,
          customer_name: 'Data error',
          address: {
            street_address: 'Unknown address',
            lat: null,
            lng: null,
          },
          vehicle: {
            year: 0,
            make: 'Unknown',
            model: 'Unknown',
          },
          service_name: 'Unknown service',
          status: job.status || 'queued',
          estimated_sched: job.estimated_sched,
          requested_time: job.requested_time,
          assigned_technician: job.assigned_technician || 0,
        }
      }
    })

    return NextResponse.json(formattedJobs)
  } catch (error) {
    console.error('Error fetching technician jobs:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}
