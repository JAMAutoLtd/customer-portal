'use client'

import React from 'react'
import { BaseJob, Technician } from './types'
import { DATE_FORMATS, formatUTC } from '@/utils/date'

interface TechnicianSelectorProps {
  jobId: number
  defaultValue?: number | string
  technicians: Technician[]
  onChange: (jobId: number, technicianId: number) => void
  allowEmptySelection?: boolean
}

export function TechnicianSelector({
  jobId,
  defaultValue = '',
  technicians,
  onChange,
  allowEmptySelection = false,
}: TechnicianSelectorProps) {
  return (
    <select
      defaultValue={defaultValue}
      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation()
        const techId = parseInt(e.target.value)
        if (!isNaN(techId)) {
          onChange(jobId, techId)
        }
      }}
    >
      <option value="" disabled={!allowEmptySelection}>
        Select Technician
      </option>
      {technicians.map((tech) => (
        <option key={tech.id} value={tech.id}>
          {tech.name}
        </option>
      ))}
    </select>
  )
}

interface JobInfoGridProps {
  job: BaseJob
  children?: React.ReactNode
}

export function JobInfoGrid({ job, children }: JobInfoGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <p className="text-sm text-gray-500">Address:</p>
        <p className="text-sm">{job.address.street_address}</p>
      </div>

      <div>
        <p className="text-sm text-gray-500">Requested Time:</p>
        <p className="text-sm">
          {formatUTC(job.requested_time, DATE_FORMATS.DISPLAY_DATE_TIME)}
        </p>
      </div>

      {children}
    </div>
  )
}

interface ExpandedJobContentProps {
  job: BaseJob
  technicians: Technician[]
  onAssignTechnician: (jobId: number, technicianId: number) => void
  defaultTechnicianValue?: number | string
  allowEmptySelection?: boolean
  equipment_required?: string[]
}

export function ExpandedJobContent({
  job,
  technicians,
  onAssignTechnician,
  defaultTechnicianValue = '',
  allowEmptySelection = false,
  equipment_required,
}: ExpandedJobContentProps) {
  return (
    <JobInfoGrid job={job}>
      {equipment_required && equipment_required.length > 0 && (
        <div>
          <p className="text-sm text-gray-500">Equipment Required:</p>
          <ul className="text-sm list-disc pl-4">
            {equipment_required.map((equipment, index) => (
              <li key={index}>{equipment}</li>
            ))}
          </ul>
        </div>
      )}

      <div />

      <div>
        <p className="text-sm text-gray-500">Assign To:</p>
        <TechnicianSelector
          jobId={job.id}
          defaultValue={defaultTechnicianValue}
          technicians={technicians}
          onChange={onAssignTechnician}
          allowEmptySelection={allowEmptySelection}
        />
      </div>
    </JobInfoGrid>
  )
}
