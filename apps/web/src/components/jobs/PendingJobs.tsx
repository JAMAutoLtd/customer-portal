'use client'

import React, { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { Clipboard, Clock, Send } from 'lucide-react'
import { PendingJob } from './types'
import { JobCard } from './JobCard'
import { StatusBadge } from './StatusBadge'
import { LoadingState, EmptyState } from './JobsStates'
import { usePendingJobs, useTechnicians, openLocationInMaps } from './hooks'

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/dir/?api=1'

export function PendingJobs() {
  const { jobs, isLoading, assignJob } = usePendingJobs()
  const { technicians, isLoading: technicianLoading } = useTechnicians()
  const [expandedJobs, setExpandedJobs] = useState<number[]>([])

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
      icon: <Clock className="w-4 h-4 mr-1 text-gray-500" />,
      text: format(new Date(job.requested_time), 'MMM d, h:mm a'),
      title: 'Requested Time',
    }
  }

  const renderExpandedContent = (job: PendingJob) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-500">Requested Time:</p>
          <p className="text-sm">
            {format(new Date(job.requested_time), 'PPpp')}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-500">Address:</p>
          <p className="text-sm">{job.address.street_address}</p>
        </div>

        <div />

        <div>
          <p className="text-sm text-gray-500">Assign To:</p>
          <select
            defaultValue=""
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()
              const techId = parseInt(e.target.value)
              if (!isNaN(techId)) {
                handleAssignJob(job.id, techId)
              }
            }}
          >
            <option value="">Select Technician</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    )
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
          renderExpandedContent={renderExpandedContent}
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
