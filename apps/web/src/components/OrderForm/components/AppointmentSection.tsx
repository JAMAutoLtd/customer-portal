import React, { useMemo } from 'react'
import { DateInput } from '@/components/inputs/DateInput'
import { getNextAvailableDate, isDateDisabled, formatTime } from '../helpers'

interface AppointmentSectionProps {
  selectedTime: string
  onDateSelect: (date: Date | undefined) => void
  onTimeChange: (time: string) => void
}

export const AppointmentSection: React.FC<AppointmentSectionProps> = React.memo(
  ({ selectedTime, onDateSelect, onTimeChange }) => {
    const defaultDate = useMemo(() => getNextAvailableDate(), [])

    const handleTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onTimeChange(e.target.value)
    }

    const timeOptions = useMemo(
      () => Array.from({ length: 9 }, (_, i) => i + 9),
      [],
    )

    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Appointment Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="earliestDate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Earliest Available Date
            </label>
            <DateInput
              defaultDate={defaultDate}
              isDateDisabled={isDateDisabled}
              onDateSelect={onDateSelect}
            />
          </div>

          <div className="flex flex-col justify-start">
            <label
              htmlFor="selectedTime"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Preferred Time
            </label>
            <select
              id="selectedTime"
              name="selectedTime"
              value={selectedTime}
              onChange={handleTimeChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Time</option>
              {timeOptions.map((hour) => (
                <option key={hour} value={`${hour}:00`}>
                  {formatTime(hour)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    )
  },
)
