import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Define types to help TypeScript understand the data structure
interface OrderData {
  users: {
    full_name: string
  }[]
  customer_vehicles: {
    year: number
    make: string
    model: string
  }[]
}

interface AddressData {
  street_address: string
  lat?: number
  lng?: number
}

interface JobData {
  id: number
  order_id: number
  status: string
  requested_time: string
  estimated_sched: string
  job_duration?: number
  notes?: string
  technician_notes?: string
  addresses: AddressData
  services: {
    service_name: string
  }
  orders: OrderData
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Get the current user session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get the technician ID for the current user
    const { data: technicianData, error: technicianError } = await supabase
      .from('technicians')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (technicianError || !technicianData) {
      return NextResponse.json(
        { error: 'User is not a technician or technician record not found' },
        { status: 403 }
      )
    }

    const technicianId = technicianData.id

    // Get all jobs assigned to this technician (excluding pending_review status)
    const { data: jobsData, error: jobsError } = await supabase
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
        addresses:address_id (
          street_address,
          lat,
          lng
        ),
        services (
          service_name
        ),
        orders (
          users (
            full_name
          ),
          customer_vehicles (
            year,
            make,
            model
          )
        )
      `
      )
      .eq('assigned_technician', technicianId)
      .neq('status', 'pending_review')
      .order('estimated_sched', { ascending: true })

    if (jobsError) {
      console.error('Supabase query error:', jobsError)
      return NextResponse.json(
        { error: 'Failed to fetch jobs', details: jobsError.message },
        { status: 500 }
      )
    }

    if (!jobsData || jobsData.length === 0) {
      return NextResponse.json([])
    }

    // Type assertion to help TypeScript understand the structure
    const jobs = jobsData as unknown as JobData[]

    // Format the response to match the expected structure in the frontend
    const formattedJobs = jobs.map((job) => {
      try {
        // Handle potential data structure issues safely
        const order = job.orders || ({} as OrderData)
        const address = job.addresses || ({} as AddressData)

        // Extract user info
        const userData =
          order.users && order.users.length > 0
            ? order.users[0]
            : { full_name: 'Unknown' }

        // Extract vehicle info
        const vehicleData =
          order.customer_vehicles && order.customer_vehicles.length > 0
            ? order.customer_vehicles[0]
            : { year: 0, make: 'Unknown', model: 'Unknown' }

        // Extract service info
        let serviceName = 'Unknown service'
        if (job.services) {
          serviceName = job.services.service_name || 'Unknown service'
        }

        // Mock equipment data (would need a real implementation)
        const equipmentRequired = ['Scanner', 'ADAS Tools', 'Diagnostic cable']

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
          equipment_required: equipmentRequired,
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
          estimated_sched: job.estimated_sched || new Date().toISOString(),
          requested_time: job.requested_time || new Date().toISOString(),
          equipment_required: [],
        }
      }
    })

    return NextResponse.json(formattedJobs)
  } catch (error) {
    console.error('Error fetching technician jobs:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}
