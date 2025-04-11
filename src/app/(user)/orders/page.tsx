'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { OrderCard } from '@/components/OrderCard'
import { Order } from '@/types'
import { DocumentIcon } from '@/components/icons/DocumentIcon'
import { Loader } from '@/components/ui/Loader'

export default function Orders() {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login')
        return
      }

      if (userProfile?.is_admin) {
        router.push('/availability')
        return
      }
    }
  }, [user, userProfile, loading, router])

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user || userProfile?.is_admin) return

      try {
        const response = await fetch('/api/orders')

        if (!response.ok) {
          throw new Error(`Error fetching orders: ${response.statusText}`)
        }

        const data = await response.json()
        setOrders(data)
      } catch (error) {
        console.error('Error fetching orders:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (user && !userProfile?.is_admin) {
      fetchOrders()
    }
  }, [user, userProfile])

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader />
      </div>
    )
  }

  if (userProfile?.is_admin) {
    return null
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[768px]">
      <h1 className="text-2xl font-bold mb-6">Your Orders</h1>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="flex justify-center mb-4">
            <DocumentIcon
              className="h-12 w-12 text-gray-400"
              aria-hidden="true"
            />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No orders yet
          </h3>
          <p className="text-gray-500 mb-6">
            Get started by creating a new service order
          </p>
          <button
            onClick={() => router.push('/order/new')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <span className="mr-2">+</span> New Order
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  )
}
