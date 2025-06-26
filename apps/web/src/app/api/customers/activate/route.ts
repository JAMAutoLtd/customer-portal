import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logSecurityEvent } from '@/middleware/permissions';

const RATE_LIMIT_WINDOW_HOURS = 1;
const MAX_EMAILS_PER_WINDOW = 3;

/**
 * Customer Account Activation API
 * Triggers password reset email for newly created customer accounts
 * Includes rate limiting (3 emails per hour per user)
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      );
    }

    // Create admin client for user lookup and rate limiting checks
    const cookieStore = await cookies();
    const adminSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              )
            } catch (error) {
              // Handle cookie setting error
            }
          },
        },
      },
    );

    // Get request IP and User-Agent for rate limiting
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 
               request.headers.get('x-real-ip') || 
               '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Check if user exists in auth system
    const { data: authUsers } = await adminSupabase.auth.admin.listUsers();
    const targetUser = authUsers?.users?.find(user => 
      user.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      // Don't reveal if email exists or not for security
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, an activation link has been sent.'
      });
    }

    // Check if user already has confirmed email
    if (targetUser.email_confirmed_at) {
      return NextResponse.json({
        success: true,
        message: 'Account is already activated. Try logging in or use forgot password if needed.'
      });
    }

    // Check rate limiting for this user
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - RATE_LIMIT_WINDOW_HOURS);

    const { data: recentEmails, error: rateLimitError } = await adminSupabase
      .from('customer_activation_emails')
      .select('id')
      .eq('user_id', targetUser.id)
      .gte('email_sent_at', windowStart.toISOString());

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
      return NextResponse.json(
        { error: 'Unable to process activation request' },
        { status: 500 }
      );
    }

    if (recentEmails && recentEmails.length >= MAX_EMAILS_PER_WINDOW) {
      // Log rate limit violation
      await logSecurityEvent(null, 'activation_rate_limit_exceeded', 'customers/activate', false, {
        email: email.toLowerCase(),
        user_id: targetUser.id,
        ip_address: ip,
        recent_email_count: recentEmails.length
      });

      return NextResponse.json({
        error: 'Too many activation requests. Please try again later.',
        retry_after_minutes: 60
      }, { status: 429 });
    }

    // Record the activation email request
    const { error: recordError } = await adminSupabase
      .from('customer_activation_emails')
      .insert({
        user_id: targetUser.id,
        ip_address: ip,
        user_agent: userAgent
      });

    if (recordError) {
      console.error('Failed to record activation request:', recordError);
      return NextResponse.json(
        { error: 'Unable to process activation request' },
        { status: 500 }
      );
    }

    // Trigger password reset email using Supabase's built-in flow
    const { error: resetError } = await adminSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: email.toLowerCase(),
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?redirect_to=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')}/dashboard`
      }
    });

    if (resetError) {
      console.error('Failed to send activation email:', resetError);
      return NextResponse.json(
        { error: 'Unable to send activation email' },
        { status: 500 }
      );
    }

    // Log successful activation email sent
    await logSecurityEvent(null, 'activation_email_sent', 'customers/activate', true, {
      email: email.toLowerCase(),
      user_id: targetUser.id,
      ip_address: ip
    });

    return NextResponse.json({
      success: true,
      message: 'Activation email sent! Check your inbox and follow the instructions to set your password.'
    });

  } catch (error) {
    console.error('Customer activation error:', error);
    return NextResponse.json(
      { error: 'Failed to process activation request' },
      { status: 500 }
    );
  }
}