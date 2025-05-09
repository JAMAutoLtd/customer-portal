import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function middleware(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // If there's no session and the user is trying to access a protected route
    if (!session && request.nextUrl.pathname.startsWith('/(user)')) {
      const redirectUrl = new URL('/login', request.url)
      // Add the original URL as a redirect parameter
      redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    return NextResponse.next()
  } catch (error) {
    console.error('Middleware error:', error)
    // In case of error, redirect to login to be safe
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

// Configure which routes to run the middleware on
export const config = {
  matcher: ['/(user)/:path*'],
}
