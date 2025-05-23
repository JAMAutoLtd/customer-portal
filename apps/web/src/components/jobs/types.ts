export type JobStatus =
  | 'pending_review'
  | 'queued'
  | 'en_route'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'fixed_time'

export interface BaseJob {
  id: number
  order_id: number
  customer_name: string
  address: {
    street_address: string
    lat?: number
    lng?: number
  }
  vehicle: {
    year: number
    make: string
    model: string
  }
  service_name: string
  requested_time: string
  estimated_sched: string
  status: JobStatus
}

export interface PendingJob extends BaseJob {
  status: 'pending_review'
  equipment_required: string[]
  assigned_technician: number | null
}

export interface TechnicianJob extends BaseJob {
  status: JobStatus
  estimated_sched: string
  assigned_technician: number
}

export interface GroupedJobs {
  [date: string]: TechnicianJob[]
}

export type Technician = {
  id: number
  name: string
}
