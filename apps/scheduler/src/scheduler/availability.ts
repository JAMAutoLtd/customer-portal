import { Technician, Job, TechnicianAvailability, TechnicianDefaultHours, TechnicianAvailabilityException } from '../types/database.types';
import {
    addDays, 
    isSameDay, 
    startOfDay, 
    endOfDay, 
    parse, 
    set, 
    formatISO, 
    compareAsc, 
    max, 
    min, 
    isWithinInterval,
    format, // Import format function
    isSaturday, 
    isSunday,
} from 'date-fns';
import { logger } from '../utils/logger'; // Import logger
import { parseCalgaryTimeToUTC, formatUTCAsCalgary } from '../utils/timezone';

// --- New Data Structures for Detailed Availability ---
/**
 * Represents a single continuous block of available time.
 */
export interface TimeWindow {
  start: Date; // Use Date objects for easier comparison and manipulation
  end: Date;
}

/**
 * Represents all availability windows for a technician across multiple dates.
 * Uses a Map where the key is the date string (YYYY-MM-DD) and the value is an array of TimeWindows for that date.
 */
export type DailyAvailabilityWindows = Map<string, TimeWindow[]>;

/**
 * Structure to hold the calculated availability for all technicians over a date range.
 * Key is technician ID, value is their DailyAvailabilityWindows Map.
 */
export type AllTechnicianAvailability = Map<number, DailyAvailabilityWindows>; 
// --- End New Data Structures ---

// --- Helper Functions ---

/**
 * LEGACY: Parses a time string (HH:MM:SS) and combines it with a date object 
 * to create a new Date object representing that time in UTC.
 * @deprecated Use parseCalgaryBusinessTimeToUTC instead for Calgary business hours
 * @param timeString The time string (e.g., "09:00:00").
 * @param date The date object (time part is ignored).
 * @returns A Date object set to the specified time in UTC for the given date.
 */
export function parseTimeStringToUTCDate(timeString: string, date: Date): Date {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds || 0));
}

/**
 * Parses a time string from the database (representing Calgary business hours) 
 * and converts it to the proper UTC time for scheduling calculations.
 * 
 * @param timeString The time string (e.g., "09:00:00" = 9 AM Calgary time).
 * @param date The date object (time part is ignored).
 * @returns A Date object set to the Calgary time converted to UTC.
 */
export function parseCalgaryBusinessTimeToUTC(timeString: string, date: Date): Date {
  const utcDate = parseCalgaryTimeToUTC(timeString, date);
  logger.debug(`Converted Calgary business time ${timeString} on ${formatDateToString(date)} to UTC: ${formatUTCAsCalgary(utcDate)}`);
  return utcDate;
}

/**
 * Generates a date string in YYYY-MM-DD format from a Date object.
 * @param date The date object.
 * @returns Date string (e.g., "2024-08-15").
 */
