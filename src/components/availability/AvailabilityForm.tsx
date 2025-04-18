import { useState, useEffect } from 'react'
import {
  DefaultHours,
  AvailabilityException,
  DayOfWeek,
} from '@/types/availability'
import { Button } from '../ui/Button'
import {
  AvailabilityFormProps,
  FormData,
  DefaultHoursFormProps,
  ExceptionFormProps,
} from './types'

// Component for default hours
export function DefaultHoursForm({
  onSubmit,
  initialData,
}: DefaultHoursFormProps) {
  const [formData, setFormData] = useState<FormData>({
    day_of_week: initialData?.day_of_week || (1 as DayOfWeek),
    start_time: initialData?.start_time || '09:00',
    end_time: initialData?.end_time || '17:00',
    is_available:
      initialData?.is_available !== undefined ? initialData.is_available : true,
    exception_type: 'custom_hours',
  })

  // Update form data when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        day_of_week: initialData.day_of_week || (1 as DayOfWeek),
        start_time: initialData.start_time || '09:00',
        end_time: initialData.end_time || '17:00',
        is_available:
          initialData.is_available !== undefined
            ? initialData.is_available
            : true,
        exception_type: 'custom_hours',
      })
    }
  }, [initialData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Ensure we have a valid day_of_week
    const dayOfWeek =
      initialData?.day_of_week !== undefined
        ? initialData.day_of_week
        : formData.day_of_week || (1 as DayOfWeek)

    const defaultHours: DefaultHours = {
      day_of_week: dayOfWeek,
      start_time: formData.start_time!,
      end_time: formData.end_time!,
      is_available: formData.is_available,
    }
    onSubmit(defaultHours)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : name === 'day_of_week'
          ? (parseInt(value) as DayOfWeek)
          : value,
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Available
        </label>
        <input
          type="checkbox"
          name="is_available"
          checked={formData.is_available}
          onChange={handleChange}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </div>

      {formData.is_available && (
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              Start Time
            </label>
            <input
              type="time"
              name="start_time"
              value={formData.start_time}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              End Time
            </label>
            <input
              type="time"
              name="end_time"
              value={formData.end_time}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
        </div>
      )}

      <Button type="submit">Apply Changes</Button>
    </form>
  )
}

// Component for exceptions
export function ExceptionForm({
  onSubmit,
  initialData,
  existingAvailability,
}: ExceptionFormProps) {
  const [formData, setFormData] = useState<FormData>({
    start_time: '09:00',
    end_time: '17:00',
    is_available: true,
    exception_type: 'custom_hours',
    reason: existingAvailability?.reason || '',
    ...initialData,
  })

  console.log('🌟 existingAvailability', existingAvailability)

  const [hasChanges, setHasChanges] = useState(false)

  // Update form data when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => {
        // Handle default hours data
        const newData = {
          ...prev,
          ...initialData,
        }

        return newData
      })

      // If we have existing availability data, use it for the time fields
      if (existingAvailability) {
        setFormData((prev) => ({
          ...prev,
          ...initialData,
          is_available: existingAvailability.is_available,
          start_time: existingAvailability.start_time || prev.start_time,
          end_time: existingAvailability.end_time || prev.end_time,
        }))
      }

      // Reset the hasChanges flag when initialData changes
      setHasChanges(false)
    }
  }, [initialData, existingAvailability])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Determine exception_type automatically based on user selections
    const exception_type = formData.is_available ? 'custom_hours' : 'time_off'

    const exception: AvailabilityException = {
      date: formData.date!,
      exception_type,
      is_available: formData.is_available,
      ...(formData.is_available && {
        start_time: formData.start_time,
        end_time: formData.end_time,
      }),
      reason: formData.reason,
    }
    onSubmit(exception)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : name === 'day_of_week'
          ? (parseInt(value) as DayOfWeek)
          : value,
    }))

    setHasChanges(true)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Date</label>
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Available
        </label>
        <input
          type="checkbox"
          name="is_available"
          checked={formData.is_available}
          onChange={handleChange}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </div>

      {formData.is_available && (
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              Start Time
            </label>
            <input
              type="time"
              name="start_time"
              value={formData.start_time}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              End Time
            </label>
            <input
              type="time"
              name="end_time"
              value={formData.end_time}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Notes (Optional)
        </label>
        <input
          type="text"
          name="reason"
          value={formData.reason}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <Button type="submit" disabled={!hasChanges}>
        Apply Changes
      </Button>
    </form>
  )
}
