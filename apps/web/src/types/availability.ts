export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type AvailabilityExceptionType = 'time_off' | 'custom_hours'

export interface DefaultHours {
  id?: number
  technician_id?: number
  day_of_week: DayOfWeek
  start_time: string
  end_time: string
  is_available: boolean
}

export interface AvailabilityException {
  id?: number
  technician_id?: number
  exception_type: AvailabilityExceptionType
  date: string
  is_available: boolean
  start_time?: string
  end_time?: string
  reason?: string
}

export interface AvailabilityResponse {
  date: string
  is_available: boolean
  start_time?: string
  end_time?: string
  reason?: string
}

export interface AvailabilityRange {
  start_date: string
  end_date: string
  availabilities: AvailabilityResponse[]
}
