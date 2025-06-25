import React, { useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Loader } from '@/components/ui/Loader'
import { OrderFormProps } from './types'
import { ServicesSection } from './components/ServicesSection'
import { useOrderForm } from './hooks/useOrderForm'
import { useServices } from './hooks/useServices'
import { useCustomerAddress } from './hooks/useCustomerAddress'
import { CustomerBanner } from './components/CustomerBanner'
import { StatusMessages } from './components/StatusMessages'
import { AddressSection } from './components/AddressSection'
import { AppointmentSection } from './components/AppointmentSection'
import { NotesSection } from './components/NotesSection'
import VehicleInfoInput from './components/VehicleInfoInput'

export const OrderForm: React.FC<OrderFormProps> = ({
  customer,
  onSuccess,
  onCancel,
}) => {
  const { user, loading } = useAuth()
  const router = useRouter()

  const orderForm = useOrderForm({
    customer,
    userEmail: user?.email,
    userId: user?.id,
  })
  const { services } = useServices()
  const { customerAddress } = useCustomerAddress(customer)

  useEffect(() => {
    if (!customer && !user && !loading) {
      router.push('/login')
    }
  }, [customer, user, loading, router])

  useEffect(() => {
    if (customerAddress) {
      orderForm.updateAddress(
        customerAddress.street_address,
        true,
        customerAddress.lat,
        customerAddress.lng,
      )
    }
  }, [customerAddress, orderForm.updateAddress])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const success = await orderForm.submitForm(onSuccess)
      if (success || orderForm.error) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    },
    [orderForm, onSuccess],
  )

  const handleChange = useCallback(
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const { name, value, type } = e.target
      orderForm.updateFormData({
        [name]:
          type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
      })
    },
    [orderForm.updateFormData],
  )

  const handleServiceSelection = useCallback(
    (serviceId: number, checked: boolean) => {
      orderForm.updateServices(serviceId, checked)

      const selectedService = services.find((s) => s.id === serviceId)
      if (selectedService) {
        const [category] = selectedService.slug.split('_')
        orderForm.updateFormData({
          servicesRequired: {
            ...orderForm.formData.servicesRequired,
            [category]: checked,
          },
        })
      }
    },
    [orderForm, services],
  )

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel()
    } else {
      router.push('/orders')
    }
  }, [onCancel, router])

  if (!customer && loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[768px]">
      <h1 className="text-2xl font-bold mb-8">
        {customer ? 'Create Order for Customer' : 'Submit New Order'}
      </h1>

      {customer && <CustomerBanner customer={customer} />}

      <StatusMessages success={orderForm.success} error={orderForm.error} />

      <form onSubmit={handleSubmit} className="space-y-8">
        <VehicleInfoInput
          vin={orderForm.formData.vin}
          vinUnknown={orderForm.formData.vinUnknown}
          vehicleYear={orderForm.formData.vehicleYear}
          vehicleMake={orderForm.formData.vehicleMake}
          vehicleModel={orderForm.formData.vehicleModel}
          servicesRequired={orderForm.formData.servicesRequired}
          onFormDataUpdate={orderForm.updateFormData}
        />

        <AddressSection
          address={orderForm.formData.address}
          isAddressValid={orderForm.isAddressValid}
          defaultValue={customerAddress?.street_address}
          onAddressSelect={orderForm.updateAddress}
        />

        <AppointmentSection
          selectedTime={orderForm.selectedTime}
          onDateSelect={orderForm.updateDate}
          onTimeChange={orderForm.setSelectedTime}
        />

        <NotesSection
          notes={orderForm.formData.notes}
          onChange={handleChange}
        />

        <ServicesSection
          services={services}
          selectedServices={orderForm.selectedServiceIds}
          onServiceChange={handleServiceSelection}
        />

        <div className="flex justify-end space-x-4">
          <Button variant="secondary" type="button" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={orderForm.isSubmitting}>
            {orderForm.isSubmitting ? 'Submitting...' : 'Submit Order'}
          </Button>
        </div>
      </form>
    </div>
  )
}
