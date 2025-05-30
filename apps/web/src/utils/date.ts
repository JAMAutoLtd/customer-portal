import { format as formatDateFns, parseISO, isValid } from 'date-fns'

export const DATE_FORMATS = {
  API_ISO: "yyyy-MM-dd'T'HH:mm:ss'Z'", // ISO 8601 format for APIs
  DATE_ONLY: 'yyyy-MM-dd',
  DATE_TIME: 'yyyy-MM-dd HH:mm',
  DISPLAY_DATE: 'MMM d, yyyy',
  DISPLAY_DATE_FULL: 'EEEE, MMMM d, yyyy',
  DISPLAY_TIME: 'h:mm a',
  DISPLAY_DATE_TIME: 'MMM d, yyyy h:mm a',
}

/**
 * Formats a date as UTC without timezone conversion
 * @param date Date object or ISO string
 * @param formatStr date-fns format string
 * @returns Formatted date string
 */
export function formatUTC(
  date: Date | string,
  formatStr: string = DATE_FORMATS.DATE_ONLY,
): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date

    if (!isValid(dateObj)) {
      return ''
    }

    // Use UTC methods to get date parts
    const year = dateObj.getUTCFullYear()
    const month = dateObj.getUTCMonth()
    const day = dateObj.getUTCDate()
    const hours = dateObj.getUTCHours()
    const minutes = dateObj.getUTCMinutes()
    const seconds = dateObj.getUTCSeconds()

    // Create a new date with the UTC parts but in local time
    const utcDate = new Date(year, month, day, hours, minutes, seconds)

    return formatDateFns(utcDate, formatStr)
  } catch (error) {
    console.error('Error formatting date:', error)
    return ''
  }
}

/**
 * Parses an ISO date string without timezone conversion
 * @param dateString ISO date string
 * @returns Date object
 */
export function parseUTC(dateString: string): Date {
  return parseISO(dateString)
}

/**
 * Converts any Date object or date string to an ISO string for API requests
 * Ensures the date is properly formatted in UTC regardless of source
 * @param date Date object or date string
 * @returns ISO string in UTC format (YYYY-MM-DDTHH:mm:ssZ)
 */
export function toAPIDate(date: Date | string): string {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date

    if (!isValid(dateObj)) {
      return ''
    }

    return dateObj.toISOString() // This automatically converts to UTC ISO format
  } catch (error) {
    console.error('Error converting to API date:', error)
    return ''
  }
}

/**
 * Creates a UTC date from separate date parts (for form submissions)
 * @param year Year
 * @param month Month (0-11)
 * @param day Day of month
 * @param hours Hours (0-23)
 * @param minutes Minutes
 * @param seconds Seconds
 * @returns Date object in UTC
 */
export function createUTCDate(
  year: number,
  month: number,
  day: number,
  hours: number = 0,
  minutes: number = 0,
  seconds: number = 0,
): Date {
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds))
}

/**
 * Converts form date inputs to API-friendly ISO strings
 * Useful when collecting dates from form inputs
 * @param dateString Date string (e.g., from a date picker)
 * @param timeString Optional time string (e.g., "14:30")
 * @returns ISO string in UTC format for API submission
 */
export function formDateToAPI(dateString: string, timeString?: string): string {
  try {
    // Parse the date parts
    const [year, month, day] = dateString.split('-').map(Number)

    // If time provided, parse it too
    let hours = 0
    let minutes = 0

    if (timeString) {
      const [hoursStr, minutesStr] = timeString.split(':')
      hours = parseInt(hoursStr, 10)
      minutes = parseInt(minutesStr, 10)
    }

    // Month is 0-indexed in JavaScript Date
    const utcDate = createUTCDate(year, month - 1, day, hours, minutes)

    return utcDate.toISOString()
  } catch (error) {
    console.error('Error converting form date to API date:', error)
    return ''
  }
}
