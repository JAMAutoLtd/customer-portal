import React, { useState } from 'react'
import { CheckMarkIcon } from '@/components/icons/CheckMarkIcon'
import { Button } from '@/components/ui/Button'
import VehicleSelect from '@/components/OrderForm/VehicleSelect'
import { VehicleInfo, VehicleInfoInputProps } from './types'
import { validateAndDecodeVin } from '@/utils/vinValidation'

const API_URL = process.env.NEXT_PUBLIC_NHTSA_API_URL

if (!API_URL) {
  throw new Error('NEXT_PUBLIC_NHTSA_API_URL is not defined')
}

const VehicleInfoInput: React.FC<VehicleInfoInputProps> = ({
  vin,
  vinUnknown,
  vehicleYear,
  vehicleMake,
  vehicleModel,
  servicesRequired,
  onFormDataUpdate,
}) => {
  const [isCheckingVin, setIsCheckingVin] = useState(false)
  const [vinError, setVinError] = useState<string | null>(null)
  const [isVinValid, setIsVinValid] = useState(false)

  const handleVinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (value.length <= 17) {
      onFormDataUpdate({ vin: value })
      setIsVinValid(false)
    }
  }

  const handleVinUnknownChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFormDataUpdate({ vinUnknown: e.target.checked })
  }

  const handleVehicleInfoUpdate = (info: VehicleInfo) => {
    let updatedServicesRequired = { ...servicesRequired }

    // If it's a Ford vehicle and key programming is already selected with "All Keys Lost"
    if (
      info.vehicleMake === 'FORD' &&
      servicesRequired.keyProgramming?.service ===
        'All Keys Lost/No Working Keys'
    ) {
      updatedServicesRequired = {
        ...servicesRequired,
        keyProgramming: {
          ...servicesRequired.keyProgramming,
          quantity: Math.max(2, servicesRequired.keyProgramming.quantity),
        },
      }
    }

    // Convert year to number for database compatibility
    const vehicleYear = parseInt(info.vehicleYear) || 0

    onFormDataUpdate({
      ...info,
      vehicleYear: vehicleYear.toString(), // Convert back to string for form state
      servicesRequired: updatedServicesRequired,
    })
  }

  const handleVinCheck = async () => {
    setIsCheckingVin(true)
    setVinError(null)
    setIsVinValid(false)

    try {
      const vehicleInfo = await validateAndDecodeVin(vin)
      handleVehicleInfoUpdate(vehicleInfo)
      setIsVinValid(true)
    } catch (err) {
      setVinError(err instanceof Error ? err.message : 'Failed to validate VIN')
    } finally {
      setIsCheckingVin(false)
    }
  }

  return (
    <div className="space-y-4">
      {!vinUnknown && (
        <div>
          <label
            htmlFor="vin"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            VIN
          </label>
          <div className="flex space-x-3">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  id="vin"
                  name="vin"
                  value={vin}
                  onChange={handleVinChange}
                  required
                  maxLength={17}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    vinError ? 'border-red-500' : ''
                  } ${isVinValid ? 'border-green-500' : ''}`}
                  placeholder="Enter VIN"
                />
                {!vinError && vehicleMake && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <CheckMarkIcon />
                  </div>
                )}
              </div>
              {vinError && (
                <p className="mt-2 text-sm text-red-600">{vinError}</p>
              )}
              {!vinError && vehicleMake && (
                <p className="mt-2 text-sm text-emerald-600">
                  Vehicle: {vehicleYear} {vehicleMake} {vehicleModel}
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={handleVinCheck}
              disabled={vin.length !== 17 || isCheckingVin}
              variant="secondary"
              className="h-[42px]"
            >
              {isCheckingVin ? 'Checking...' : 'Check VIN'}
            </Button>
          </div>
        </div>
      )}

      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="vinUnknown"
            name="vinUnknown"
            checked={vinUnknown}
            onChange={handleVinUnknownChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-700">VIN Unknown</span>
        </label>
      </div>

      {vinUnknown && (
        <div>
          <VehicleSelect
            onVehicleSelect={({ year, make, model }) => {
              handleVehicleInfoUpdate({
                vehicleYear: year,
                vehicleMake: make,
                vehicleModel: model,
              })
            }}
          />
        </div>
      )}
    </div>
  )
}

export default VehicleInfoInput
