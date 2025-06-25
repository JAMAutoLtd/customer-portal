'use client'

import React, { useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import AddressInput from '@/components/inputs/AddressInput'
import { Loader2, AlertCircle } from 'lucide-react'
import { CustomerType } from '@/types'
import { normalizePhoneNumber } from '../../utils/phoneNumber'

interface CustomerCreateFormProps {
  onSuccess: (customer: any) => void
  onCancel: () => void
}

interface FormData {
  full_name: string
  email: string
  phone: string
  customer_type: CustomerType
  street_address: string
  address_lat?: number
  address_lng?: number
}

interface FormErrors {
  full_name?: string
  email?: string
  phone?: string
  street_address?: string
  general?: string
}

export function CustomerCreateForm({
  onSuccess,
  onCancel,
}: CustomerCreateFormProps) {
  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    email: '',
    phone: '',
    customer_type: CustomerType.RESIDENTIAL,
    street_address: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Name validation
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    // Phone validation
    const normalizedPhone = normalizePhoneNumber(formData.phone)
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required'
    } else if (normalizedPhone.length !== 10) {
      newErrors.phone = 'Phone number must be 10 digits'
    }

    // Address validation
    if (!formData.street_address.trim()) {
      newErrors.street_address = 'Address is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const checkForDuplicates = async (): Promise<boolean> => {
    setIsCheckingDuplicate(true)
    try {
      const emailResponse = await fetch(
        `/api/customers/search?q=${encodeURIComponent(formData.email)}`,
      )
      if (emailResponse.ok) {
        const emailData = await emailResponse.json()
        if (emailData.customers && emailData.customers.length > 0) {
          console.log('🌟 user exists')
          setErrors({ email: 'A customer with this email already exists' })
          return false
        }
      }

      // Check by phone
      const phoneResponse = await fetch(
        `/api/customers/search?q=${encodeURIComponent(normalizePhoneNumber(formData.phone))}`,
      )
      if (phoneResponse.ok) {
        const phoneData = await phoneResponse.json()
        if (phoneData.customers && phoneData.customers.length > 0) {
          setErrors({
            phone: 'A customer with this phone number already exists',
          })
          return false
        }
      }

      return true
    } catch (error) {
      console.error('Duplicate check error:', error)
      return true // Allow submission if duplicate check fails
    } finally {
      setIsCheckingDuplicate(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    const noDuplicates = await checkForDuplicates()
    if (!noDuplicates) {
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const response = await fetch('/api/customers/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          phone: normalizePhoneNumber(formData.phone),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        const errorMessage = data.error || 'Failed to create customer'

        // Parse specific field errors from API response
        const newErrors: FormErrors = {}

        if (
          errorMessage.toLowerCase().includes('email') &&
          errorMessage.toLowerCase().includes('already exists')
        ) {
          newErrors.email = 'A user with this email already exists'
        } else if (
          errorMessage.toLowerCase().includes('phone') &&
          errorMessage.toLowerCase().includes('already exists')
        ) {
          newErrors.phone = 'A user with this phone number already exists'
        } else if (errorMessage.toLowerCase().includes('invalid email')) {
          newErrors.email = 'Invalid email format'
        } else if (errorMessage.toLowerCase().includes('invalid phone')) {
          newErrors.phone = 'Invalid phone number'
        } else if (
          errorMessage.toLowerCase().includes('missing required fields')
        ) {
          newErrors.general = 'Please fill in all required fields'
        } else {
          newErrors.general = errorMessage
        }

        setErrors(newErrors)
        return
      }

      const newCustomer = await response.json()
      onSuccess(newCustomer)
    } catch (error) {
      console.error('Customer creation error:', error)
      setErrors({
        general:
          error instanceof Error ? error.message : 'Failed to create customer',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow only digits and common phone formatting characters
    const cleaned = value.replace(/[^\d\s()-]/g, '')
    setFormData({ ...formData, phone: cleaned })
  }

  const handleAddressSelect = useCallback(
    (address: string, isValid: boolean, lat?: number, lng?: number) => {
      setFormData((prev) => ({
        ...prev,
        street_address: address,
        address_lat: lat,
        address_lng: lng,
      }))
      // Clear address error if valid address is selected
      if (isValid && errors.street_address) {
        setErrors((prev) => ({ ...prev, street_address: undefined }))
      }
    },
    [errors.street_address],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
          <div className="text-sm text-red-700">{errors.general}</div>
        </div>
      )}

      <div>
        <label
          htmlFor="full_name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Full Name <span className="text-red-500">*</span>
        </label>
        <Input
          id="full_name"
          type="text"
          value={formData.full_name}
          onChange={(e) =>
            setFormData({ ...formData, full_name: e.target.value })
          }
          className={errors.full_name ? 'border-red-500' : ''}
          disabled={isSubmitting}
          aria-describedby={errors.full_name ? 'full_name-error' : undefined}
          aria-invalid={!!errors.full_name}
        />
        {errors.full_name && (
          <p id="full_name-error" className="mt-1 text-sm text-red-600">
            {errors.full_name}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Email <span className="text-red-500">*</span>
        </label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value.toLowerCase() })
          }
          className={errors.email ? 'border-red-500' : ''}
          disabled={isSubmitting}
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p id="email-error" className="mt-1 text-sm text-red-600">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Phone Number <span className="text-red-500">*</span>
        </label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={handlePhoneChange}
          placeholder="(555) 123-4567"
          className={errors.phone ? 'border-red-500' : ''}
          disabled={isSubmitting}
          aria-describedby={errors.phone ? 'phone-error' : undefined}
          aria-invalid={!!errors.phone}
        />
        {errors.phone && (
          <p id="phone-error" className="mt-1 text-sm text-red-600">
            {errors.phone}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="customer_type"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Customer Type <span className="text-red-500">*</span>
        </label>
        <select
          id="customer_type"
          value={formData.customer_type}
          onChange={(e) =>
            setFormData({
              ...formData,
              customer_type: e.target.value as CustomerType,
            })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isSubmitting}
        >
          <option value={CustomerType.RESIDENTIAL}>Residential</option>
          <option value={CustomerType.COMMERCIAL}>Commercial</option>
          <option value={CustomerType.INSURANCE}>Insurance</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="street_address"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Address <span className="text-red-500">*</span>
        </label>
        <AddressInput onAddressSelect={handleAddressSelect} />
        {errors.street_address && (
          <p className="mt-1 text-sm text-red-600">{errors.street_address}</p>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="submit"
          disabled={isSubmitting || isCheckingDuplicate}
          className="flex-1"
        >
          {isCheckingDuplicate && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isCheckingDuplicate
            ? 'Checking for duplicates...'
            : isSubmitting
              ? 'Creating Customer...'
              : 'Create Customer'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
