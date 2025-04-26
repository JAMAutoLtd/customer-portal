import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Define types to help TypeScript understand the data structure
interface OrderData {
  id: number
  user: {
    id: string
    full_name: string
  }
  customer_vehicles: {
    year: number
    make: string
    model: string
  }
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
  assigned_technician: number | null
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

    // Get all jobs with pending_review status
    const { data: jobsData, error: jobsError } = await supabase
      .from('jobs')
      .select(
        `
        id,
        order_id,
        status,
        requested_time,
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
      .eq('status', 'pending_review')
      .order('requested_time', { ascending: true })

    if (jobsError) {
      console.error('Supabase query error:', jobsError)
      return NextResponse.json(
        { error: 'Failed to fetch pending jobs', details: jobsError.message },
        { status: 500 },
      )
    }

    if (!jobsData || jobsData.length === 0) {
      return NextResponse.json([])
    }

    console.log('Job data example:', jobsData[0])

    // Type assertion to help TypeScript understand the structure
    const jobs = jobsData as unknown as JobData[]

    // Format the response to match the expected structure in the frontend
    const formattedJobs = jobs.map((job) => {
      try {
        // Handle potential data structure issues safely
        const order = job.orders || ({} as OrderData)
        const address = job.addresses || ({} as AddressData)

        // Extract user info from orders.users
        const userData =
          order.user && order.user ? order.user : { full_name: 'Unknown' }

        // Extract vehicle info
        const vehicleData = order.customer_vehicles || {
          year: 0,
          make: 'Unknown',
          model: 'Unknown',
        }

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
          requested_time: job.requested_time,
          equipment_required: equipmentRequired,
          assigned_technician: job.assigned_technician,
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
          status: job.status || 'pending_review',
          requested_time: job.requested_time || new Date().toISOString(),
          equipment_required: [],
          assigned_technician: job.assigned_technician,
        }
      }
    })

    return NextResponse.json(formattedJobs)
  } catch (error) {
    console.error('Error fetching pending jobs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending jobs' },
      { status: 500 },
    )
  }
}
