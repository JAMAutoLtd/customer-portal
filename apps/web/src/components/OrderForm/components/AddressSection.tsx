import React from 'react'
import AddressInput from '@/components/inputs/AddressInput'

interface AddressSectionProps {
  address: string
  isAddressValid: boolean
  defaultValue?: string
  onAddressSelect: (
    address: string,
    isValid: boolean,
    lat?: number,
    lng?: number,
  ) => void
}

export const AddressSection: React.FC<AddressSectionProps> = React.memo(
  ({ address, isAddressValid, defaultValue, onAddressSelect }) => (
    <div className="mt-8">
      <label
        htmlFor="address"
        className="block text-sm font-medium text-gray-700 mb-2"
      >
        Address
      </label>
      <AddressInput
        defaultValue={defaultValue}
        onAddressSelect={onAddressSelect}
      />
      {address && !isAddressValid && (
        <p className="mt-1 text-sm text-red-600">
          Please select a valid address from the dropdown suggestions.
        </p>
      )}
    </div>
  ),
)
