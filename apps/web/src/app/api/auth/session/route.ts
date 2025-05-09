import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      console.error('Session error:', error)
      return NextResponse.json({ session: null }, { status: 401 })
    }

    if (!data.session) {
      return NextResponse.json({ session: null }, { status: 200 })
    }

    // Get user profile data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.session.user.id)
      .single()

    if (userError) {
      console.error('Error fetching user profile:', userError)
      // Still return session data even if profile fetch fails
      return NextResponse.json(
        {
          session: data.session,
          userProfile: null,
        },
        { status: 200 },
      )
    }

    return NextResponse.json(
      {
        session: data.session,
        userProfile: userData,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Session error:', error)
    return NextResponse.json({ session: null }, { status: 500 })
  }
}
