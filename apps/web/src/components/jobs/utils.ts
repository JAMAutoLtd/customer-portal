import { GroupedJobs, TechnicianJob } from './types'
import { format } from 'date-fns'

export const groupJobsByDate = (jobs: TechnicianJob[]): GroupedJobs => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const grouped: GroupedJobs = {}

  jobs.forEach((job) => {
    const jobDate = new Date(job.estimated_sched)
    jobDate.setHours(0, 0, 0, 0)

    let dateKey
    if (jobDate.getTime() === today.getTime()) {
      dateKey = 'today'
    } else {
      dateKey = format(jobDate, 'yyyy-MM-dd')
    }

    if (!grouped[dateKey]) {
      grouped[dateKey] = []
    }

    grouped[dateKey].push(job)
  })

  Object.keys(grouped).forEach((dateKey) => {
    grouped[dateKey].sort(
      (a, b) =>
        new Date(a.estimated_sched).getTime() -
        new Date(b.estimated_sched).getTime(),
    )
  })

  return grouped
}
