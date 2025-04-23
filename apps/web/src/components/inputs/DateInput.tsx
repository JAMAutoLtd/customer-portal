'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Input } from '../ui/Input'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import 'react-day-picker/dist/style.css'

export const DateInput = ({
  defaultDate,
  isDateDisabled,
  onDateSelect,
}: {
  defaultDate: Date | undefined
  isDateDisabled: (date: Date) => boolean
  onDateSelect?: (date: Date) => void
}) => {
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    defaultDate || new Date()
  )
  const calendarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setShowCalendar(false)
      }
    }

    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCalendar])

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date)
      setShowCalendar(false)
      onDateSelect?.(date)
    }
  }

  const handleInputClick = () => {
    setShowCalendar(true)
  }

  return (
    <div className="relative">
      <Input
        type="text"
        readOnly
        id="earliestDate"
        value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
        onClick={handleInputClick}
        placeholder="Click to select a date"
        required
      />

      {showCalendar && (
        <div
          ref={calendarRef}
          className="absolute z-10 mt-1 border border-gray-300 rounded-md p-2 bg-white shadow-lg"
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={isDateDisabled}
            startMonth={new Date()}
            captionLayout="dropdown"
            classNames={{
              day: 'hover:bg-[#4654a3]/50 rounded-md',
              selected: 'bg-[#4654a3] text-white rounded-md',
              chevron: 'text-red-500',
              today: 'font-bold',
            }}
          />
        </div>
      )}
    </div>
  )
}
