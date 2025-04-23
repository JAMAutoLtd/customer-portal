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
  Clipboard,
} from 'lucide-react'

interface PendingJob {
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
  status: 'pending_review'
  requested_time: string
  equipment_required: string[]
  assigned_technician: number | null
}

export function PendingJobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<PendingJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedJobs, setExpandedJobs] = useState<number[]>([])
  const [technicians, setTechnicians] = useState<
    { id: number; name: string }[]
  >([])

  // Fetch pending jobs
  useEffect(() => {
    const fetchPendingJobs = async () => {
      try {
        // This would be replaced with an actual API call to fetch pending jobs
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
      fetchPendingJobs()
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

  const handleAssignJob = async (jobId: number, technicianId: number) => {
    try {
      // Update job assigned technician and change status
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
    } catch (error) {
      console.error('Error assigning job:', error)
    }
  }

  const handleGoToLocation = (lat?: number, lng?: number) => {
    if (lat && lng) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        '_blank'
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader />
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-md p-8 shadow-sm">
        <p className="text-lg font-medium text-gray-700">
          No jobs pending review.
        </p>
        <p className="text-gray-500 mt-2">
          All current jobs have been assigned.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => {
        const isJobExpanded = expandedJobs.includes(job.id)
        const ymm = `${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}`

        return (
          <div key={job.id} className="bg-white rounded-md shadow-sm p-4">
            <div
              className="flex flex-wrap justify-between items-center cursor-pointer"
              onClick={() => handleJobClick(job.id)}
            >
              <div className="w-full sm:w-auto mb-2 sm:mb-0">
                <h4 className="font-semibold">{job.customer_name}</h4>
                <p className="text-sm text-gray-500">Order #{job.order_id}</p>
              </div>

              <div className="w-full sm:w-auto mb-2 sm:mb-0 sm:ml-4">
                <p className="text-sm">{ymm}</p>
              </div>

              <div className="w-full sm:w-auto mb-2 sm:mb-0 sm:ml-4">
                <p className="text-sm">{job.service_name}</p>
              </div>

              <div className="w-full sm:w-auto mb-2 sm:mb-0 sm:ml-4 flex items-center">
                <Clock className="w-4 h-4 mr-1 text-gray-500" />
                <p className="text-sm">
                  {format(new Date(job.requested_time), 'MMM d, h:mm a')}
                </p>
              </div>

              <div className="w-full sm:w-auto flex items-center">
                <div className="flex-grow sm:flex-grow-0 mr-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleGoToLocation(job.address.lat, job.address.lng)
                    }}
                    className="w-full"
                  >
                    <MapPin className="w-4 h-4 mr-1" /> Map
                  </Button>
                </div>

                <span className="text-sm px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                  pending review
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
                    <p className="text-sm text-gray-500">Requested Time:</p>
                    <p className="text-sm">
                      {format(new Date(job.requested_time), 'PPpp')}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Equipment Required:</p>
                    <ul className="text-sm list-disc pl-4">
                      {job.equipment_required.map((equipment, index) => (
                        <li key={index}>{equipment}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Address:</p>
                    <p className="text-sm">{job.address.street_address}</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Assign To:</p>
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                        defaultValue=""
                        id={`tech-select-${job.id}`}
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
                      <Button
                        onClick={() => {
                          const select = document.getElementById(
                            `tech-select-${job.id}`
                          ) as HTMLSelectElement
                          const techId = parseInt(select.value)
                          if (!isNaN(techId)) {
                            handleAssignJob(job.id, techId)
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                      >
                        <Clipboard className="w-4 h-4 mr-1" /> Assign
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
