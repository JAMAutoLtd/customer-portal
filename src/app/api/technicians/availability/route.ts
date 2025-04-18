import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { parseISO, format } from 'date-fns'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    console.log(
      'API Request - searchParams:',
      Object.fromEntries(searchParams.entries())
    )
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError) {
      console.error('API Error - User authentication error:', userError)
      throw userError
    }
    if (!user) {
      console.log('API Error - No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('API Request - Authenticated user:', user.id)

    // Get the technician record for the authenticated user
    const { data: technician, error: technicianError } = await supabase
      .from('technicians')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (technicianError) {
      console.error('API Error - Technician lookup error:', technicianError)
      throw technicianError
    }
    if (!technician) {
      console.log('API Error - No technician found for user:', user.id)
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      )
    }

    console.log('API Request - Found technician:', technician.id)

    // Get default hours
    const { data: defaultHours, error: defaultError } = await supabase
      .from('technician_default_hours')
      .select('*')
      .eq('technician_id', technician.id)
      .order('day_of_week')

    if (defaultError) {
      console.error('API Error - Default hours lookup error:', defaultError)
      throw defaultError
    }

    console.log('API Request - Found default hours:', defaultHours?.length || 0)

    // Get exceptions for the date range
    const { data: exceptions, error: exceptionsError } = await supabase
      .from('technician_availability_exceptions')
      .select('*')
      .eq('technician_id', technician.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('created_at', { ascending: false })

    if (exceptionsError) {
      console.error('API Error - Exceptions lookup error:', exceptionsError)
      throw exceptionsError
    }

    console.log('API Request - Found exceptions:', exceptions?.length || 0)

    // Generate availability for each day in the range
    const start = parseISO(startDate)
    const end = parseISO(endDate)
    const availabilities = []

    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      const dayOfWeek = date.getDay()
      const dateStr = format(date, 'yyyy-MM-dd')

      // Find default hours for this day
      const defaultHour = defaultHours?.find(
        (dh) => dh.day_of_week === dayOfWeek
      )

      // Find most recent exception for this date (will be first in array due to ordering)
      const exception = exceptions?.find((e) => e.date === dateStr)

      availabilities.push({
        date: dateStr,
        is_available: exception
          ? exception.is_available
          : defaultHour
          ? defaultHour.is_available
          : false,
        start_time: exception?.start_time || defaultHour?.start_time,
        end_time: exception?.end_time || defaultHour?.end_time,
        reason: exception?.reason,
      })
    }

    return NextResponse.json({
      start_date: startDate,
      end_date: endDate,
      availabilities,
      default_hours: defaultHours || [],
    })
  } catch (error) {
    console.error('API Error - Unhandled error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch availability',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    console.log('🌟 body', body)

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the technician record for the authenticated user
    const { data: technician, error: technicianError } = await supabase
      .from('technicians')
      .select('id')
      .eq('user_id', user.id)
      .single()

    console.log('API Request - Technician:', technician)

    if (technicianError) throw technicianError
    if (!technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      )
    }

    // Validate request body
    if (body.day_of_week === undefined || !body.start_time || !body.end_time) {
      return NextResponse.json(
        { error: 'Missing required fields: ' + body },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('technician_default_hours')
      .upsert(
        {
          technician_id: technician.id,
          day_of_week: body.day_of_week,
          start_time: body.start_time,
          end_time: body.end_time,
          is_available: body.is_available,
        },
        {
          onConflict: 'technician_id,day_of_week',
        }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error setting default hours:', error)
    return NextResponse.json(
      { error: 'Failed to set default hours' },
      { status: 500 }
    )
  }
}
