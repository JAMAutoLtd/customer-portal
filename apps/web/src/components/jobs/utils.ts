import { GroupedJobs, TechnicianJob } from './types'
import { formatUTC, parseUTC, DATE_FORMATS } from '../../utils/date'

export const groupJobsByDate = (jobs: TechnicianJob[]): GroupedJobs => {
  // Get today's local date but treat it as if it's in UTC for comparison
  const today = new Date()
  const todayUTC = new Date(
    Date.UTC(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0,
    ),
  )

  const grouped: GroupedJobs = {}

  jobs.forEach((job) => {
    // Parse the UTC date and set to start of day in UTC
    const jobDate = parseUTC(job.estimated_sched)
    const jobDateUTC = new Date(
      Date.UTC(
        jobDate.getUTCFullYear(),
        jobDate.getUTCMonth(),
        jobDate.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    )

    let dateKey
    if (jobDateUTC.getTime() === todayUTC.getTime()) {
      dateKey = 'today'
    } else {
      dateKey = formatUTC(jobDateUTC, DATE_FORMATS.DATE_ONLY)
    }

    if (!grouped[dateKey]) {
      grouped[dateKey] = []
    }

    grouped[dateKey].push(job)
  })

  Object.keys(grouped).forEach((dateKey) => {
    grouped[dateKey].sort(
      (a, b) =>
        parseUTC(a.estimated_sched).getTime() -
        parseUTC(b.estimated_sched).getTime(),
    )
  })

  return grouped
}
