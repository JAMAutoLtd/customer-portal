import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  PendingJob,
  TechnicianJob,
  Technician,
  GroupedJobs,
  BaseJob,
} from './types'
import { groupJobsByDate } from './utils'

export const GOOGLE_MAPS_URL = 'https://www.google.com/maps/dir/?api=1'

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

export function useQueuedJobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<TechnicianJob[]>([])
  const [groupedJobs, setGroupedJobs] = useState<GroupedJobs>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/technician/jobs')
        if (!response.ok) {
          throw new Error('Failed to fetch jobs')
        }

        const data = await response.json()
        setJobs(data)

        const grouped = groupJobsByDate(data)
        setGroupedJobs(grouped)
      } catch (error) {
        console.error('Error fetching jobs:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchJobs()
    }
  }, [user])

  const updateJobStatus = useCallback(
    async (jobId: number, status: TechnicianJob['status']) => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        })

        if (!response.ok) {
          throw new Error(`Failed to update job status to ${status}`)
        }

        // Update job in the local state
        setJobs((prev) =>
          prev.map((job) => (job.id === jobId ? { ...job, status } : job)),
        )

        // Update grouped jobs
        setGroupedJobs((prev) => {
          const newGrouped = { ...prev }
          Object.keys(newGrouped).forEach((dateKey) => {
            newGrouped[dateKey] = newGrouped[dateKey].map((job) =>
              job.id === jobId ? { ...job, status } : job,
            )
          })
          return newGrouped
        })

        return true
      } catch (error) {
        console.error(`Error updating job status to ${status}:`, error)
        return false
      }
    },
    [],
  )

  const goToJob = useCallback(
    async (jobId: number, lat?: number, lng?: number) => {
      if (lat && lng) {
        window.open(`${GOOGLE_MAPS_URL}&destination=${lat},${lng}`, '_blank')
      }
      return updateJobStatus(jobId, 'en_route')
    },
    [updateJobStatus],
  )

  const startJob = useCallback(
    (jobId: number) => {
      return updateJobStatus(jobId, 'in_progress')
    },
    [updateJobStatus],
  )

  const completeJob = useCallback(
    (jobId: number) => {
      return updateJobStatus(jobId, 'completed')
    },
    [updateJobStatus],
  )

  const reassignJob = useCallback(
    async (jobId: number, technicianId: number) => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/reassign`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ technician_id: technicianId }),
        })

        if (!response.ok) {
          throw new Error('Failed to reassign job')
        }

        setJobs((prev) => prev.filter((job) => job.id !== jobId))

        // Update grouped jobs
        setGroupedJobs((prev) => {
          const newGrouped = { ...prev }
          Object.keys(newGrouped).forEach((dateKey) => {
            newGrouped[dateKey] = newGrouped[dateKey].filter(
              (job) => job.id !== jobId,
            )

            // If no jobs left for this date, remove the date key
            if (newGrouped[dateKey].length === 0) {
              delete newGrouped[dateKey]
            }
          })
          return newGrouped
        })

        return true
      } catch (error) {
        console.error('Error reassigning job:', error)
        return false
      }
    },
    [],
  )

  return {
    jobs,
    groupedJobs,
    isLoading,
    goToJob,
    startJob,
    completeJob,
    reassignJob,
  }
}

export function useExpandableList() {
  const [expandedItems, setExpandedItems] = useState<number[]>([])

  const toggleItem = useCallback((itemId: number) => {
    setExpandedItems((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId)
      } else {
        return [...prev, itemId]
      }
    })
  }, [])

  const isItemExpanded = useCallback(
    (itemId: number) => {
      return expandedItems.includes(itemId)
    },
    [expandedItems],
  )

  return { expandedItems, toggleItem, isItemExpanded }
}

export function useExpandableDates(initialDates: string[] = ['today']) {
  const [expandedDates, setExpandedDates] = useState<string[]>(initialDates)

  const toggleDate = useCallback((dateKey: string) => {
    setExpandedDates((prev) => {
      if (prev.includes(dateKey)) {
        return prev.filter((key) => key !== dateKey)
      } else {
        return [...prev, dateKey]
      }
    })
  }, [])

  const isDateExpanded = useCallback(
    (dateKey: string) => {
      return expandedDates.includes(dateKey)
    },
    [expandedDates],
  )

  return { expandedDates, toggleDate, isDateExpanded }
}

export function useMapActions() {
  const openLocationInMaps = useCallback((lat?: number, lng?: number) => {
    if (lat && lng) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        '_blank',
      )
    }
  }, [])

  const openRouteInMaps = useCallback((jobs: BaseJob[]) => {
    if (jobs && jobs.length > 0) {
      const waypoints = jobs
        .map((job) => {
          if (job.address.lat && job.address.lng) {
            return `${job.address.lat},${job.address.lng}`
          }
          return null
        })
        .filter(Boolean)

      if (waypoints.length > 0) {
        if (waypoints.length > 1) {
          const origin = waypoints.shift()
          const destination = waypoints.pop()
          const waypointsParam =
            waypoints.length > 0 ? `&waypoints=${waypoints.join('|')}` : ''

          window.open(
            `${GOOGLE_MAPS_URL}&origin=${origin}&destination=${destination}${waypointsParam}`,
            '_blank',
          )
        } else {
          window.open(
            `${GOOGLE_MAPS_URL}&destination=${waypoints[0]}`,
            '_blank',
          )
        }
      }
    }
  }, [])

  return { openLocationInMaps, openRouteInMaps }
}
