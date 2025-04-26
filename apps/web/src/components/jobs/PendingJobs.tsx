'use client'

import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Send } from 'lucide-react'
import { PendingJob, Technician } from './types'
import { JobCard } from './JobCard'
import { StatusBadge } from './StatusBadge'
import { LoadingState, EmptyState } from './JobsStates'
import { usePendingJobs } from './hooks'
import { ExpandedJobContent } from './JobExpandedContent'

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/dir/?api=1'

export function PendingJobs() {
  const { jobs, isLoading, assignJob } = usePendingJobs()
  const [expandedJobs, setExpandedJobs] = useState<number[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [technicianLoading, setTechnicianLoading] = useState(true)

  useEffect(() => {
    const fetchTechnicians = async () => {
      try {
        setTechnicianLoading(true)
        const response = await fetch('/api/technicians')
        if (!response.ok) {
          throw new Error('Failed to fetch technicians')
        }

        const data = await response.json()
        setTechnicians(data)
      } catch (error) {
        console.error('Error fetching technicians:', error)
      } finally {
        setTechnicianLoading(false)
      }
    }

    fetchTechnicians()
  }, [])

  const handleJobClick = (jobId: number) => {
    setExpandedJobs((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId)
      } else {
        return [...prev, jobId]
      }
    })
  }

  const handleAssignJob = async (jobId: number, technicianId: number) => {
    await assignJob(jobId, technicianId)
  }

  const handleGoToJob = (jobId: number, lat?: number, lng?: number) => {
    if (lat && lng) {
      window.open(`${GOOGLE_MAPS_URL}&destination=${lat},${lng}`, '_blank')
    }
  }

  if (isLoading || technicianLoading) {
    return <LoadingState />
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No jobs pending review."
        description="All current jobs have been assigned."
      />
    )
  }

  const renderStatusBadge = (job: PendingJob) => {
    return <StatusBadge status={job.status} />
  }

  const renderTimeDisplay = (job: PendingJob) => {
    return {
      icon: (
        <span className="text-sm font-medium text-gray-500 mr-1">Due:</span>
      ),
      text: format(new Date(job.requested_time), 'MMM d, h:mm a'),
    }
  }

  // We don't need additional actions outside of the expanded content
  const renderActions = () => null

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          isExpanded={expandedJobs.includes(job.id)}
          onToggleExpand={handleJobClick}
          renderStatusBadge={renderStatusBadge}
          renderExpandedContent={(job) => (
            <ExpandedJobContent
              job={job}
              technicians={technicians}
              onAssignTechnician={handleAssignJob}
            />
          )}
          renderActions={renderActions}
          timeDisplay={renderTimeDisplay}
          onMapClick={(lat, lng) => handleGoToJob(job.id, lat, lng)}
          mapButtonIcon={<Send className="w-4 h-4 mr-1" />}
          mapButtonLabel="Map"
        />
      ))}
    </div>
  )
}
