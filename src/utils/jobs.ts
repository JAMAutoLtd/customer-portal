import { CustomerType, ServiceCategory } from '@/types'

export function determineJobPriority(
  customerType: CustomerType,
  serviceCategory: ServiceCategory
): number {
  if (customerType === CustomerType.INSURANCE) {
    return 1
  }

  if (customerType === CustomerType.COMMERCIAL) {
    if (serviceCategory === ServiceCategory.ADAS) return 2
    if (
      serviceCategory === ServiceCategory.PROG ||
      serviceCategory === ServiceCategory.DIAG
    )
      return 5
  }

  if (serviceCategory === ServiceCategory.AIRBAG) return 3
  if (serviceCategory === ServiceCategory.IMMO) return 4

  if (customerType === CustomerType.RESIDENTIAL) {
    if (serviceCategory === ServiceCategory.PROG) return 6
    if (serviceCategory === ServiceCategory.ADAS) return 7
    if (serviceCategory === ServiceCategory.DIAG) return 8
  }

  return 8
}
