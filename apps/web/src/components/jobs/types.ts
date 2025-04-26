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
}

export interface PendingJob extends BaseJob {
  status: 'pending_review'
  equipment_required: string[]
  assigned_technician: number | null
}

export interface TechnicianJob extends BaseJob {
  status:
    | 'queued'
    | 'en_route'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'fixed_time'
    | 'pending_review'
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
