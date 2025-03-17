export type Address = {
  id: number
  street_address: string
  lat?: number
  lng?: number
}

export type Vehicle = {
  id: number
  vin?: string
  ymm: string
}

export type Service = {
  id: number
  service_name: string
}

export type Order = {
  id: number
  repair_order_number?: string
  earliest_available_time?: string
  notes?: string
  invoice?: number
  address: Address
  vehicle: Vehicle
  services: Service[]
  uploads: {
    id: number
    file_name: string
    file_url: string
  }[]
  jobs: {
    id: number
    status: string
    requested_time?: string
    estimated_sched?: string
    job_duration?: number
    notes?: string
  }[]
}

export interface OrderCardProps {
  order: Order
}
