'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { 
  PermissionChecker, 
  checkOrderEntryPermission
} from '@/utils/permissions'
import { Loader } from '@/components/ui/Loader'

interface PermissionGuardProps {
  children: ReactNode
  fallback?: ReactNode
  requiresAuth?: boolean
  requiresAdmin?: boolean
  requiresTechnician?: boolean
  requiresAdminTechnician?: boolean
  redirectOnFailure?: boolean
  showError?: boolean
}

/**
 * Permission guard component that conditionally renders children based on user permissions
 */
export function PermissionGuard({
  children,
  fallback = null,
  requiresAuth = false,
  requiresAdmin = false,
  requiresTechnician = false,
  requiresAdminTechnician = false,
  redirectOnFailure = false,
  showError = true,
}: PermissionGuardProps) {
  const { userProfile, loading } = useAuth()
  const router = useRouter()

  // Show loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center p-4">
        <Loader />
      </div>
    )
  }

  // Check authentication
  if (requiresAuth && !userProfile) {
    if (redirectOnFailure) {
      router.push('/login')
      return null
    }
    
    if (showError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-red-800 font-medium">Authentication Required</p>
          <p className="text-red-600 text-sm mt-1">
            Please log in to access this feature.
          </p>
        </div>
      )
    }
    
    return fallback
  }

  // Create permission checker
  const checker = new PermissionChecker(userProfile)

  // Check specific permission requirements
  let hasPermission = true
  let errorMessage = ''

  if (requiresAdminTechnician && !checker.isAdminTechnician()) {
    hasPermission = false
    errorMessage = 'Admin-technician role required to access this feature.'
  } else if (requiresAdmin && !checker.isAdmin()) {
    hasPermission = false
    errorMessage = 'Administrator role required to access this feature.'
  } else if (requiresTechnician && !checker.isTechnician()) {
    hasPermission = false
    errorMessage = 'Technician role required to access this feature.'
  }

  // Handle permission failure
  if (!hasPermission) {
    if (redirectOnFailure) {
      const redirectTo = userProfile?.is_admin ? '/dashboard/jobs' : '/dashboard/orders'
      router.push(redirectTo)
      return null
    }

    if (showError) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-yellow-800 font-medium">Access Restricted</p>
          <p className="text-yellow-600 text-sm mt-1">{errorMessage}</p>
          <p className="text-yellow-600 text-xs mt-2">
            Current role: {checker.getPermissionDescription()}
          </p>
        </div>
      )
    }

    return fallback
  }

  // User has required permissions
  return <>{children}</>
}

/**
 * Specialized guard for order entry functionality
 */
export function OrderEntryGuard({
  children,
  fallback = null,
  redirectOnFailure = false,
  showError = true,
}: {
  children: ReactNode
  fallback?: ReactNode
  redirectOnFailure?: boolean
  showError?: boolean
}) {
  return (
    <PermissionGuard
      requiresAdminTechnician={true}
      fallback={fallback}
      redirectOnFailure={redirectOnFailure}
      showError={showError}
    >
      {children}
    </PermissionGuard>
  )
}

/**
 * Hook for checking permissions in components
 */
export function usePermissions() {
  const { userProfile, loading } = useAuth()
  
  const checker = new PermissionChecker(userProfile)
  
  return {
    userProfile,
    loading,
    checker,
    isAdmin: checker.isAdmin(),
    isTechnician: checker.isTechnician(),
    isAdminTechnician: checker.isAdminTechnician(),
    canAccessOrderEntry: checker.canAccessOrderEntry(),
    canCreateOrdersForCustomers: checker.canCreateOrdersForCustomers(),
    canManageCustomers: checker.canManageCustomers(),
    permissionLevel: checker.getPermissionLevel(),
    permissionDescription: checker.getPermissionDescription(),
    checkOrderEntryPermission: () => checkOrderEntryPermission(userProfile),
  }
}