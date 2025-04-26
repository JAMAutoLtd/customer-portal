'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { Loader } from '@/components/ui/Loader'
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Play,
  CheckCircle,
  Clock,
} from 'lucide-react'

interface TechnicianJob {
  id: number
  order_id: number
  customer_name: string
  address: {
    street_address: string
    lat?: number
    lng?: number
  }
  vehicle: {
    year: number
    make: string
    model: string
  }
  service_name: string
  status:
    | 'queued'
    | 'en_route'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'fixed_time'
  estimated_sched: string
  requested_time: string
}

interface GroupedJobs {
  [date: string]: TechnicianJob[]
}

export function QueuedJobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<TechnicianJob[]>([])
  const [groupedJobs, setGroupedJobs] = useState<GroupedJobs>({})
  const [isLoading, setIsLoading] = useState(true)
  const [expandedJobs, setExpandedJobs] = useState<number[]>([])
  const [expandedDates, setExpandedDates] = useState<string[]>(['today'])
  const [technicians, setTechnicians] = useState<
    { id: number; name: string }[]
  >([])

  // Fetch jobs for the current technician
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        // This would be replaced with an actual API call to fetch jobs for the technician
        const response = await fetch('/api/technician/jobs')
        if (!response.ok) {
          throw new Error('Failed to fetch jobs')
        }

        const data = await response.json()
        setJobs(data)

        // Group jobs by date
        const grouped = groupJobsByDate(data)
        setGroupedJobs(grouped)
      } catch (error) {
        console.error('Error fetching jobs:', error)
      } finally {
        setIsLoading(false)
      }
    }

    const fetchTechnicians = async () => {
      try {
        // This would be replaced with an actual API call to fetch technicians
        const response = await fetch('/api/technicians')
        if (!response.ok) {
          throw new Error('Failed to fetch technicians')
        }

        const data = await response.json()
        setTechnicians(data)
      } catch (error) {
        console.error('Error fetching technicians:', error)
      }
    }

    if (user) {
      fetchJobs()
      fetchTechnicians()
    }
  }, [user])

  // Group jobs by date
  const groupJobsByDate = (jobs: TechnicianJob[]): GroupedJobs => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const grouped: GroupedJobs = {}

    jobs.forEach((job) => {
      const jobDate = new Date(job.estimated_sched)
      jobDate.setHours(0, 0, 0, 0)

      let dateKey
      if (jobDate.getTime() === today.getTime()) {
        dateKey = 'today'
      } else {
        dateKey = format(jobDate, 'yyyy-MM-dd')
      }

      if (!grouped[dateKey]) {
        grouped[dateKey] = []
      }

      grouped[dateKey].push(job)
    })

    // Sort jobs by estimated_sched within each date group
    Object.keys(grouped).forEach((dateKey) => {
      grouped[dateKey].sort(
        (a, b) =>
          new Date(a.estimated_sched).getTime() -
          new Date(b.estimated_sched).getTime(),
      )
    })

    return grouped
  }

  const handleJobClick = (jobId: number) => {
    setExpandedJobs((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId)
      } else {
        return [...prev, jobId]
      }
    })
  }

  const handleDateToggle = (dateKey: string) => {
    setExpandedDates((prev) => {
      if (prev.includes(dateKey)) {
        return prev.filter((key) => key !== dateKey)
      } else {
        return [...prev, dateKey]
      }
    })
  }

  const handleGoToJob = async (jobId: number, lat?: number, lng?: number) => {
    try {
      if (lat && lng) {
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
          '_blank',
        )
      }

      // Update job status to en_route
      const response = await fetch(`/api/jobs/${jobId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'en_route' }),
      })

      if (!response.ok) {
        throw new Error('Failed to update job status')
      }

      // Update job in the local state
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: 'en_route' } : job,
        ),
      )

      // Update grouped jobs
      setGroupedJobs((prev) => {
        const newGrouped = { ...prev }
        Object.keys(newGrouped).forEach((dateKey) => {
          newGrouped[dateKey] = newGrouped[dateKey].map((job) =>
            job.id === jobId ? { ...job, status: 'en_route' } : job,
          )
        })
        return newGrouped
      })
    } catch (error) {
      console.error('Error updating job status:', error)
    }
  }

  const handleStartJob = async (jobId: number) => {
    try {
      // Update job status to in_progress
      const response = await fetch(`/api/jobs/${jobId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'in_progress' }),
      })

      if (!response.ok) {
        throw new Error('Failed to update job status')
      }

      // Update job in the local state
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: 'in_progress' } : job,
        ),
      )

      // Update grouped jobs
      setGroupedJobs((prev) => {
        const newGrouped = { ...prev }
        Object.keys(newGrouped).forEach((dateKey) => {
          newGrouped[dateKey] = newGrouped[dateKey].map((job) =>
            job.id === jobId ? { ...job, status: 'in_progress' } : job,
          )
        })
        return newGrouped
      })
    } catch (error) {
      console.error('Error updating job status:', error)
    }
  }

  const handleCompleteJob = async (jobId: number) => {
    try {
      // Update job status to completed
      const response = await fetch(`/api/jobs/${jobId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed' }),
      })

      if (!response.ok) {
        throw new Error('Failed to update job status')
      }

      // Update job in the local state
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: 'completed' } : job,
        ),
      )

      // Update grouped jobs
      setGroupedJobs((prev) => {
        const newGrouped = { ...prev }
        Object.keys(newGrouped).forEach((dateKey) => {
          newGrouped[dateKey] = newGrouped[dateKey].map((job) =>
            job.id === jobId ? { ...job, status: 'completed' } : job,
          )
        })
        return newGrouped
      })
    } catch (error) {
      console.error('Error updating job status:', error)
    }
  }

  const handleReassignJob = async (jobId: number, technicianId: number) => {
    try {
      // Update job assigned technician
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

      // If the job is reassigned to a different technician, remove it from the current view
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
    } catch (error) {
      console.error('Error reassigning job:', error)
    }
  }

  const handleViewDayRoute = (dateKey: string) => {
    const jobs = groupedJobs[dateKey]

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
        // If there's more than one location, create a route with waypoints
        if (waypoints.length > 1) {
          const origin = waypoints.shift()
          const destination = waypoints.pop()
          const waypointsParam =
            waypoints.length > 0 ? `&waypoints=${waypoints.join('|')}` : ''

          window.open(
            `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}`,
            '_blank',
          )
        } else {
          // If there's only one location, just navigate to it
          window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${waypoints[0]}`,
            '_blank',
          )
        }
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader />
      </div>
    )
  }

  if (Object.keys(groupedJobs).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-md p-8 shadow-sm">
        <p className="text-lg font-medium text-gray-700">
          No jobs currently queued for you.
        </p>
        <p className="text-gray-500 mt-2">
          Check back later for new assignments.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.keys(groupedJobs).map((dateKey) => {
        const isExpanded = expandedDates.includes(dateKey)
        const formattedDate =
          dateKey === 'today'
            ? 'Today'
            : format(new Date(dateKey), 'EEEE, MMMM d, yyyy')

        return (
          <div
            key={dateKey}
            className="bg-white rounded-md shadow-sm overflow-hidden"
          >
            <div
              className="flex justify-between items-center p-4 cursor-pointer bg-gray-50"
              onClick={() => handleDateToggle(dateKey)}
            >
              <h3 className="text-lg font-semibold">{formattedDate}</h3>
              <div className="flex items-center">
                <Button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewDayRoute(dateKey)
                  }}
                  className="mr-4 text-sm"
                >
                  <MapPin className="w-4 h-4 mr-1" /> Overview
                </Button>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {groupedJobs[dateKey].map((job) => {
                  const isJobExpanded = expandedJobs.includes(job.id)
                  const ymm = `${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}`
                  const eta = format(new Date(job.estimated_sched), 'h:mm a')

                  return (
                    <div key={job.id} className="p-4">
                      <div
                        className="flex flex-wrap justify-between items-center cursor-pointer"
                        onClick={() => handleJobClick(job.id)}
                      >
                        <div className="w-full sm:w-auto mb-2 sm:mb-0">
                          <h4 className="font-semibold">{job.customer_name}</h4>
                          <p className="text-sm text-gray-500">
                            Order #{job.order_id}
                          </p>
                        </div>

                        <div className="w-full sm:w-auto mb-2 sm:mb-0 sm:ml-4">
                          <p className="text-sm">{ymm}</p>
                        </div>

                        <div className="w-full sm:w-auto mb-2 sm:mb-0 sm:ml-4">
                          <p className="text-sm">{job.service_name}</p>
                        </div>

                        <div className="w-full sm:w-auto mb-2 sm:mb-0 sm:ml-4 flex items-center">
                          <Clock className="w-4 h-4 mr-1 text-gray-500" />
                          <p className="text-sm">{eta}</p>
                        </div>

                        <div className="w-full sm:w-auto flex items-center">
                          <div className="flex-grow sm:flex-grow-0 mr-2">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleGoToJob(
                                  job.id,
                                  job.address.lat,
                                  job.address.lng,
                                )
                              }}
                              className="w-full"
                              disabled={job.status === 'completed'}
                            >
                              Go
                            </Button>
                          </div>

                          <span
                            className={`text-sm px-2 py-1 rounded-full ${
                              job.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : job.status === 'in_progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : job.status === 'en_route'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {job.status.replace('_', ' ')}
                          </span>

                          {isJobExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-500 ml-2" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-500 ml-2" />
                          )}
                        </div>
                      </div>

                      {isJobExpanded && (
                        <div className="mt-4 pl-4 border-l-2 border-gray-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-gray-500">
                                Requested Time:
                              </p>
                              <p className="text-sm">
                                {format(new Date(job.requested_time), 'PPpp')}
                              </p>
                            </div>

                            <div>
                              <p className="text-sm text-gray-500">Address:</p>
                              <p className="text-sm">
                                {job.address.street_address}
                              </p>
                            </div>

                            <div>
                              <p className="text-sm text-gray-500">
                                Assign Technician:
                              </p>
                              <select
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                onChange={(e) =>
                                  handleReassignJob(
                                    job.id,
                                    parseInt(e.target.value),
                                  )
                                }
                                value=""
                              >
                                <option value="" disabled>
                                  Select Technician
                                </option>
                                {technicians.map((tech) => (
                                  <option key={tech.id} value={tech.id}>
                                    {tech.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {job.status !== 'in_progress' &&
                              job.status !== 'completed' && (
                                <Button
                                  onClick={() => handleStartJob(job.id)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  <Play className="w-4 h-4 mr-1" /> Start Job
                                </Button>
                              )}

                            {job.status === 'in_progress' && (
                              <Button
                                onClick={() => handleCompleteJob(job.id)}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />{' '}
                                Complete
                              </Button>
                            )}

                            <Button className="bg-yellow-600 hover:bg-yellow-700">
                              Delay
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
