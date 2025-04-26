import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { PendingJob, Technician } from './types'

export function useTechnicians() {
  const { user } = useAuth()
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        const response = await fetch('/api/technicians')
        if (!response.ok) {
          throw new Error('Failed to fetch technicians')
        }

        const data = await response.json()
        setTechnicians(data)
      } catch (error) {
        console.error('Error fetching technicians:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchTechnicians()
    }
  }, [user])

  return { technicians, isLoading }
}

export function usePendingJobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<PendingJob[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchPendingJobs = async () => {
      try {
        const response = await fetch('/api/jobs/pending')
        if (!response.ok) {
          throw new Error('Failed to fetch pending jobs')
        }

        const data = await response.json()
        setJobs(data)
      } catch (error) {
        console.error('Error fetching pending jobs:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchPendingJobs()
    }
  }, [user])

  const assignJob = async (jobId: number, technicianId: number) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          technician_id: technicianId,
          status: 'queued',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to assign job')
      }

      // Remove job from the list since it's no longer pending
      setJobs((prev) => prev.filter((job) => job.id !== jobId))
      return true
    } catch (error) {
      console.error('Error assigning job:', error)
      return false
    }
  }

  return { jobs, isLoading, assignJob }
}

export const openLocationInMaps = (lat?: number, lng?: number) => {
  if (lat && lng) {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      '_blank',
    )
  }
}
