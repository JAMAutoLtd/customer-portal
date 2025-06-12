import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { count, error } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_review')

    if (error) {
      console.error('Supabase query error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch pending jobs count', details: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ count: count || 0 })
  } catch (error) {
    console.error('Error fetching pending jobs count:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending jobs count' },
      { status: 500 },
    )
  }
}
