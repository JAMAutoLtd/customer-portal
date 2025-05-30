'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { ChevronDown, ChevronUp, Clock, MapPin } from 'lucide-react'
import { BaseJob, JobCardProps } from './types'
import { StatusBadge } from './StatusBadge'
import { DATE_FORMATS, formatUTC } from '@/utils/date'

export function JobCard<T extends BaseJob>({
  job,
  isExpanded,
  onToggleExpand,
  renderStatusBadge,
  renderActions,
  renderExpandedContent,
  renderHeaderActions,
  onMapClick,
  mapButtonLabel = 'Map',
  mapButtonIcon = <MapPin className="w-4 h-4 mr-1" />,
  mapButtonDisabled,
  className = '',
}: JobCardProps<T>) {
  const ymm = `${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}`

  const renderStatus =
    renderStatusBadge || ((job: T) => <StatusBadge status={job.status} />)

  const scheduledTime = {
    icon: <Clock className="w-4 h-4 mr-1 text-gray-500" />,
    text: formatUTC(job.estimated_sched as string, DATE_FORMATS.DISPLAY_TIME),
    title: 'ETA',
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (
      e.target === e.currentTarget ||
      e.currentTarget.contains(e.target as Node)
    ) {
      onToggleExpand(job.id)
    }
  }

  return (
    <div className={`bg-white rounded-md shadow-sm p-4 ${className}`}>
      <div className="cursor-pointer" onClick={handleCardClick}>
        <div>
          <div className="flex justify-between items-center flex-wrap gap-4 mb-2">
            <div className="flex gap-3 items-center">
              <p className="text-sm text-gray-500">Order #{job.order_id}</p>
              <h4 className="font-semibold">{job.customer_name}</h4>
            </div>

            <div className="flex gap-3 items-center max-sm:w-full">
              {renderStatus(job)}

              <div
                className="w-full sm:w-auto sm:mb-0 sm:ml-4 flex items-center"
                title={scheduledTime.title}
              >
                {scheduledTime.icon}
                <p className="text-sm">{scheduledTime.text}</p>
              </div>

              <div className="flex items-center">
                {onMapClick && (
                  <div className="mr-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        onMapClick(job.address.lat, job.address.lng)
                      }}
                      className="w-full flex items-center"
                      disabled={
                        !job.address.lat ||
                        !job.address.lng ||
                        mapButtonDisabled?.(job)
                      }
                    >
                      {mapButtonIcon} {mapButtonLabel}
                    </Button>
                  </div>
                )}

                {renderHeaderActions && renderHeaderActions(job)}

                <div onClick={(e) => e.stopPropagation()}>
                  {isExpanded ? (
                    <ChevronUp
                      className="w-5 h-5 text-gray-500 ml-2 cursor-pointer"
                      onClick={() => onToggleExpand(job.id)}
                    />
                  ) : (
                    <ChevronDown
                      className="w-5 h-5 text-gray-500 ml-2 cursor-pointer"
                      onClick={() => onToggleExpand(job.id)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm">{ymm}</p>
            <p className="text-sm">{job.service_name}</p>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            {renderExpandedContent(job)}

            {renderActions && renderActions(job) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {renderActions(job)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
