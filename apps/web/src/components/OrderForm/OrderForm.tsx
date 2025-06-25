import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import AddressInput from '@/components/inputs/AddressInput'
import { Button } from '@/components/ui/Button'
import { Loader } from '@/components/ui/Loader'
import { format } from 'date-fns'
import { initialFormData } from './constants'
import {
  formatTime,
  getNextAvailableDate,
  getNextAvailableTime,
  isDateDisabled,
} from './helpers'
import { DateInput } from '../inputs/DateInput'
import {
  KeyService,
  KeySource,
  OrderFormData,
  ServicesRequired,
  KeyType,
} from './types'

import { supabase } from '@/utils/supabase/client'
import { Service } from '@/types'
import { ServicesSection } from './ServicesSection'
import VehicleInfoInput from './VehicleInfoInput'
import { validateAndDecodeVin } from '@/utils/vinValidation'
import { DATE_FORMATS, formDateToAPI } from '@/utils/date'

interface Customer {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  customer_type: 'residential' | 'commercial' | 'insurance'
  home_address_id: number | null
}

interface OrderFormProps {
  customer?: Customer | null // Optional customer context for staff mode
  onSuccess?: () => void // Optional callback for successful submission
  onCancel?: () => void // Optional callback for cancel action
}

export const OrderForm: React.FC<OrderFormProps> = ({ 
  customer, 
  onSuccess, 
  onCancel 
}) => {
  const { user, loading } = useAuth()
  const router = useRouter()
  const nextAvailableDate = getNextAvailableDate()
  const [formData, setFormData] = useState({
    ...initialFormData,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isAddressValid, setIsAddressValid] = useState(false)
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [services, setServices] = useState<Service[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([])
  const [customerAddress, setCustomerAddress] = useState<{
    street_address: string
    lat?: number
    lng?: number
  } | null>(null)

  // Authentication check - skip if customer context provided (staff mode)
  React.useEffect(() => {
    if (!customer && !loading && !user) {
      router.push('/login')
    }
  }, [customer, user, loading])

  // Initialize form data based on context (customer vs. self-service)
  React.useEffect(() => {
    if (!loading) {
      setSelectedTime(getNextAvailableTime())

      if (customer) {
        // Staff mode: use customer's email
        setFormData((prev) => ({
          ...prev,
          earliestDate: format(nextAvailableDate, 'yyyy-MM-dd'),
          customerEmail: customer.email || '',
        }))
      } else if (user) {
        // Self-service mode: use authenticated user's email
        setFormData((prev) => ({
          ...prev,
          earliestDate: format(nextAvailableDate, 'yyyy-MM-dd'),
          customerEmail: user.email || '',
        }))
      }
    }
  }, [loading, user, customer, nextAvailableDate])

  // Fetch customer address if customer context is provided
  React.useEffect(() => {
    const fetchCustomerAddress = async () => {
      if (customer?.home_address_id) {
        try {
          const { data, error } = await supabase
            .from('addresses')
            .select('street_address, lat, lng')
            .eq('id', customer.home_address_id)
            .single()

          if (error) {
            console.error('Error fetching customer address:', error)
            return
          }

          if (data) {
            setCustomerAddress(data)
            // Pre-populate form with customer's address
            setFormData(prev => ({
              ...prev,
              address: data.street_address,
              lat: data.lat,
              lng: data.lng,
            }))
            setIsAddressValid(true)
          }
        } catch (error) {
          console.error('Error fetching customer address:', error)
        }
      }
    }

    fetchCustomerAddress()
  }, [customer])

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const { data, error } = await supabase
          .from('services')
          .select('id, service_name, slug')
          .order('service_name')

        if (error) throw error
        setServices(data || [])
      } catch (error) {
        console.error('Error fetching services:', error)
      }
    }

    fetchServices()
  }, [])

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setFormData((prev) => ({
        ...prev,
        earliestDate: format(date, 'yyyy-MM-dd'),
      }))
    }
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTime(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isAddressValid) {
      setError('Please select a valid address from the dropdown suggestions.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(false)

    try {
      let submissionData = { ...formData }

      // Check if VIN needs validation (VIN entered but no vehicle info)
      if (
        formData.vin &&
        !formData.vinUnknown &&
        (!formData.vehicleYear ||
          !formData.vehicleMake ||
          !formData.vehicleModel)
      ) {
        try {
          const vehicleInfo = await validateAndDecodeVin(formData.vin)
          submissionData = {
            ...submissionData,
            ...vehicleInfo,
          }
          setFormData(submissionData)
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to validate VIN',
          )
          window.scrollTo({ top: 0, behavior: 'smooth' })
          return
        }
      }

      const earliestDateTimeISO = formDateToAPI(
        submissionData.earliestDate,
        selectedTime,
      )

      // Determine job priority based on customer type (staff mode) or default (self-service)
      let jobPriority = 3 // Default priority for residential/self-service
      if (customer) {
        switch (customer.customer_type) {
          case 'insurance':
            jobPriority = 1 // Highest priority
            break
          case 'commercial':
            jobPriority = 2 // Medium priority
            break
          case 'residential':
            jobPriority = 3 // Standard priority
            break
        }
      }

      const requestData = {
        ...submissionData,
        lat: formData.lat,
        lng: formData.lng,
        earliestDate: earliestDateTimeISO,
        selectedServiceIds,
        customerEmail: customer ? customer.email || '' : user?.email || '',
        customerId: customer?.id, // Include customer ID for staff mode
        createdByStaff: !!customer, // Flag to indicate staff-created order
        staffUserId: customer ? user?.id : undefined, // Track which staff member created it
        jobPriority, // Include calculated priority
      }

      const response = await fetch('/api/order-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (!response.ok) {
        throw new Error('Failed to submit order')
      }

      setSuccess(true)

      // Call onSuccess callback if provided (staff mode)
      if (onSuccess) {
        onSuccess()
      }

      // Reset form
      setFormData({
        vin: '',
        vinUnknown: false,
        address: '',
        earliestDate: format(getNextAvailableDate(), DATE_FORMATS.DATE_ONLY),
        notes: '',
        customerEmail: user?.email || '',
        vehicleYear: '',
        vehicleMake: '',
        vehicleModel: '',
        servicesRequired: {},
        lat: undefined,
        lng: undefined,
      })
      setSelectedTime(getNextAvailableTime())
    } catch (err) {
      setError('Failed to submit order. Please try again.')
    } finally {
      setIsSubmitting(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleChange = React.useCallback(
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const { name, value, type } = e.target
      setFormData((prev) => ({
        ...prev,
        [name]:
          type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
      }))
    },
    [setFormData],
  )

  const handleFormDataUpdate = (updates: Partial<OrderFormData>) => {
    setFormData((prev) => ({
      ...prev,
      ...updates,
    }))
  }

  const handleServiceChange = (
    service: string,
    value:
      | boolean
      | string[]
      | {
          service: KeyService
          keyType: KeyType
          keySource: KeySource
          quantity: number
        }
      | undefined,
  ) => {
    setFormData((prev) => ({
      ...prev,
      servicesRequired: {
        ...prev.servicesRequired,
        [service as keyof ServicesRequired]: value,
      },
    }))
  }

  const handleServiceSelection = (serviceId: number, checked: boolean) => {
    setSelectedServiceIds((prev) =>
      checked ? [...prev, serviceId] : prev.filter((id) => id !== serviceId),
    )

    const selectedService = services.find((s) => s.id === serviceId)
    if (selectedService) {
      const [category] = selectedService.slug.split('_')
      handleServiceChange(category, checked)
    }
  }

  // Memoize the address selection handler to prevent re-initialization
  const handleAddressSelect = useCallback((
    address: string,
    isValid: boolean,
    lat?: number,
    lng?: number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      address,
      lat,
      lng,
    }))
    setIsAddressValid(isValid)
  }, [])

  // Show loading only for self-service mode (when customer context is not provided)
  if (!customer && loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader />
      </div>
    )
  }

  const getCustomerTypeColor = (type: string) => {
    switch (type) {
      case 'insurance':
        return 'text-purple-600 bg-purple-100'
      case 'commercial':
        return 'text-blue-600 bg-blue-100'
      case 'residential':
        return 'text-green-600 bg-green-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[768px]">
      <h1 className="text-2xl font-bold mb-8">
        {customer ? 'Create Order for Customer' : 'Submit New Order'}
      </h1>

      {/* Customer Context Banner */}
      {customer && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="font-medium text-blue-900 mb-1">
                Creating order for: {customer.full_name || 'Unnamed Customer'}
              </p>
              <div className="text-sm text-blue-700 space-y-1">
                {customer.email && <p>Email: {customer.email}</p>}
                {customer.phone && <p>Phone: {customer.phone}</p>}
                <div className="mt-2">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${getCustomerTypeColor(customer.customer_type)}`}
                  >
                    {customer.customer_type} customer
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-100 text-green-800 rounded-lg">
          Order submitted successfully! You can view it in your dashboard.
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <VehicleInfoInput
          vin={formData.vin}
          vinUnknown={formData.vinUnknown}
          vehicleYear={formData.vehicleYear}
          vehicleMake={formData.vehicleMake}
          vehicleModel={formData.vehicleModel}
          servicesRequired={formData.servicesRequired}
          onFormDataUpdate={handleFormDataUpdate}
        />

        <div className="mt-8">
          <label
            htmlFor="address"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Address
          </label>
          <AddressInput
            defaultValue={customerAddress?.street_address}
            onAddressSelect={handleAddressSelect}
          />
          {customerAddress && (
            <p className="mt-1 text-sm text-blue-600">
              ℹ️ Pre-populated with customer's home address. You can change it if needed.
            </p>
          )}
          {formData.address && !isAddressValid && (
            <p className="mt-1 text-sm text-red-600">
              Please select a valid address from the dropdown suggestions.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Appointment Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="earliestDate"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Earliest Available Date
              </label>
              <DateInput
                defaultDate={getNextAvailableDate()}
                isDateDisabled={isDateDisabled}
                onDateSelect={handleDateSelect}
              />
            </div>

            <div className="flex flex-col justify-start">
              <label
                htmlFor="selectedTime"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Preferred Time
              </label>
              <select
                id="selectedTime"
                name="selectedTime"
                value={selectedTime}
                onChange={handleTimeChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Time</option>
                {Array.from({ length: 9 }, (_, i) => i + 9).map((hour) => (
                  <option key={hour} value={`${hour}:00`}>
                    {formatTime(hour)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Additional Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Any additional information or special requests..."
          />
        </div>

        <ServicesSection
          services={services}
          selectedServices={selectedServiceIds}
          onServiceChange={handleServiceSelection}
        />

        <div className="flex justify-end space-x-4">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              if (onCancel) {
                onCancel()
              } else {
                router.push('/orders')
              }
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Order'}
          </Button>
        </div>
      </form>
    </div>
  )
}
