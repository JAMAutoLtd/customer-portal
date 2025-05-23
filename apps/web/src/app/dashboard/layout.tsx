'use client'

import { Button } from '@/components/ui/Button'
import {
  ADMIN_ROUTES,
  AVAILABILITY_ROUTE,
  CUSTOMER_ROUTES,
  JOBS_ROUTE,
  NEW_ORDER_ROUTE,
  ORDERS_ROUTE,
} from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

const navigation = [
  { name: 'Orders', href: ORDERS_ROUTE, adminOnly: false },
  { name: 'Jobs', href: JOBS_ROUTE, adminOnly: true },
  {
    name: 'Availability',
    href: AVAILABILITY_ROUTE,
    adminOnly: true,
  },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { logout, userProfile, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return

    if (ADMIN_ROUTES.includes(pathname) && !userProfile?.is_admin) {
      router.push(ORDERS_ROUTE)
    }

    if (CUSTOMER_ROUTES.includes(pathname) && userProfile?.is_admin) {
      router.push(JOBS_ROUTE)
    }
  }, [loading, pathname, userProfile, router])

  if (loading) {
    return null
  }

  const handleNewOrder = () => {
    router.push(NEW_ORDER_ROUTE)
  }

  const handleLogout = async () => {
    await logout()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center h-16 px-4 max-w-[768px]">
          <div className="flex gap-3 items-end self-end">
            {navigation
              .filter(
                (item) =>
                  (item.adminOnly === false &&
                    userProfile?.is_admin === false) ||
                  (item.adminOnly === true && userProfile?.is_admin === true),
              )
              .map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-4 py-4 cursor-pointer font-bold transition-colors rounded-t-md  ${
                    pathname === item.href
                      ? 'text-gray-900  bg-gray-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
          </div>
          <div className="flex gap-3">
            {pathname !== NEW_ORDER_ROUTE && !userProfile?.is_admin && (
              <Button onClick={handleNewOrder}>
                <span className="mr-2">+</span> New Order
              </Button>
            )}

            <Button onClick={handleLogout} variant="destructive">
              Logout
            </Button>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
