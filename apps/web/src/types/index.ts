import { JobStatus } from '@/components/jobs/types'

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
  slug: string
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
    status: JobStatus
    requested_time?: string
    estimated_sched?: string
    job_duration?: number
    notes?: string
    service?: Service
  }[]
}

export interface OrderCardProps {
  order: Order
}

export type UserProfile = {
  id: string
  full_name: string
  phone?: string
  home_address_id?: number
  is_admin: boolean
  customer_type: CustomerType
  email?: string
}

export enum CustomerType {
  INSURANCE = 'insurance',
  COMMERCIAL = 'commercial',
  RESIDENTIAL = 'residential',
}

export enum ServiceCategory {
  ADAS = 'adas',
  AIRBAG = 'airbag',
  IMMO = 'immo',
  PROG = 'prog',
  DIAG = 'diag',
}
