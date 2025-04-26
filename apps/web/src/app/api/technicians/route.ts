import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('technicians')
      .select(
        `
        id,
        user:user_id (
          full_name
        )
      `,
      )
      .order('id')

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch technicians', details: error.message },
        { status: 500 },
      )
    }

    const formattedTechnicians = data.map((tech) => ({
      id: tech.id,
      // @ts-ignore
      name: tech.user.full_name || `Technician ${tech.id}`,
    }))

    return NextResponse.json(formattedTechnicians)
  } catch (error) {
    console.error('Error fetching technicians:', error)
    return NextResponse.json(
      { error: 'Failed to fetch technicians' },
      { status: 500 },
    )
  }
}
