import { useState, useCallback } from 'react'
import { format } from 'date-fns'
import { initialFormData } from '../constants'
import { getNextAvailableDate, getNextAvailableTime } from '../helpers'
import { OrderFormData, Customer } from '../types'
import { validateAndDecodeVin } from '@/utils/vinValidation'
import { DATE_FORMATS, formDateToAPI } from '@/utils/date'

interface UseOrderFormProps {
  customer?: Customer | null
  userEmail?: string
  userId?: string
}

export const useOrderForm = ({
  customer,
  userEmail,
  userId,
}: UseOrderFormProps) => {
  const [formData, setFormData] = useState(() => ({
    ...initialFormData,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    earliestDate: format(getNextAvailableDate(), 'yyyy-MM-dd'),
    customerEmail: customer?.email || userEmail || '',
  }))

  const [selectedTime, setSelectedTime] = useState(() => getNextAvailableTime())
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([])
  const [isAddressValid, setIsAddressValid] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const updateFormData = useCallback(
    (updates: Partial<OrderFormData & { lat?: number; lng?: number }>) => {
      setFormData((prev) => ({ ...prev, ...updates }))
    },
    [],
  )

  const updateAddress = useCallback(
    (address: string, isValid: boolean, lat?: number, lng?: number) => {
      updateFormData({ address, lat, lng })
      setIsAddressValid(isValid)
    },
    [updateFormData],
  )

  const updateDate = useCallback(
    (date: Date | undefined) => {
      if (date) {
        updateFormData({ earliestDate: format(date, 'yyyy-MM-dd') })
      }
    },
    [updateFormData],
  )

  const updateServices = useCallback((serviceId: number, checked: boolean) => {
    setSelectedServiceIds((prev) =>
      checked ? [...prev, serviceId] : prev.filter((id) => id !== serviceId),
    )
  }, [])

  const validateVinAndUpdate = useCallback(
    async (vin: string) => {
      if (!vin || formData.vinUnknown) return true

      try {
        const vehicleInfo = await validateAndDecodeVin(vin)
        updateFormData(vehicleInfo)
        return true
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to validate VIN'
        setError(errorMessage)
        return false
      }
    },
    [formData.vinUnknown, updateFormData],
  )

  const prepareSubmissionData = useCallback(() => {
    const earliestDateTimeISO = formDateToAPI(
      formData.earliestDate,
      selectedTime,
    )

    return {
      ...formData,
      lat: formData.lat,
      lng: formData.lng,
      earliestDate: earliestDateTimeISO,
      selectedServiceIds,
      customerEmail: customer?.email || userEmail || '',
      customerId: customer?.id,
      createdByStaff: !!customer,
      staffUserId: customer ? userId : undefined,
    }
  }, [formData, selectedTime, selectedServiceIds, customer, userEmail, userId])

  const resetForm = useCallback(() => {
    setFormData({
      ...initialFormData,
      lat: undefined,
      lng: undefined,
      earliestDate: format(getNextAvailableDate(), DATE_FORMATS.DATE_ONLY),
      customerEmail: userEmail || '',
    })
    setSelectedTime(getNextAvailableTime())
    setSelectedServiceIds([])
    setIsAddressValid(false)
    setError(null)
    setSuccess(false)
  }, [userEmail])

  const submitForm = useCallback(
    async (onSuccess?: () => void) => {
      if (!isAddressValid) {
        setError('Please select a valid address from the dropdown suggestions.')
        return false
      }

      setIsSubmitting(true)
      setError(null)
      setSuccess(false)

      try {
        const isVinValid = await validateVinAndUpdate(formData.vin)
        if (!isVinValid) {
          setIsSubmitting(false)
          return false
        }

        const requestData = prepareSubmissionData()

        const response = await fetch('/api/order-submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestData),
        })

        if (!response.ok) {
          throw new Error('Failed to submit order')
        }

        setSuccess(true)
        onSuccess?.()
        resetForm()
        return true
      } catch (err) {
        setError('Failed to submit order. Please try again.')
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      isAddressValid,
      formData.vin,
      validateVinAndUpdate,
      prepareSubmissionData,
      resetForm,
    ],
  )

  return {
    formData,
    selectedTime,
    selectedServiceIds,
    isAddressValid,
    isSubmitting,
    error,
    success,
    updateFormData,
    updateAddress,
    updateDate,
    updateServices,
    setSelectedTime,
    setError,
    submitForm,
    resetForm,
  }
}
