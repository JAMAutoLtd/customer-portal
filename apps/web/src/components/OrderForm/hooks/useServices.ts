import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'
import { Service } from '@/types'

export const useServices = () => {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('services')
          .select('id, service_name, slug')
          .order('service_name')

        if (error) throw error
        setServices(data || [])
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to fetch services'
        setError(errorMessage)
        console.error('Error fetching services:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchServices()
  }, [])

  return { services, loading, error }
}
