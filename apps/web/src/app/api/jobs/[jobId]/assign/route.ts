import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params
    const { technician_id, status = 'queued' } = await request.json()

    // Validate technician_id
    if (!technician_id || isNaN(parseInt(technician_id))) {
      return NextResponse.json(
        { error: 'Invalid technician ID' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    // Get the current user session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify that the technician exists
    const { data: technicianData, error: technicianError } = await supabase
      .from('technicians')
      .select('id')
      .eq('id', technician_id)
      .single()

    if (technicianError || !technicianData) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 },
      )
    }

    // Update the job with the new technician and status
    const { data, error } = await supabase
      .from('jobs')
      .update({
        assigned_technician: technician_id,
        status,
      })
      .eq('id', jobId)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to assign job', details: error.message },
        { status: 500 },
      )
    }

    // Return the updated job
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error assigning job:', error)
    return NextResponse.json({ error: 'Failed to assign job' }, { status: 500 })
  }
}
