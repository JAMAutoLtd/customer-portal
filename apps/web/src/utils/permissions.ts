import { UserProfile } from '@/types'

export interface PermissionContext {
  userProfile: UserProfile | null
  loading: boolean
}

/**
 * Permission utility functions for checking user access rights
 */
export class PermissionChecker {
  private userProfile: UserProfile | null

  constructor(userProfile: UserProfile | null) {
    this.userProfile = userProfile
  }

  /**
   * Check if user is an admin
   */
  isAdmin(): boolean {
    return this.userProfile?.is_admin === true
  }

  /**
   * Check if user is a technician
   */
  isTechnician(): boolean {
    return this.userProfile?.isTechnician === true
  }

  /**
   * Check if user is an admin-technician (can access order entry)
   */
  isAdminTechnician(): boolean {
    return this.isAdmin() && this.isTechnician()
  }

  /**
   * Check if user can access order entry functionality
   */
  canAccessOrderEntry(): boolean {
    return this.isAdminTechnician()
  }

  /**
   * Check if user can create orders on behalf of customers
   */
  canCreateOrdersForCustomers(): boolean {
    return this.isAdminTechnician()
  }

  /**
   * Check if user can manage customer accounts
   */
  canManageCustomers(): boolean {
    return this.isAdminTechnician()
  }

  /**
   * Check if user can access admin-only features
   */
  canAccessAdminFeatures(): boolean {
    return this.isAdmin()
  }

  /**
   * Get user's permission level as a string
   */
  getPermissionLevel(): 'customer' | 'admin' | 'technician' | 'admin-technician' {
    if (this.isAdminTechnician()) return 'admin-technician'
    if (this.isAdmin()) return 'admin'
    if (this.isTechnician()) return 'technician'
    return 'customer'
  }

  /**
   * Get a human-readable description of user's permissions
   */
  getPermissionDescription(): string {
    const level = this.getPermissionLevel()
    switch (level) {
      case 'admin-technician':
        return 'Admin Technician - Full access to order entry and customer management'
      case 'admin':
        return 'Administrator - Management access'
      case 'technician':
        return 'Technician - Field operations access'
      case 'customer':
        return 'Customer - Self-service access'
      default:
        return 'Unknown permission level'
    }
  }
}

/**
 * Hook-like function to create a permission checker
 */
export function createPermissionChecker(userProfile: UserProfile | null): PermissionChecker {
  return new PermissionChecker(userProfile)
}

/**
 * Permission check result interface
 */
export interface PermissionResult {
  allowed: boolean
  reason?: string
  redirectTo?: string
}

/**
 * Check permissions for order entry access
 */
export function checkOrderEntryPermission(userProfile: UserProfile | null): PermissionResult {
  if (!userProfile) {
    return {
      allowed: false,
      reason: 'User not authenticated',
      redirectTo: '/login'
    }
  }

  const checker = new PermissionChecker(userProfile)
  
  if (!checker.canAccessOrderEntry()) {
    return {
      allowed: false,
      reason: 'Insufficient permissions. Admin-technician role required.',
      redirectTo: userProfile.is_admin ? '/dashboard/jobs' : '/dashboard/orders'
    }
  }

  return { allowed: true }
}

/**
 * Permission middleware for API routes
 */
export interface APIPermissionCheck {
  requiresAuth: boolean
  requiresAdmin: boolean
  requiresTechnician: boolean
  requiresAdminTechnician: boolean
}

export function checkAPIPermissions(
  userProfile: UserProfile | null,
  requirements: APIPermissionCheck
): PermissionResult {
  if (requirements.requiresAuth && !userProfile) {
    return {
      allowed: false,
      reason: 'Authentication required'
    }
  }

  if (!userProfile) {
    return { allowed: true } // Public endpoint
  }

  const checker = new PermissionChecker(userProfile)

  if (requirements.requiresAdminTechnician && !checker.isAdminTechnician()) {
    return {
      allowed: false,
      reason: 'Admin-technician role required'
    }
  }

  if (requirements.requiresAdmin && !checker.isAdmin()) {
    return {
      allowed: false,
      reason: 'Admin role required'
    }
  }

  if (requirements.requiresTechnician && !checker.isTechnician()) {
    return {
      allowed: false,
      reason: 'Technician role required'
    }
  }

  return { allowed: true }
}