export function formatDateToString(date: Date): string {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- New Gap Identification Logic (Task 3) ---
/**
 * Represents a period of unavailability for a technician.
 */
export interface AvailabilityGap {
  technicianId: number;
  start: string; // ISO 8601 string for the start of the gap
  end: string;   // ISO 8601 string for the end of the gap
  durationSeconds: number; // Duration of the gap in seconds
}

/**
 * Refines availability gap identification logic to accurately detect all types of technician unavailability.
 * Sorts windows and checks for gaps between windows, at the start of the shift, and at the end of the shift.
 *
 * @param technician The OptimizationTechnician object, containing overall shift boundaries.
 * @param availabilityWindows An array of TimeWindow objects representing periods of availability.
 * @returns An array of AvailabilityGap objects.
 */
export function findAvailabilityGaps(
    technician: { id: number; earliestStartTimeISO: string; latestEndTimeISO: string }, // Using a subset of OptimizationTechnician for clarity
    availabilityWindows: TimeWindow[]
  ): AvailabilityGap[] {
  const gaps: AvailabilityGap[] = [];
  logger.debug(`[findAvailabilityGaps] TechID: ${technician.id}, Input Shift: ${technician.earliestStartTimeISO} - ${technician.latestEndTimeISO}, Input Windows: ${JSON.stringify(availabilityWindows.map(w=>({s:w.start.toISOString(), e:w.end.toISOString()})))}`);

  if (!availabilityWindows || availabilityWindows.length === 0) {
    // If no availability windows, the entire shift is a gap
    const shiftStart = new Date(technician.earliestStartTimeISO).getTime();
    const shiftEnd = new Date(technician.latestEndTimeISO).getTime();
    if (shiftEnd > shiftStart) {
      gaps.push({
        technicianId: technician.id,
        start: technician.earliestStartTimeISO,
        end: technician.latestEndTimeISO,
        durationSeconds: Math.floor((shiftEnd - shiftStart) / 1000)
      });
    }
    return gaps;
  }

  // Sort windows by start time to ensure correct gap calculation
  const sortedWindows = [...availabilityWindows].sort((a, b) => 
    a.start.getTime() - b.start.getTime());

  const shiftStartMs = new Date(technician.earliestStartTimeISO).getTime();
  const shiftEndMs = new Date(technician.latestEndTimeISO).getTime();

  logger.debug(`[findAvailabilityGaps] TechID: ${technician.id}, ShiftMS: ${shiftStartMs} - ${shiftEndMs}, SortedWindowsCount: ${sortedWindows.length}`);

  // Check for a gap at the beginning of the shift
  const firstWindowStartMs = sortedWindows[0].start.getTime();
  if (firstWindowStartMs > shiftStartMs) {
    const duration = Math.floor((firstWindowStartMs - shiftStartMs) / 1000);
    if (duration > 0) {
        gaps.push({
            technicianId: technician.id,
            start: technician.earliestStartTimeISO,
            end: sortedWindows[0].start.toISOString(),
            durationSeconds: duration
        });
        logger.debug(`[findAvailabilityGaps] TechID: ${technician.id}, Pushed BEGIN gap: ${technician.earliestStartTimeISO} - ${sortedWindows[0].start.toISOString()}`);
    }
  }

  // Find gaps between consecutive windows
  for (let i = 0; i < sortedWindows.length - 1; i++) {
    const currentWindowEndMs = sortedWindows[i].end.getTime();
    const nextWindowStartMs = sortedWindows[i + 1].start.getTime();
    
    if (nextWindowStartMs > currentWindowEndMs) {
      const duration = Math.floor((nextWindowStartMs - currentWindowEndMs) / 1000);
      if (duration > 0) {
        gaps.push({
          technicianId: technician.id,
          start: sortedWindows[i].end.toISOString(),
          end: sortedWindows[i + 1].start.toISOString(),
          durationSeconds: duration
        });
        logger.debug(`[findAvailabilityGaps] TechID: ${technician.id}, Pushed BETWEEN gap: ${sortedWindows[i].end.toISOString()} - ${sortedWindows[i+1].start.toISOString()}`);
      }
    }
  }
  
  // Check for a gap at the end of the shift
  const lastWindowEndMs = sortedWindows[sortedWindows.length - 1].end.getTime();
  if (lastWindowEndMs < shiftEndMs) {
    const duration = Math.floor((shiftEndMs - lastWindowEndMs) / 1000);
    if (duration > 0) {
        gaps.push({
          technicianId: technician.id,
          start: sortedWindows[sortedWindows.length - 1].end.toISOString(),
          end: technician.latestEndTimeISO,
          durationSeconds: duration
        });
        logger.debug(`[findAvailabilityGaps] TechID: ${technician.id}, Pushed END gap: ${sortedWindows[sortedWindows.length - 1].end.toISOString()} - ${technician.latestEndTimeISO}`);
    }
  }
  
  const finalGaps = gaps.filter(gap => gap.durationSeconds > 0);
  logger.debug(`[findAvailabilityGaps] TechID: ${technician.id}, Final gaps after filter: ${JSON.stringify(finalGaps)}`);
  return finalGaps;
}
// --- End New Gap Identification Logic ---

// --- Core Availability Calculation (New Logic) ---

/**
 * Calculates the detailed availability windows for a single technician over a date range,
 * based on their default hours and exceptions.
 * Locked jobs are handled separately.
 *
 * @param technician The technician object, including defaultHours and availabilityExceptions.
 * @param startDate The start of the date range (inclusive).
 * @param endDate The end of the date range (inclusive).
 * @returns DailyAvailabilityWindows Map for the technician.
 */
export function calculateWindowsForTechnician(
  technician: Technician,
  startDate: Date,
  endDate: Date
): DailyAvailabilityWindows {
  const dailyWindows: DailyAvailabilityWindows = new Map();
  const defaultHoursMap = new Map<number, TechnicianDefaultHours[]>();
  const exceptionsMap = new Map<string, TechnicianAvailabilityException>();

  // Pre-process defaults and exceptions for quick lookup
  (technician.defaultHours || []).forEach(dh => {
    if (!defaultHoursMap.has(dh.day_of_week)) {
      defaultHoursMap.set(dh.day_of_week, []);
    }
    // Only consider if marked as available
    if (dh.is_available !== false) { // Treat null/true as available
        defaultHoursMap.get(dh.day_of_week)?.push(dh);
    }
  });

  (technician.availabilityExceptions || []).forEach(ex => {
    exceptionsMap.set(ex.date, ex);
  });

  // Iterate through each day in the range
  let currentDate = new Date(startDate.getTime());
  currentDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(23, 59, 59, 999); // Ensure endDate is inclusive

  while (currentDate <= endDate) {
    const dateString = formatDateToString(currentDate);
    const dayOfWeek = currentDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    let windowsForDay: TimeWindow[] = [];

    // <<< Add Logging >>>
    logger.debug(
      `Processing availability for Tech ${technician.id} on Date: ${dateString}, UTC DayOfWeek: ${dayOfWeek}`,
      {
        technicianId: technician.id,
        targetDateString: dateString,
        targetDayOfWeekUTC: dayOfWeek,
        currentDateISO: currentDate.toISOString(),
      }
    );
    // <<< End Logging >>>

    const exception = exceptionsMap.get(dateString);
    // <<< Add Logging >>>
    logger.debug(`Found exception for ${dateString}: ${exception ? JSON.stringify(exception) : 'None'}`, {
      technicianId: technician.id,
      targetDateString: dateString,
      exceptionFound: !!exception,
      exceptionDetails: exception || null,
    });
    // <<< End Logging >>>

    if (exception) {
      if (exception.exception_type === 'custom_hours' && exception.is_available && exception.start_time && exception.end_time) {
        // Custom hours override defaults
        const start = parseCalgaryBusinessTimeToUTC(exception.start_time, currentDate);
        const end = parseCalgaryBusinessTimeToUTC(exception.end_time, currentDate);
        if (start < end) {
          windowsForDay.push({ start, end });
        }
      }
      // If time_off or custom_hours with is_available=false, windowsForDay remains empty []
    } else {
      // Use default hours if no overriding exception
      const defaults = defaultHoursMap.get(dayOfWeek) || [];
      // <<< Add Logging >>>
      logger.debug(`Using default hours for day ${dayOfWeek}. Found ${defaults.length} default entries.`, {
          technicianId: technician.id,
          targetDateString: dateString,
          targetDayOfWeekUTC: dayOfWeek,
          defaultEntriesCount: defaults.length,
          defaultEntries: defaults, // Log the actual default entries found
      });
      // <<< End Logging >>>
      defaults.forEach(dh => {
          if (dh.start_time && dh.end_time) {
            const start = parseCalgaryBusinessTimeToUTC(dh.start_time, currentDate);
            const end = parseCalgaryBusinessTimeToUTC(dh.end_time, currentDate);
             if (start < end) {
                windowsForDay.push({ start, end });
             }
          }
      });
      // TODO: Merge overlapping/adjacent default windows if multiple exist for a day?
      // For now, assuming non-overlapping defaults based on typical schedules.
    }

    // <<< Add Logging >>>
    logger.debug(`Generated ${windowsForDay.length} windows for Tech ${technician.id} on ${dateString}`, {
        technicianId: technician.id,
        targetDateString: dateString,
        windowsCount: windowsForDay.length,
        generatedWindows: windowsForDay.map(w => ({ start: w.start.toISOString(), end: w.end.toISOString() })),
    });
    // <<< End Logging >>>

    if (windowsForDay.length > 0) {
        // Sort windows by start time just in case
        windowsForDay.sort((a, b) => a.start.getTime() - b.start.getTime());
        dailyWindows.set(dateString, windowsForDay);
    }
    
    // Move to the next day
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  // <<< Add Logging >>>
  // Convert Map to a serializable object for logging
  const windowsToLog: { [key: string]: { start: string; end: string }[] } = {};
  dailyWindows.forEach((windows, dateStr) => {
    windowsToLog[dateStr] = windows.map(w => ({
        start: w.start.toISOString(),
        end: w.end.toISOString()
    }));
  });
  logger.debug(
    `Calculated initial availability windows for technician ${technician.id}`,
    {
      technicianId: technician.id,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      calculatedWindows: windowsToLog,
    }
  );
  // <<< End Logging >>>

  return dailyWindows;
}

/**
 * Subtracts time blocked by locked jobs from a given set of availability windows for a specific date.
 * Modifies the windows array in place.
 *
 * @param windows The array of TimeWindow objects for the date.
 * @param jobStartTime The start time of the locked job.
 * @param jobEndTime The end time of the locked job.
 * @returns The modified array of TimeWindow objects.
 */
function subtractJobTimeFromWindows(windows: TimeWindow[], jobStartTime: Date, jobEndTime: Date): TimeWindow[] {
  const newWindows: TimeWindow[] = [];
  windows.forEach(window => {
    const windowStart = window.start.getTime();
    const windowEnd = window.end.getTime();
    const jobStart = jobStartTime.getTime();
    const jobEnd = jobEndTime.getTime();

    // Check for overlap
    if (windowStart < jobEnd && windowEnd > jobStart) {
      // Case 1: Job starts before window and ends within or after window
      if (jobStart <= windowStart && jobEnd < windowEnd) {
        // Keep the part after the job
        newWindows.push({ start: jobEndTime, end: window.end });
      }
      // Case 2: Job starts within window and ends after window
      else if (jobStart > windowStart && jobEnd >= windowEnd) {
        // Keep the part before the job
        newWindows.push({ start: window.start, end: jobStartTime });
      }
      // Case 3: Job starts within window and ends within window (splits the window)
      else if (jobStart > windowStart && jobEnd < windowEnd) {
        // Keep part before job
        newWindows.push({ start: window.start, end: jobStartTime });
        // Keep part after job
        newWindows.push({ start: jobEndTime, end: window.end });
      }
      // Case 4: Job completely covers the window (jobStart <= windowStart && jobEnd >= windowEnd)
      // Do nothing, effectively removing the window

    } else {
      // No overlap, keep the original window
      newWindows.push(window);
    }
  });
  // Filter out any windows that might have become zero duration (start === end)
  return newWindows.filter(w => w.start.getTime() < w.end.getTime());
}

/**
 * Modifies the daily availability windows for a specific technician by removing time 
 * blocked by their locked jobs for a given target date.
 *
 * @param dailyWindows The technician's calculated DailyAvailabilityWindows.
 * @param lockedJobs An array of all locked jobs (en_route, in_progress, fixed_time) for the target date.
 * @param technicianId The ID of the technician whose windows are being modified.
 * @param targetDate The specific date to apply locked jobs for.
 * @param currentTimeUTC The current UTC time, used for tighter timing on ongoing jobs.
 * @returns The modified DailyAvailabilityWindows map.
 */
export function applyLockedJobsToWindows(
  dailyWindows: DailyAvailabilityWindows,
  lockedJobs: Job[],
  technicianId: number,
  targetDate: Date,
  currentTimeUTC: Date
): DailyAvailabilityWindows {
    const dateString = formatDateToString(targetDate);
    const isTargetDateToday = formatDateToString(targetDate) === formatDateToString(currentTimeUTC);
    let windowsForDay = dailyWindows.get(dateString) || [];

    if (windowsForDay.length === 0) {
        return dailyWindows; // No availability to modify
    }

    const techLockedJobs = lockedJobs.filter(job => job.assigned_technician === technicianId);

    techLockedJobs.forEach(job => {
        let effectiveBlockStartTime: Date | null = null;
        let effectiveBlockEndTime: Date | null = null;

        // Determine job start/end times (ensure UTC)
        if (job.status === 'fixed_time' && job.fixed_schedule_time) {
            // Fixed jobs always use their scheduled time, no tighter timing needed
            effectiveBlockStartTime = new Date(job.fixed_schedule_time); // Assumes ISO string is UTC
            effectiveBlockEndTime = new Date(effectiveBlockStartTime.getTime() + (job.job_duration || 0) * 60000);
            
            logger.debug(`Fixed time job ${job.id}: blocking ${effectiveBlockStartTime.toISOString()} to ${effectiveBlockEndTime.toISOString()}`);
        } else if ((job.status === 'en_route' || job.status === 'in_progress') && job.estimated_sched && job.job_duration) {
            const originalJobStartTimeUTC = new Date(job.estimated_sched); // Assumes ISO string is UTC
            const originalJobDurationMs = job.job_duration * 60000;
            const originalJobEndTimeUTC = new Date(originalJobStartTimeUTC.getTime() + originalJobDurationMs);

            // Check if we should apply tighter timing
            if (isTargetDateToday && 
                originalJobStartTimeUTC.getUTCFullYear() === targetDate.getUTCFullYear() &&
                originalJobStartTimeUTC.getUTCMonth() === targetDate.getUTCMonth() &&
                originalJobStartTimeUTC.getUTCDate() === targetDate.getUTCDate()) {
                
                const currentTimeMs = currentTimeUTC.getTime();
                const jobStartMs = originalJobStartTimeUTC.getTime();
                const jobEndMs = originalJobEndTimeUTC.getTime();

                if (currentTimeMs >= jobEndMs) {
                    // Job should have already finished - don't block any time
                    logger.info(`Job ${job.id} (${job.status}) should have already finished at ${originalJobEndTimeUTC.toISOString()}. Current time: ${currentTimeUTC.toISOString()}. Not blocking any time.`);
                    return; // Skip this job entirely
                } else if (currentTimeMs > jobStartMs) {
                    // Job is currently ongoing (started but not finished)
                    const elapsedMs = currentTimeMs - jobStartMs;
                    const remainingMs = Math.max(0, originalJobDurationMs - elapsedMs);
                    
                    effectiveBlockStartTime = currentTimeUTC;
                    effectiveBlockEndTime = new Date(currentTimeMs + remainingMs);
                    
                    logger.info(`Technician ${technicianId}: Applying tighter timing for ongoing ${job.status} job ${job.id}. Original: ${originalJobStartTimeUTC.toISOString()} - ${originalJobEndTimeUTC.toISOString()}, Effective: ${effectiveBlockStartTime.toISOString()} - ${effectiveBlockEndTime.toISOString()} (${Math.round(remainingMs / 60000)} mins remaining)`);
                } else {
                    // Job hasn't started yet - use original times
                    effectiveBlockStartTime = originalJobStartTimeUTC;
                    effectiveBlockEndTime = originalJobEndTimeUTC;
                    
                    logger.debug(`Job ${job.id} (${job.status}) hasn't started yet. Using original times: ${effectiveBlockStartTime.toISOString()} - ${effectiveBlockEndTime.toISOString()}`);
                }
            } else {
                // Not today or job not on target date - use original times
                effectiveBlockStartTime = originalJobStartTimeUTC;
                effectiveBlockEndTime = originalJobEndTimeUTC;
                
                if (!isTargetDateToday) {
                    logger.debug(`Job ${job.id}: Using original times for future date ${dateString}`);
                }
            }
        }

        if (effectiveBlockStartTime && effectiveBlockEndTime) {
            // Check if the job actually falls on the targetDate
            if (effectiveBlockStartTime.getUTCFullYear() === targetDate.getUTCFullYear() &&
                effectiveBlockStartTime.getUTCMonth() === targetDate.getUTCMonth() &&
                effectiveBlockStartTime.getUTCDate() === targetDate.getUTCDate()) 
            {
                 logger.info(`Technician ${technicianId}: Applying locked job ${job.id} (${effectiveBlockStartTime.toISOString()} - ${effectiveBlockEndTime.toISOString()}) to availability for ${dateString}`);
                 windowsForDay = subtractJobTimeFromWindows(windowsForDay, effectiveBlockStartTime, effectiveBlockEndTime);
            }
        }
    });

    // Update the map with the modified windows
    if (windowsForDay.length > 0) {
        dailyWindows.set(dateString, windowsForDay.sort((a, b) => a.start.getTime() - b.start.getTime()));
    } else {
        dailyWindows.delete(dateString); // Remove entry if no windows remain
    }

    // <<< Add Logging for Locked Jobs Impact >>>
    const finalWindowsToLog: { [key: string]: { start: string; end: string }[] } = {};
    dailyWindows.forEach((windows, dateStr) => {
      finalWindowsToLog[dateStr] = windows.map(w => ({
        start: w.start.toISOString(),
        end: w.end.toISOString(),
      }));
    });
    logger.debug(
      `Applied locked jobs for technician ${technicianId} on ${dateString}`,
      {
        technicianId: technicianId,
        targetDate: dateString,
        isToday: isTargetDateToday,
        currentTime: currentTimeUTC.toISOString(),
        lockedJobsConsidered: techLockedJobs.map(j => ({ // Log IDs and times of jobs applied
          id: j.id,
          status: j.status,
          fixedTime: j.fixed_schedule_time,
          estimatedSched: j.estimated_sched,
          duration: j.job_duration
        })),
        finalAvailabilityWindows: finalWindowsToLog[dateString] || [], // Show only windows for the target date
      }
    );
    // <<< End Logging >>>

    return dailyWindows;
}

// --- Existing Availability Functions (Potentially Deprecated) ---

// Define standard work hours in UTC
export const WORK_START_HOUR_UTC = 9; // 9:00 AM UTC
export const WORK_END_HOUR_UTC = 18; // 6:00 PM UTC
export const WORK_END_MINUTE_UTC = 30; // 6:30 PM UTC

/**
 * Calculates the current time adjusted to be within today's UTC work window.
 * If before start time, returns start time. If after end time, returns end time.
 * Only considers M-F in UTC.
 * @returns {Date} The adjusted current UTC time.
 */
// REMOVED - This function caused issues when running scheduler outside work hours.
// function getAdjustedCurrentTimeUTC(): Date {
//     const now = new Date(); // Current time
// 
//     // Get UTC day: 0 (Sun) - 6 (Sat)
//     const dayOfWeekUTC = now.getUTCDay(); 
// 
//     // Create Date objects for start/end representing UTC times
//     const startOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), WORK_START_HOUR_UTC, 0, 0, 0));
//     const endOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), WORK_END_HOUR_UTC, WORK_END_MINUTE_UTC, 0, 0));
// 
//     // If outside working days (Sat/Sun UTC) or after work hours UTC, consider end of day (effectively unavailable)
//     if (dayOfWeekUTC === 0 || dayOfWeekUTC === 6 || now.getTime() > endOfDayUTC.getTime()) {
//         return endOfDayUTC;
//     }
// 
//     // If before work hours start UTC, use the start time UTC
//     if (now.getTime() < startOfDayUTC.getTime()) {
//         return startOfDayUTC;
//     }
// 
//     // Otherwise, we are within the UTC workday
//     return now;
// }

/**
 * Calculates the earliest availability for each technician for the current day based on locked jobs and work hours (UTC).
 * Updates the `earliest_availability` and `current_location` properties of the technician objects in place.
 *
 * @param {Technician[]} technicians - Array of technician objects.
 * @param {Job[]} lockedJobs - Array of jobs with status 'en_route', 'in_progress', or 'fixed_time'.
 * @deprecated Use calculateWindowsForTechnician and applyLockedJobsToWindows instead.
 */
export function calculateTechnicianAvailability(
  technicians: Technician[],
  lockedJobs: Job[],
): void {
  logger.info(`Calculating availability (UTC) for ${technicians.length} technicians based on ${lockedJobs.length} locked jobs...`);

  // Determine the target date based on "now"
  const now = new Date();
  const targetYearUTC = now.getUTCFullYear();
  const targetMonthUTC = now.getUTCMonth();
  const targetDayOfMonthUTC = now.getUTCDate();

  // Calculate start and end of workday for the target date
  const startOfWorkDayUTC = new Date(Date.UTC(targetYearUTC, targetMonthUTC, targetDayOfMonthUTC, WORK_START_HOUR_UTC, 0, 0, 0));
  const endOfWorkDayUTC = new Date(Date.UTC(targetYearUTC, targetMonthUTC, targetDayOfMonthUTC, WORK_END_HOUR_UTC, WORK_END_MINUTE_UTC, 0, 0));
  logger.info(`Target workday window (UTC): ${startOfWorkDayUTC.toISOString()} - ${endOfWorkDayUTC.toISOString()}`);

  const lockedJobsByTechnician = new Map<number, Job[]>();
  for (const job of lockedJobs) {
    if (job.assigned_technician !== null) {
      if (!lockedJobsByTechnician.has(job.assigned_technician)) {
        lockedJobsByTechnician.set(job.assigned_technician, []);
      }
      lockedJobsByTechnician.get(job.assigned_technician)?.push(job);
    }
  }

  for (const tech of technicians) {
    // Start with the beginning of the workday for the target date
    let techEarliestAvailableUTC = new Date(startOfWorkDayUTC.getTime()); 
    let lastJobLocation: { lat: number; lng: number } | undefined = tech.current_location; // Start with van location if available

    const techLockedJobs = lockedJobsByTechnician.get(tech.id) || [];

    // Sort jobs by estimated start/end time to process chronologically
    techLockedJobs.sort((a, b) => {
        // Ensure comparison treats times as UTC
        const timeA = a.fixed_schedule_time || a.estimated_sched || '0';
        const timeB = b.fixed_schedule_time || b.estimated_sched || '0';
        // new Date() parsing ISO strings correctly gives UTC time value
        return new Date(timeA).getTime() - new Date(timeB).getTime(); 
    });

    for (const job of techLockedJobs) {
      let jobStartTimeUTC: Date | null = null;
      let jobEndTimeUTC: Date | null = null;

      // Dates are parsed from ISO strings (assumed UTC)
      if (job.status === 'fixed_time' && job.fixed_schedule_time) {
        jobStartTimeUTC = new Date(job.fixed_schedule_time);
        // Estimate end time based on duration (add milliseconds)
        jobEndTimeUTC = new Date(jobStartTimeUTC.getTime() + job.job_duration * 60000);
      } else if ((job.status === 'en_route' || job.status === 'in_progress') && job.estimated_sched) {
        jobStartTimeUTC = new Date(job.estimated_sched);
        // Calculate end time by adding duration milliseconds
        jobEndTimeUTC = new Date(jobStartTimeUTC.getTime() + job.job_duration * 60000);
      }
      
      // Compare job end time (UTC) with tech's current earliest availability (UTC)
      if (jobEndTimeUTC && jobEndTimeUTC.getTime() > techEarliestAvailableUTC.getTime()) {
        techEarliestAvailableUTC = jobEndTimeUTC;
        // Update technician's location to this job's address if available
        if (job.address?.lat && job.address?.lng) {
            lastJobLocation = { lat: job.address.lat, lng: job.address.lng };
        }
      }
    }

    // Ensure availability is not beyond the end of the UTC workday
    if (techEarliestAvailableUTC.getTime() > endOfWorkDayUTC.getTime()) {
        techEarliestAvailableUTC = endOfWorkDayUTC;
    }

    // Update the technician object with ISO string (which is inherently UTC)
    tech.earliest_availability = techEarliestAvailableUTC.toISOString();
    tech.current_location = lastJobLocation; // Update location based on last locked job

    logger.info(`Technician ${tech.id}: Available from ${tech.earliest_availability} (UTC) at ${lastJobLocation ? `(${lastJobLocation.lat}, ${lastJobLocation.lng})` : 'default location'}`);
  }
}

/**
 * Calculates the earliest availability for each technician for a specific target day (UTC),
 * based on standard work hours (Mon-Fri UTC, 9:00 AM - 6:30 PM UTC) and their home location.
 * Does not consider currently locked jobs as it's for future planning.
 *
 * @param {Technician[]} technicians - Array of technician objects, must include `home_location`.
 * @param {Date} targetDate - The specific date for which to calculate availability (time part is ignored, only date part is used for UTC calculations).
 * @returns {TechnicianAvailability[]} An array of availability details for technicians available on the target day.
 * @deprecated Use calculateWindowsForTechnician instead.
 */
export function calculateAvailabilityForDay(
  technicians: Technician[],
  targetDate: Date,
): TechnicianAvailability[] {
  // Extract UTC date components
  const targetYearUTC = targetDate.getUTCFullYear();
  const targetMonthUTC = targetDate.getUTCMonth();
  const targetDayOfMonthUTC = targetDate.getUTCDate();
  const targetDayOfWeekUTC = targetDate.getUTCDay(); // 0 (Sun) - 6 (Sat)
  const targetDateStr = `${targetYearUTC}-${(targetMonthUTC + 1).toString().padStart(2, '0')}-${targetDayOfMonthUTC.toString().padStart(2, '0')}`;

  logger.info(`Calculating availability (UTC) for ${technicians.length} technicians for date: ${targetDateStr}`);
  const availabilityResults: TechnicianAvailability[] = [];

  // Skip calculation if the target date is a weekend (UTC)
  if (targetDayOfWeekUTC === 0 || targetDayOfWeekUTC === 6) {
    logger.info(`Target date ${targetDateStr} is a weekend (UTC). No availability calculated.`);
    // Holiday checking is handled by upstream availability data, not explicitly here.
    return availabilityResults; // Return empty array for non-working days
  }

  // Create Date objects representing UTC start/end times for the target day
  const startOfWorkDayUTC = new Date(Date.UTC(targetYearUTC, targetMonthUTC, targetDayOfMonthUTC, WORK_START_HOUR_UTC, 0, 0, 0));
  const endOfWorkDayUTC = new Date(Date.UTC(targetYearUTC, targetMonthUTC, targetDayOfMonthUTC, WORK_END_HOUR_UTC, WORK_END_MINUTE_UTC, 0, 0));

  for (const tech of technicians) {
    // Ensure the technician has a valid home location defined
    if (!tech.home_location || typeof tech.home_location.lat !== 'number' || typeof tech.home_location.lng !== 'number') {
      logger.warn(`Technician ${tech.id} skipped: Missing or invalid home_location.`);
      continue; // Skip technician if home location is missing or invalid
    }

    // Create the availability object for this technician on this day
    const techAvailability: TechnicianAvailability = {
      technicianId: tech.id,
      availabilityStartTimeISO: startOfWorkDayUTC.toISOString(),
      availabilityEndTimeISO: endOfWorkDayUTC.toISOString(),
      startLocation: tech.home_location, // Use home location as the starting point
    };

    availabilityResults.push(techAvailability);
    logger.info(`Technician ${tech.id}: Available on ${targetDateStr} from ${techAvailability.availabilityStartTimeISO} to ${techAvailability.availabilityEndTimeISO} (UTC) starting at home (${tech.home_location.lat}, ${tech.home_location.lng})`);
  }

  logger.info(`Found ${availabilityResults.length} technicians available for ${targetDateStr} (UTC).`);
  return availabilityResults;
}

// Example usage might require fetching technicians and locked jobs first
/*
import { getActiveTechnicians } from '../supabase/technicians';
import { getRelevantJobs } from '../supabase/jobs';

async function runAvailabilityExample() {
  try {
    const technicians = await getActiveTechnicians();
    const allJobs = await getRelevantJobs();
    const lockedJobs = allJobs.filter(job => 
        job.status === 'en_route' || job.status === 'in_progress' || job.status === 'fixed_time'
    );

    calculateTechnicianAvailability(technicians, lockedJobs);

    logger.info('\nTechnician availability updated:');
    logger.info(JSON.stringify(technicians, null, 2));

  } catch (err) {
    logger.error('Failed to run availability example:', err);
  }
}

// runAvailabilityExample();
*/ 