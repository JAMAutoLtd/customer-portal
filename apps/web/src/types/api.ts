export interface AddressData {
  street_address: string
  lat?: number
  lng?: number
}

export interface VehicleData {
  year: number
  make: string
  model: string
}

export interface UserData {
  id?: string
  full_name: string
}

export interface ServiceData {
  id?: number
  service_name: string
}

// For technician jobs API
export interface TechnicianJobOrderData {
  user: UserData
  vehicle: VehicleData
}

// For pending/completed jobs API
export interface StandardJobOrderData {
  id: number
  users: UserData
  customer_vehicles: VehicleData
}

export interface TechnicianJobData {
  id: number
  order_id: number
  status: string
  requested_time: string
  estimated_sched: string
  job_duration?: number
  notes?: string
  technician_notes?: string
  address: AddressData
  service: ServiceData
  order: TechnicianJobOrderData
  assigned_technician: number
}

export interface StandardJobData {
  id: number
  order_id: number
  status: string
  requested_time?: string
  estimated_sched?: string
  assigned_technician: number | null
  addresses: AddressData
  services: ServiceData
  orders: StandardJobOrderData
}
