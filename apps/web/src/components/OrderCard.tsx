import { Card } from '@/components/ui/Card'
import { OrderCardProps } from '@/types'
import { InfoIcon } from './icons/InfoIcon'
import { LocationIcon } from './icons/LocationIcon'
import { Wrench } from 'lucide-react'
import { DATE_FORMATS, formatUTC } from '@/utils/date'

const statusColors = {
  completed: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  queued: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
}

export function OrderCard({
  order: {
    id,
    repair_order_number,
    earliest_available_time,
    invoice,
    notes,
    vehicle,
    address,
    jobs,
    uploads,
  },
}: OrderCardProps) {
  return (
    <Card>
      <div className="border-l-4 border-blue-500 overflow-hidden">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-800 flex items-center">
                <span className="bg-blue-100 text-blue-800 text-sm font-medium mr-2 px-2.5 py-0.5 rounded">
                  #{id}
                </span>
                Order Details
              </h3>
              {repair_order_number && (
                <p className="mb-2">
                  <span className="font-medium text-gray-700">
                    Repair Order:
                  </span>{' '}
                  <span className="text-gray-800">{repair_order_number}</span>
                </p>
              )}
              {earliest_available_time && (
                <p className="mb-2">
                  <span className="font-medium text-gray-700">Time:</span>{' '}
                  <span className="text-gray-800">
                    {formatUTC(
                      earliest_available_time,
                      DATE_FORMATS.DISPLAY_DATE_TIME,
                    )}
                  </span>
                </p>
              )}
              {invoice && (
                <p className="mb-2">
                  <span className="font-medium text-gray-700">Invoice:</span>{' '}
                  <span className="text-green-600 font-semibold">
                    ${invoice}
                  </span>
                </p>
              )}
              {notes && (
                <div className="mt-3 bg-amber-50 p-3 rounded-md border border-amber-100">
                  <span className="font-medium text-amber-800 block mb-1">
                    Notes:
                  </span>
                  <p className="text-gray-700 text-sm">{notes}</p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="font-medium mb-2 text-gray-700 flex items-center gap-2">
                <InfoIcon />
                Vehicle Information
              </h4>
              {vehicle?.ymm && (
                <p className="text-gray-800 font-medium">{vehicle.ymm}</p>
              )}
              {vehicle?.vin && (
                <p className="mt-1">
                  <span className="font-medium">VIN:</span> {vehicle.vin}
                </p>
              )}

              <h4 className="font-medium mt-4 mb-2 text-gray-700 flex items-center gap-2">
                <LocationIcon />
                Service Address
              </h4>
              <p className="text-gray-800">{address.street_address}</p>
            </div>
          </div>

          {/* Jobs */}
          {jobs.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-4">
              <h4 className="font-medium mb-3 text-gray-700 flex items-center gap-2">
                <Wrench />
                Jobs
              </h4>
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-white rounded-md border border-gray-200 p-3"
                  >
                    <div className="flex justify-between items-start">
                      <p className="font-medium text-gray-800">
                        {job.service?.service_name}
                      </p>
                      <span
                        className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                          statusColors[job.status as keyof typeof statusColors]
                        }`}
                      >
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-sm">
                      {job.estimated_sched && (
                        <p className="text-gray-600">
                          <span className="font-medium">Scheduled:</span>{' '}
                          {formatUTC(
                            job.estimated_sched,
                            DATE_FORMATS.DISPLAY_DATE_TIME,
                          )}
                        </p>
                      )}
                      {job.job_duration && (
                        <p className="text-gray-600">
                          <span className="font-medium">Duration:</span>{' '}
                          {job.job_duration} minutes
                        </p>
                      )}
                    </div>
                    {job.notes && (
                      <p className="text-gray-600 text-sm mt-2 bg-gray-50 p-2 rounded">
                        <span className="font-medium">Notes:</span> {job.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uploads/Attachments */}
          {uploads.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <h4 className="font-medium mb-3 text-gray-700 flex items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
                Attachments
              </h4>
              <div className="flex flex-wrap gap-2">
                {uploads.map((upload) => (
                  <a
                    key={upload.id}
                    href={upload.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center bg-gray-100 hover:bg-gray-200 transition-colors text-gray-700 text-sm px-3 py-1.5 rounded-md"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1.5 text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    {upload.file_name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
