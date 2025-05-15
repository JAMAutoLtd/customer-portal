'use client'

import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'

const navigation = [
  { name: 'Orders', href: '/dashboard/orders', adminOnly: false },
  { name: 'Jobs', href: '/dashboard/jobs', adminOnly: true },
  {
    name: 'Availability',
    href: '/dashboard/availability',
    adminOnly: true,
  },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { logout, userProfile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const handleNewOrder = () => {
    router.push('/dashboard/order/new')
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
            {pathname !== '/dashboard/order/new' && !userProfile?.is_admin && (
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
