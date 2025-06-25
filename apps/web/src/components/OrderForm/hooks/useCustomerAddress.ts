import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'
import { Customer } from '../types'

interface CustomerAddress {
  street_address: string
  lat?: number
  lng?: number
}

export const useCustomerAddress = (customer?: Customer | null) => {
  const [customerAddress, setCustomerAddress] =
    useState<CustomerAddress | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCustomerAddress = async () => {
      if (!customer?.home_address_id) {
        setCustomerAddress(null)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const { data, error } = await supabase
          .from('addresses')
          .select('street_address, lat, lng')
          .eq('id', customer.home_address_id)
          .single()

        if (error) {
          throw error
        }

        if (data) {
          setCustomerAddress(data)
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to fetch customer address'
        setError(errorMessage)
        console.error('Error fetching customer address:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCustomerAddress()
  }, [customer?.home_address_id])

  return { customerAddress, loading, error }
}
