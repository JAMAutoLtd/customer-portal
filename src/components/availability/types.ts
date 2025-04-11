import {
  AvailabilityException,
  AvailabilityResponse,
  DayOfWeek,
  DefaultHours,
} from '@/types/availability'

export type FormData = {
  day_of_week?: DayOfWeek
  date?: string
  exception_type?: 'time_off' | 'custom_hours'
  is_available: boolean
  start_time?: string
  end_time?: string
  reason?: string
}

export interface AvailabilityFormProps {
  onSubmit: (data: DefaultHours | AvailabilityException) => void
  type: 'default' | 'exception'
  initialData?: Partial<FormData>
  existingAvailability?: {
    is_available: boolean
    start_time?: string
    end_time?: string
  }
}

export interface DefaultHoursFormProps {
  onSubmit: (data: DefaultHours) => void
  initialData?: Partial<FormData>
}

export interface ExceptionFormProps {
  onSubmit: (data: AvailabilityException) => void
  initialData?: Partial<FormData>
  existingAvailability?: {
    is_available: boolean
    start_time?: string
    end_time?: string
    reason?: string
  }
}

export interface AvailabilityCalendarProps {
  availabilities: AvailabilityResponse[]
  onDateClick: (date: string) => void
  onMonthChange?: (startDate: string, endDate: string) => void
  selectedDate?: string
}
