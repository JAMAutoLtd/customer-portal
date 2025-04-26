'use client'

import React from 'react'
import { JobStatus } from './types'

interface StatusBadgeProps {
  status: JobStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyles = (status: JobStatus) => {
    switch (status) {
      case 'pending_review':
        return 'bg-amber-100 text-amber-800'
      case 'queued':
        return 'bg-gray-100 text-gray-800'
      case 'en_route':
        return 'bg-yellow-100 text-yellow-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      case 'fixed_time':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatStatus = (status: JobStatus) => {
    return status.replace('_', ' ')
  }

  return (
    <span
      className={`text-sm px-2 py-1 rounded-full whitespace-nowrap ${getStatusStyles(status)}`}
    >
      {formatStatus(status)}
    </span>
  )
}
