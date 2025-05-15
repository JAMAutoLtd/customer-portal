'use client'

import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import AvailabilityCalendar from '@/components/availability/AvailabilityCalendar'
import {
  DefaultHoursForm,
  ExceptionForm,
} from '@/components/availability/AvailabilityForm'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  AvailabilityResponse,
  DefaultHours,
  AvailabilityException,
  DayOfWeek,
} from '@/types/availability'
import { Loader } from '@/components/ui/Loader'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

export default function AvailabilityPage() {
  const [availabilities, setAvailabilities] = useState<AvailabilityResponse[]>(
    [],
  )
  const [defaultHours, setDefaultHours] = useState<DefaultHours[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentMonth] = useState(new Date())
  const [isDefaultHoursModalOpen, setIsDefaultHoursModalOpen] = useState(false)
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<DayOfWeek>(
    new Date().getDay() as DayOfWeek,
  )
  const [defaultHoursFormKey, setDefaultHoursFormKey] = useState(0)
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login')
        return
      }

      if (userProfile && !userProfile.is_admin) {
        router.push('/orders')
        return
      }
    }
  }, [user, userProfile, authLoading, router])

  const fetchAvailabilities = async (startDate: string, endDate: string) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        `/api/technicians/availability?start_date=${startDate}&end_date=${endDate}`,
      )

      if (!response.ok) {
        const errorData = await response.json()
        console.error('API error response:', errorData)
        throw new Error(errorData.error || 'Failed to fetch availabilities')
      }

      const data = await response.json()
      setAvailabilities(data.availabilities || [])
      setDefaultHours(data.default_hours || [])
    } catch (err) {
      console.error('Error fetching availabilities:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user && userProfile?.is_admin) {
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
      fetchAvailabilities(startDate, endDate)
    }
  }, [currentMonth, user, userProfile])

  const handleDateClick = (date: string) => {
    setSelectedDate(date)
  }

  const getExistingAvailability = () => {
    if (!selectedDate) return undefined

    return availabilities.find((a) => a.date === selectedDate)
  }

  const handleMonthChange = (startDate: string, endDate: string) => {
    fetchAvailabilities(startDate, endDate)
  }

  const handleExceptionSubmit = async (data: AvailabilityException) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/technicians/availability/exceptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('API error response:', errorData)
        throw new Error(
          errorData.error || 'Failed to save availability exception',
        )
      }

      // Refresh availabilities for the current month
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
      await fetchAvailabilities(startDate, endDate)

      // Reset form
      setSelectedDate(null)
    } catch (err) {
      console.error('Error saving availability exception:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDefaultHoursSubmit = async (data: DefaultHours) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/technicians/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('API error response:', errorData)
        throw new Error(errorData.error || 'Failed to save default hours')
      }

      // Refresh availabilities for the current month
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
      await fetchAvailabilities(startDate, endDate)

      // Close the modal
      setIsDefaultHoursModalOpen(false)
    } catch (err) {
      console.error('Error saving default hours:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Get default hours for a specific day of week
  const getDefaultHoursForDay = (
    dayOfWeek: number,
  ): DefaultHours | undefined => {
    const defaultHour = defaultHours.find(
      (hour) => hour.day_of_week === dayOfWeek,
    )

    // If no default hours found, return undefined to indicate no availability
    if (!defaultHour) {
      return undefined
    }

    return defaultHour
  }

  // Handle day of week change in default hours modal
  const handleDayOfWeekChange = (dayOfWeek: DayOfWeek) => {
    setSelectedDayOfWeek(dayOfWeek)

    // Force a re-render of the DefaultHoursForm by setting a key on the component
    // This will ensure the form is completely reset when the day changes
    setDefaultHoursFormKey(Date.now())
  }

  if (authLoading || (loading && availabilities.length === 0)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader />
      </div>
    )
  }

  if (!userProfile?.is_admin) {
    return null
  }

  if (error && availabilities.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[768px]">
      <h1 className="text-2xl font-bold mb-6">Manage Availability</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Calendar</h2>
          <AvailabilityCalendar
            availabilities={availabilities}
            onDateClick={handleDateClick}
            onMonthChange={handleMonthChange}
            selectedDate={selectedDate || undefined}
          />
        </div>

        <div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Adjust Schedule</h2>

              <Button
                onClick={() => setIsDefaultHoursModalOpen(true)}
                variant="secondary"
              >
                Set Default Hours
              </Button>
            </div>

            {selectedDate ? (
              <ExceptionForm
                onSubmit={handleExceptionSubmit}
                initialData={{
                  date: selectedDate,
                  is_available: true,
                  start_time: '09:00',
                  end_time: '17:00',
                }}
                existingAvailability={getExistingAvailability()}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                Select a date from the calendar to adjust its schedule
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={isDefaultHoursModalOpen}
        onClose={() => setIsDefaultHoursModalOpen(false)}
        title="Set Default Hours"
      >
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Day of Week
          </label>
          <select
            value={selectedDayOfWeek}
            onChange={(e) =>
              handleDayOfWeekChange(parseInt(e.target.value) as DayOfWeek)
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value={0}>Sunday</option>
            <option value={1}>Monday</option>
            <option value={2}>Tuesday</option>
            <option value={3}>Wednesday</option>
            <option value={4}>Thursday</option>
            <option value={5}>Friday</option>
            <option value={6}>Saturday</option>
          </select>
        </div>
        <DefaultHoursForm
          onSubmit={handleDefaultHoursSubmit}
          initialData={{
            ...(getDefaultHoursForDay(selectedDayOfWeek) || {
              is_available: false,
            }),
            day_of_week: selectedDayOfWeek,
          }}
          key={defaultHoursFormKey}
        />
      </Modal>
    </div>
  )
}
