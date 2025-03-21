import React, { useState, useEffect } from 'react'
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

export const OrderForm: React.FC = () => {
  const { user, loading } = useAuth()
  const router = useRouter()
  const nextAvailableDate = getNextAvailableDate()
  const [formData, setFormData] = useState<OrderFormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isAddressValid, setIsAddressValid] = useState(false)
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [services, setServices] = useState<Service[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([])

  React.useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  React.useEffect(() => {
    if (!loading && user) {
      setSelectedTime(getNextAvailableTime())

      setFormData((prev) => ({
        ...prev,
        earliestDate: format(nextAvailableDate, 'yyyy-MM-dd'),
        customerEmail: user.email || '',
      }))
    }
  }, [loading, user])

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
      const [hours, minutes] = selectedTime.split(':')
      const earliestDateTimeISO = `${formData.earliestDate}T${hours.padStart(
        2,
        '0'
      )}:${(minutes || '00').padStart(2, '0')}:00`

      const requestData = {
        ...formData,
        customerEmail: user?.email || '',
        earliestDate: earliestDateTimeISO,
        selectedServiceIds,
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

      // Reset form
      setFormData({
        vin: '',
        vinUnknown: false,
        address: '',
        earliestDate: format(getNextAvailableDate(), 'yyyy-MM-dd'),
        notes: '',
        customerEmail: user?.email || '',
        vehicleYear: '',
        vehicleMake: '',
        vehicleModel: '',
        servicesRequired: {},
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
      >
    ) => {
      const { name, value, type } = e.target
      setFormData((prev) => ({
        ...prev,
        [name]:
          type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
      }))
    },
    [setFormData]
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
      | undefined
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
      checked ? [...prev, serviceId] : prev.filter((id) => id !== serviceId)
    )

    const selectedService = services.find((s) => s.id === serviceId)
    if (selectedService) {
      const [category] = selectedService.slug.split('_')
      handleServiceChange(category, checked)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[768px]">
      <h1 className="text-2xl font-bold mb-8">Submit New Order</h1>

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
            onAddressSelect={(address: string, isValid: boolean) => {
              setFormData((prev) => ({
                ...prev,
                address,
              }))
              setIsAddressValid(isValid)
            }}
          />
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
            onClick={() => router.push('/dashboard')}
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
