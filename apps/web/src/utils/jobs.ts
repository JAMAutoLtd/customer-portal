import { Database } from '@/types/database.types'

export function determineJobPriority(
  customerType: Database["public"]["Enums"]["customer_type"],
  serviceCategory: Database["public"]["Enums"]["service_category"]
): number {
  if (customerType === 'insurance') {
    return 1
  }

  if (customerType === 'commercial') {
    if (serviceCategory === 'adas') return 2
    if (
      serviceCategory === 'prog' ||
      serviceCategory === 'diag'
    )
      return 5
  }

  if (serviceCategory === 'airbag') return 3
  if (serviceCategory === 'immo') return 4

  if (customerType === 'residential') {
    if (serviceCategory === 'prog') return 6
    if (serviceCategory === 'adas') return 7
    if (serviceCategory === 'diag') return 8
  }

  return 8
}
