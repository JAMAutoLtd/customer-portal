'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import {
  ChevronDown,
  ChevronUp,
  Zap,
  Check,
  Send,
  Clock,
  Route,
} from 'lucide-react'
import { TechnicianJob, GroupedJobs, Technician } from './types'
import { groupJobsByDate } from './utils'
import { JobCard } from './JobCard'
import { StatusBadge } from './StatusBadge'
import { LoadingState, EmptyState } from './JobsStates'
import { ExpandedJobContent } from './JobExpandedContent'
import { DATE_FORMATS, formatUTC } from '@/utils/date'

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/dir/?api=1'

export function QueuedJobs() {
  const { user } = useAuth()
  const [_, setJobs] = useState<TechnicianJob[]>([])
  const [groupedJobs, setGroupedJobs] = useState<GroupedJobs>({})
  const [isLoading, setIsLoading] = useState(true)
  const [expandedJobs, setExpandedJobs] = useState<number[]>([])
  const [expandedDates, setExpandedDates] = useState<string[]>(['today'])
  const [technicians, setTechnicians] = useState<Technician[]>([])

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/technician/jobs')
        const data = await response.json()
        setJobs(data)
        setGroupedJobs(groupJobsByDate(data))
      } catch (error) {
        console.error('Error fetching jobs:', error)
      } finally {
        setIsLoading(false)
      }
    }

    const fetchTechnicians = async () => {
      try {
        const response = await fetch('/api/technicians')
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
        window.open(`${GOOGLE_MAPS_URL}&destination=${lat},${lng}`, '_blank')
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
    } catch (error) {
      console.error('Error reassigning job:', error)
    }
  }

  const handleViewDayRoute = (dateKey: string) => {
    const jobs = groupedJobs[dateKey]

    if (jobs && jobs.length > 0) {
      const addresses = jobs
        .map((job) => {
          if (job.address.street_address) {
            return encodeURIComponent(job.address.street_address)
          }
          return null
        })
        .filter(Boolean)

      if (addresses.length > 0) {
        if (addresses.length > 1) {
          const origin = addresses.shift()
          const destination = addresses.pop()
          const waypointsParam =
            addresses.length > 0 ? `&waypoints=${addresses.join('|')}` : ''

          window.open(
            `${GOOGLE_MAPS_URL}&origin=${origin}&destination=${destination}${waypointsParam}`,
            '_blank',
          )
        } else {
          window.open(
            `${GOOGLE_MAPS_URL}&destination=${addresses[0]}`,
            '_blank',
          )
        }
      }
    }
  }

  const renderStatusBadge = (job: TechnicianJob) => {
    return <StatusBadge status={job.status} />
  }

  const renderTimeDisplay = (job: TechnicianJob) => {
    return {
      icon: <Clock className="w-4 h-4 mr-1 text-gray-500" />,
      text: format(new Date(job.estimated_sched), 'h:mm a'),
      title: 'ETA',
    }
  }

  const renderActions = (job: TechnicianJob) => {
    return (
      <>
        {job.status !== 'in_progress' && job.status !== 'completed' && (
          <Button
            onClick={() => handleStartJob(job.id)}
            className="bg-[#FFB30F] hover:bg-[#FFB30F]/80 flex items-center"
          >
            <Zap className="w-4 h-4 mr-1" />
            Start Job
          </Button>
        )}

        {job.status !== 'completed' && (
          <Button
            onClick={() => handleCompleteJob(job.id)}
            className="flex items-center"
          >
            <Check className="w-4 h-4 mr-1" />
            Complete
          </Button>
        )}
      </>
    )
  }

  const isMapButtonDisabled = (job: TechnicianJob) => {
    return job.status === 'completed'
  }

  if (isLoading) {
    return <LoadingState />
  }

  if (Object.keys(groupedJobs).length === 0) {
    return (
      <EmptyState
        title="No jobs currently queued for you."
        description="Check back later for new assignments."
      />
    )
  }

  return (
    <div className="space-y-6">
      {Object.keys(groupedJobs).map((dateKey) => {
        const isExpanded = expandedDates.includes(dateKey)
        const formattedDate =
          dateKey === 'today'
            ? 'Today'
            : formatUTC(new Date(dateKey), DATE_FORMATS.DISPLAY_DATE_FULL)

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
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewDayRoute(dateKey)
                  }}
                  className="mr-4 whitespace-nowrap flex items-center gap-1"
                >
                  <Route className="w-8 h-8 text-gray-500 hover:text-gray-700" />
                </button>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {groupedJobs[dateKey].map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    className="border-none"
                    isExpanded={expandedJobs.includes(job.id)}
                    onToggleExpand={handleJobClick}
                    renderStatusBadge={renderStatusBadge}
                    renderExpandedContent={(job) => (
                      <ExpandedJobContent
                        job={job}
                        technicians={technicians}
                        onAssignTechnician={handleReassignJob}
                        defaultTechnicianValue={job.assigned_technician}
                        allowEmptySelection={false}
                      />
                    )}
                    renderActions={renderActions}
                    timeDisplay={renderTimeDisplay}
                    onMapClick={(lat, lng) => handleGoToJob(job.id, lat, lng)}
                    mapButtonIcon={<Send className="w-4 h-4 mr-1" />}
                    mapButtonLabel="Go"
                    mapButtonDisabled={isMapButtonDisabled}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
