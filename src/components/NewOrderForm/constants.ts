import { OrderFormData } from './types'

export const initialFormData: OrderFormData = {
  vin: '',
  vinUnknown: false,
  address: '',
  earliestDate: '',
  notes: '',
  customerEmail: '',
  vehicleYear: '',
  vehicleMake: '',
  vehicleModel: '',
  servicesRequired: {},
}
