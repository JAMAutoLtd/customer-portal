import { useState, useEffect } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  startOfWeek,
  endOfWeek,
  parseISO,
  isSameDay,
  isBefore,
  startOfDay,
} from 'date-fns'
import { AvailabilityResponse } from '@/types/availability'
import { AvailabilityCalendarProps } from './types'
import { ChevronDownIcon } from '../icons/ChevronDownIcon'

export default function AvailabilityCalendar({
  availabilities,
  onDateClick,
  onMonthChange,
  selectedDate,
}: AvailabilityCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isLoading, setIsLoading] = useState(false)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)

  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  })

  useEffect(() => {
    if (!onMonthChange) return

    const fetchAvailabilityForMonth = async () => {
      setIsLoading(true)
      try {
        const startDate = format(monthStart, 'yyyy-MM-dd')
        const endDate = format(monthEnd, 'yyyy-MM-dd')
        onMonthChange(startDate, endDate)
      } catch (error) {
        console.error('Error fetching availability:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAvailabilityForMonth()
  }, [currentDate])

  const getAvailabilityForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return availabilities.find((a) => a.date === dateStr)
  }

  const getAvailabilityColor = (
    availability: AvailabilityResponse | undefined,
  ) => {
    if (!availability) return 'bg-gray-100'
    if (!availability.is_available) return 'bg-red-100'
    if (availability.start_time && availability.end_time) return 'bg-green-100'
    return 'bg-yellow-100'
  }

  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={() => handleMonthChange('prev')}
            className="px-3 py-1 rounded "
            disabled={isLoading}
          >
            <ChevronDownIcon className="w-6 h-6 rotate-90" />
          </button>
          <button
            onClick={() => handleMonthChange('next')}
            className="px-3 py-1 rounded "
            disabled={isLoading}
          >
            <ChevronDownIcon className="w-6 h-6 -rotate-90" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-center text-sm font-medium py-2">
            {day}
          </div>
        ))}

        {days.map((day) => {
          const availability = getAvailabilityForDate(day)
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isCurrentDay = isToday(day)
          const isSelected =
            selectedDate && isSameDay(day, parseISO(selectedDate))
          const isPastDay = isBefore(day, startOfDay(new Date()))
          const start_time = availability?.start_time
            ? format(
                new Date(`2000-01-01T${availability?.start_time}`),
                'h:mm a',
              ).split(' ')
            : null
          const end_time = availability?.end_time
            ? format(
                new Date(`2000-01-01T${availability?.end_time}`),
                'h:mm a',
              ).split(' ')
            : null

          return (
            <button
              key={day.toString()}
              onClick={() => onDateClick(format(day, 'yyyy-MM-dd'))}
              className={`
                p-1 sm:p-2 text-sm rounded relative h-[75px]
                ${getAvailabilityColor(availability)}
                ${!isCurrentMonth ? 'opacity-50' : ''}
                ${isCurrentDay ? 'font-bold' : ''}
                ${isSelected ? 'ring-2 ring-indigo-600' : ''}
                ${
                  isPastDay
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:opacity-80'
                }
                ${isLoading ? 'opacity-70' : ''}
              `}
              disabled={isLoading || isPastDay}
            >
              <span>{format(day, 'd')}</span>
              {availability?.is_available && start_time && end_time && (
                <div className="text-xs mt-1">
                  <p className="whitespace-nowrap">
                    {start_time[0]}
                    <span className="text-[8px]">{start_time[1]}</span>
                  </p>
                  <p className="whitespace-nowrap">
                    {end_time[0]}
                    <span className="text-[8px]">{end_time[1]}</span>
                  </p>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
