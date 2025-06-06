/**
 * Calgary timezone utilities for the scheduler
 * Treats database times as Calgary business hours and converts to UTC for calculations
 */

/**
 * Gets the Calgary timezone offset in milliseconds for a given date
 * Calgary is MST (-7 UTC) in winter, MDT (-6 UTC) in summer
 */
export function getCalgaryTimezoneOffset(date: Date): number {
  const year = date.getFullYear();
  
  // DST rules for Alberta, Canada (Calgary)
  // Starts: Second Sunday in March at 2:00 AM
  // Ends: First Sunday in November at 2:00 AM
  
  const isDST = isDaylightSavingTime(date, year);
  
  // Return offset in milliseconds
  // MST = UTC-7 = +7 hours to convert TO UTC 
  // MDT = UTC-6 = +6 hours to convert TO UTC
  return isDST ? 6 * 60 * 60 * 1000 : 7 * 60 * 60 * 1000;
}

/**
 * Determines if a date falls within Daylight Saving Time for Calgary
 */
function isDaylightSavingTime(date: Date, year: number): boolean {
  // DST starts: Second Sunday in March at 2:00 AM
  const dstStart = getNthSundayOfMonth(year, 2, 2); // March (month 2), 2nd Sunday
  
  // DST ends: First Sunday in November at 2:00 AM  
  const dstEnd = getNthSundayOfMonth(year, 10, 1); // November (month 10), 1st Sunday
  
  return date >= dstStart && date < dstEnd;
}

/**
 * Gets the nth Sunday of a given month and year
 */
function getNthSundayOfMonth(year: number, month: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstSunday = new Date(year, month, 1 + (7 - firstDay.getDay()) % 7);
  return new Date(year, month, firstSunday.getDate() + (n - 1) * 7, 2, 0, 0); // 2:00 AM
}

/**
 * Converts a Calgary time string (from database) to UTC Date object
 * This is the key function that treats database times as Calgary business hours
 * 
 * @param timeString Time string like "09:00:00" (representing 9 AM Calgary time)
 * @param date The date to apply the time to
 * @returns Date object in UTC representing the Calgary time
 */
export function parseCalgaryTimeToUTC(timeString: string, date: Date): Date {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  
  // Create a date representing the Calgary time
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  // First create the Calgary local time
  const calgaryTime = new Date(year, month, day, hours, minutes, seconds || 0);
  
  // Convert to UTC by adding the Calgary timezone offset
  const calgaryOffset = getCalgaryTimezoneOffset(calgaryTime);
  const utcTime = new Date(calgaryTime.getTime() + calgaryOffset);
  
  return utcTime;
}

/**
 * Converts a UTC Date to Calgary time components (for display/logging)
 * This reverses the process - useful for debugging and logging
 */
export function utcToCalgaryComponents(utcDate: Date): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  isDST: boolean;
} {
  const calgaryOffset = getCalgaryTimezoneOffset(utcDate);
  const calgaryTime = new Date(utcDate.getTime() - calgaryOffset);
  
  return {
    year: calgaryTime.getFullYear(),
    month: calgaryTime.getMonth(),
    day: calgaryTime.getDate(),
    hours: calgaryTime.getHours(),
    minutes: calgaryTime.getMinutes(),
    seconds: calgaryTime.getSeconds(),
    isDST: isDaylightSavingTime(utcDate, utcDate.getFullYear())
  };
}

/**
 * Formats a UTC date as Calgary time string (for logging)
 */
export function formatUTCAsCalgary(utcDate: Date): string {
  const calgary = utcToCalgaryComponents(utcDate);
  const timeZone = calgary.isDST ? 'MDT' : 'MST';
  return `${calgary.year}-${String(calgary.month + 1).padStart(2, '0')}-${String(calgary.day).padStart(2, '0')} ${String(calgary.hours).padStart(2, '0')}:${String(calgary.minutes).padStart(2, '0')}:${String(calgary.seconds).padStart(2, '0')} ${timeZone}`;
}

/**
 * Creates a UTC date from Calgary time components
 * Useful for test scenarios that need to create specific Calgary times
 */
export function createCalgaryTime(year: number, month: number, day: number, hours: number, minutes: number = 0, seconds: number = 0): Date {
  const calgaryTime = new Date(year, month, day, hours, minutes, seconds);
  const calgaryOffset = getCalgaryTimezoneOffset(calgaryTime);
  return new Date(calgaryTime.getTime() + calgaryOffset);
}