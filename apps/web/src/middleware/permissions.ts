import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { 
  checkAPIPermissions, 
  APIPermissionCheck,
  PermissionChecker 
} from '@/utils/permissions'
import { UserProfile } from '@/types'

/**
 * Server-side permission middleware for API routes
 */
export async function withPermissions(
  request: Request,
  requirements: APIPermissionCheck
): Promise<{ userProfile: UserProfile | null; error?: NextResponse }> {
  try {
    // Skip permission check for non-protected endpoints
    if (!requirements.requiresAuth && 
        !requirements.requiresAdmin && 
        !requirements.requiresTechnician && 
        !requirements.requiresAdminTechnician) {
      return { userProfile: null }
    }

    const supabase = createClient()
    
    // Get the current user session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      if (requirements.requiresAuth) {
        return {
          userProfile: null,
          error: NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }
      }
      return { userProfile: null }
    }

    // Get user profile with permission information
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('id, full_name, phone, home_address_id, is_admin, customer_type')
      .eq('id', user.id)
      .single()

    if (profileError || !userProfile) {
      return {
        userProfile: null,
        error: NextResponse.json(
          { error: 'User profile not found' },
          { status: 404 }
        )
      }
    }

    // Check if user is a technician (you may need to adjust this query based on your schema)
    const { data: technicianData } = await supabase
      .from('technicians')
      .select('id')
      .eq('id', user.id)
      .single()

    const fullUserProfile: UserProfile = {
      ...userProfile,
      isTechnician: !!technicianData,
      email: userProfile.email || user.email || undefined
    }

    // Check permissions
    const permissionResult = checkAPIPermissions(fullUserProfile, requirements)
    
    if (!permissionResult.allowed) {
      return {
        userProfile: fullUserProfile,
        error: NextResponse.json(
          { 
            error: permissionResult.reason || 'Access denied',
            required_permissions: requirements
          },
          { status: 403 }
        )
      }
    }

    return { userProfile: fullUserProfile }
  } catch (error) {
    console.error('Permission middleware error:', error)
    return {
      userProfile: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Helper function to require admin-technician permissions
 */
export async function requireAdminTechnician(
  request: Request
): Promise<{ userProfile: UserProfile | null; error?: NextResponse }> {
  return withPermissions(request, {
    requiresAuth: true,
    requiresAdmin: false,
    requiresTechnician: false,
    requiresAdminTechnician: true
  })
}

/**
 * Helper function to require admin permissions
 */
export async function requireAdmin(
  request: Request
): Promise<{ userProfile: UserProfile | null; error?: NextResponse }> {
  return withPermissions(request, {
    requiresAuth: true,
    requiresAdmin: true,
    requiresTechnician: false,
    requiresAdminTechnician: false
  })
}

/**
 * Helper function to require authentication only
 */
export async function requireAuth(
  request: Request
): Promise<{ userProfile: UserProfile | null; error?: NextResponse }> {
  return withPermissions(request, {
    requiresAuth: true,
    requiresAdmin: false,
    requiresTechnician: false,
    requiresAdminTechnician: false
  })
}

/**
 * Middleware for order creation endpoints
 */
export async function requireOrderCreationPermissions(
  request: Request
): Promise<{ userProfile: UserProfile | null; error?: NextResponse }> {
  const { userProfile, error } = await requireAdminTechnician(request)
  
  if (error) {
    return { userProfile, error }
  }

  // Additional validation for order creation
  if (userProfile) {
    const checker = new PermissionChecker(userProfile)
    
    if (!checker.canCreateOrdersForCustomers()) {
      return {
        userProfile,
        error: NextResponse.json(
          { 
            error: 'Insufficient permissions for order creation on behalf of customers',
            user_level: checker.getPermissionLevel()
          },
          { status: 403 }
        )
      }
    }
  }

  return { userProfile }
}

/**
 * Log security events for audit trail
 */
export async function logSecurityEvent(
  userProfile: UserProfile | null,
  action: string,
  resource: string,
  success: boolean,
  details?: Record<string, any>
) {
  try {
    const supabase = createClient()
    
    // You can implement security logging here
    // This could be a separate audit_logs table
    console.log('Security Event:', {
      userId: userProfile?.id,
      userLevel: userProfile ? new PermissionChecker(userProfile).getPermissionLevel() : 'anonymous',
      action,
      resource,
      success,
      timestamp: new Date().toISOString(),
      details
    })
    
    // Example: Store in audit log table
    // await supabase.from('audit_logs').insert({
    //   user_id: userProfile?.id,
    //   action,
    //   resource,
    //   success,
    //   details,
    //   created_at: new Date().toISOString()
    // })
  } catch (error) {
    console.error('Failed to log security event:', error)
  }
}