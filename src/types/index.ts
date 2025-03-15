// Define types based on the database schema
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

export type ServiceCategory =
  | 'Insurance Claim'
  | 'Salvage Repair or Commercial'
  | 'Residential or Personal'

export type ADASService =
  | 'Front Radar'
  | 'Windshield Camera'
  | '360 Camera or Side Mirror'
  | 'Blind Spot Monitor'
  | 'Parking Assist Sensor'

export type ModuleService =
  | 'ECM'
  | 'TCM'
  | 'BCM'
  | 'Airbag Module'
  | 'Instrument Cluster'
  | 'Front Radar'
  | 'Windshield Camera'
  | 'Blind Spot Monitor'
  | 'Headlamp Module'
  | 'Other'

export type KeyService =
  | 'All Keys Lost/No Working Keys'
  | 'Adding Additional Spare Keys'
  | 'Immobilizer Module Replaced'

export type KeyType = 'Push Button Start' | 'Blade Ignition'
export type KeySource = 'JAM Providing' | 'Customer Providing'

export interface ServicesRequired {
  adasCalibration?: ADASService[]
  airbagModuleReset?: boolean
  moduleReplacement?: ModuleService[]
  keyProgramming?: {
    service: KeyService
    keyType: KeyType
    keySource: KeySource
    quantity: number
    partNumber?: string
  }
  diagnosticOrWiring?: boolean
}

export type OrderFormData = {
  vin: string
  vinUnknown: boolean
  address: string
  earliestDate: string
  earliestTime: string
  notes: string
  customerName: string
  customerEmail: string
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  servicesRequired: ServicesRequired
}
