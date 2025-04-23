import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

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

    // Get all technicians with their user information
    const { data, error } = await supabase
      .from('technicians')
      .select(
        `
        id,
        users!technicians_user_id_fkey (
          full_name
        )
      `
      )
      .order('id')

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch technicians', details: error.message },
        { status: 500 }
      )
    }

    // Format the data for the frontend
    const formattedTechnicians = data.map((tech) => ({
      id: tech.id,
      name: tech.users?.[0]?.full_name || `Technician ${tech.id}`,
    }))

    return NextResponse.json(formattedTechnicians)
  } catch (error) {
    console.error('Error fetching technicians:', error)
    return NextResponse.json(
      { error: 'Failed to fetch technicians' },
      { status: 500 }
    )
  }
}
