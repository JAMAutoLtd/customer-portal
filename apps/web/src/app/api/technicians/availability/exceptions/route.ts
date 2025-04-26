import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

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

    if (technicianError) throw technicianError
    if (!technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 },
      )
    }

    // Validate request body
    if (!body.date || !body.exception_type || body.is_available === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      )
    }

    // If it's a time off, ensure no time slots are provided
    if (
      body.exception_type === 'time_off' &&
      (body.start_time || body.end_time)
    ) {
      return NextResponse.json(
        { error: 'Time slots should not be provided for time off' },
        { status: 400 },
      )
    }

    // If it's custom hours, ensure time slots are provided
    if (
      body.exception_type === 'custom_hours' &&
      (!body.start_time || !body.end_time)
    ) {
      return NextResponse.json(
        { error: 'Time slots are required for custom hours' },
        { status: 400 },
      )
    }

    // Check if an exception already exists for this date and technician
    const { data: existingException } = await supabase
      .from('technician_availability_exceptions')
      .select('id')
      .eq('technician_id', technician.id)
      .eq('date', body.date)
      .single()

    const exceptionData = {
      technician_id: technician.id,
      exception_type: body.exception_type,
      date: body.date,
      is_available: body.is_available,
      start_time: body.is_available === false ? null : body.start_time,
      end_time: body.is_available === false ? null : body.end_time,
      reason: body.reason,
    }

    let result
    if (existingException) {
      // Update existing exception
      result = await supabase
        .from('technician_availability_exceptions')
        .update(exceptionData)
        .eq('id', existingException.id)
        .select()
        .single()
    } else {
      // Insert new exception
      result = await supabase
        .from('technician_availability_exceptions')
        .insert(exceptionData)
        .select()
        .single()
    }

    const { data, error } = result

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating exception:', error)
    return NextResponse.json(
      { error: 'Failed to create exception' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const exceptionId = searchParams.get('exception_id')

    if (!exceptionId) {
      return NextResponse.json(
        { error: 'exception_id is required' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

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

    if (technicianError) throw technicianError
    if (!technician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 },
      )
    }

    const { error } = await supabase
      .from('technician_availability_exceptions')
      .delete()
      .eq('id', parseInt(exceptionId))
      .eq('technician_id', technician.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting exception:', error)
    return NextResponse.json(
      { error: 'Failed to delete exception' },
      { status: 500 },
    )
  }
}
