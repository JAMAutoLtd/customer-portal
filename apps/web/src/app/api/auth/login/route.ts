import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { detail: 'Email and password are required' },
        { status: 400 },
      )
    }

    // Create a Supabase client with server-side cookies
    const cookieStore = await cookies()
    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value
          },
          set(name, value, options) {
            try {
              cookieStore.set(name, value, options)
            } catch (error) {
              // Handle cookie setting error
            }
          },
          remove(name, options) {
            try {
              cookieStore.set(name, '', { ...options, maxAge: 0 })
            } catch (error) {
              // Handle cookie removal error
            }
          },
        },
      },
    )

    // Authenticate user with Supabase Auth
    const { data, error } = await supabaseServer.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 401 })
    }

    if (!data.user) {
      return NextResponse.json(
        { detail: 'Authentication failed' },
        { status: 401 },
      )
    }

    // Get user data from our database
    const { data: userData, error: userError } = await supabaseServer
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()

    if (userError) {
      console.error('Failed to fetch user data:', userError)
      // Still return success since auth was successful
    }

    // Determine redirect URL based on admin status
    const redirectUrl = userData?.is_admin ? '/jobs' : '/orders'

    const response = NextResponse.json(
      {
        message: 'Login successful',
        user: {
          id: data.user.id,
          email: data.user.email,
          ...userData,
        },
        redirectUrl,
      },
      { status: 200 },
    )

    // The session cookies are already set by the supabaseServer client
    // No need to manually set them again

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ detail: 'Login failed' }, { status: 500 })
  }
}
