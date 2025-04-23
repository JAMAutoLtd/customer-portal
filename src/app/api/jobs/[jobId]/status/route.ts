import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

interface Params {
  params: {
    jobId: string
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const jobId = params.jobId
    const { status } = await request.json()

    // Validate status
    const validStatuses = [
      'queued',
      'en_route',
      'in_progress',
      'pending_revisit',
      'completed',
      'cancelled',
    ]
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
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

    // Update the job status
    const { data, error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update job status', details: error.message },
        { status: 500 }
      )
    }

    // Return the updated job
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating job status:', error)
    return NextResponse.json(
      { error: 'Failed to update job status' },
      { status: 500 }
    )
  }
}
