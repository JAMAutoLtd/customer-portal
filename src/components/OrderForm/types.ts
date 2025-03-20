import { Service } from '@/types'

// OLD FORM TYPES
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
  notes: string
  customerEmail: string
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  servicesRequired: ServicesRequired
}

// NEW FORM TYPES

export interface ServicesSectionProps {
  services: Service[]
  selectedServices: number[]
  onServiceChange: (serviceId: number, checked: boolean) => void
}
