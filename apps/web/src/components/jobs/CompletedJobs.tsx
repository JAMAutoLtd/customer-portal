'use client'

import React, { useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'
import { TechnicianJob } from './types'
import { JobCard } from './JobCard'
import { StatusBadge } from './StatusBadge'
import { LoadingState, EmptyState } from './JobsStates'
import { useCompletedJobs, useTechnicians } from './hooks'
import { ExpandedJobContent } from './JobExpandedContent'
import { DATE_FORMATS, formatUTC } from '@/utils/date'

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/dir/?api=1'

export function CompletedJobs() {
  const { groupedJobs, isLoading } = useCompletedJobs()
  const { technicians, isLoading: technicianLoading } = useTechnicians()
  const [expandedJobs, setExpandedJobs] = useState<number[]>([])
  const [expandedDates, setExpandedDates] = useState<string[]>(['today'])

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

  const handleGoToJob = (_jobId: number, lat?: number, lng?: number) => {
    if (lat && lng) {
      window.open(`${GOOGLE_MAPS_URL}&destination=${lat},${lng}`, '_blank')
    }
  }

  // No-op function for completed jobs - technician can't be reassigned
  const handleAssignTechnician = () => {
    // Do nothing - completed jobs shouldn't allow reassignment
  }

  if (isLoading || technicianLoading) {
    return <LoadingState />
  }

  if (Object.keys(groupedJobs).length === 0) {
    return (
      <EmptyState
        title="No completed jobs yet."
        description="Completed and cancelled jobs will appear here."
      />
    )
  }

  const renderStatusBadge = (job: TechnicianJob) => {
    return <StatusBadge status={job.status} />
  }

  const renderTimeDisplay = (job: TechnicianJob) => {
    return {
      icon: (
        <span className="text-sm font-medium text-gray-500 mr-1">
          {job.status === 'completed' ? 'Completed:' : 'Cancelled:'}
        </span>
      ),
      text: format(new Date(job.estimated_sched), 'MMM d, h:mm a'),
    }
  }

  // No actions needed for completed jobs
  const renderActions = () => null

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
                        onAssignTechnician={handleAssignTechnician}
                        defaultTechnicianValue={job.assigned_technician}
                        allowEmptySelection={false}
                        disableTechnicianSelector={true}
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
            )}
          </div>
        )
      })}
    </div>
  )
}
