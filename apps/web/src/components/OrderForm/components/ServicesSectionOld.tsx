import React from 'react'
import {
  ADASService,
  KeyService,
  KeySource,
  OrderFormData,
  KeyType,
  ModuleService,
} from '../types'

export const ServicesSection = ({
  formData,
  handleServiceChange,
  handleKeyProgrammingChange,
}: {
  formData: OrderFormData
  handleServiceChange: (
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
  ) => void
  handleKeyProgrammingChange: (
    service: KeyService,
    keyType: KeyType,
    keySource: KeySource,
    quantity: number,
    partNumber?: string,
  ) => void
}) => {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Services Required</h2>

      {/* ADAS Calibration */}
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={!!formData.servicesRequired.adasCalibration}
            onChange={(e) =>
              handleServiceChange(
                'adasCalibration',
                e.target.checked ? [] : undefined,
              )
            }
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm font-medium">ADAS Calibration</span>
        </label>
        {formData.servicesRequired.adasCalibration && (
          <div className="ml-6 space-y-2">
            {(
              [
                'Front Radar',
                'Windshield Camera',
                '360 Camera or Side Mirror',
                'Blind Spot Monitor',
                'Parking Assist Sensor',
              ] as ADASService[]
            ).map((service) => (
              <label key={service} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.servicesRequired.adasCalibration?.includes(
                    service,
                  )}
                  onChange={(e) => {
                    const current =
                      formData.servicesRequired.adasCalibration || []
                    handleServiceChange(
                      'adasCalibration',
                      e.target.checked
                        ? [...current, service]
                        : current.filter((s) => s !== service),
                    )
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm">{service}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Airbag Module Reset */}
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={!!formData.servicesRequired.airbagModuleReset}
            onChange={(e) =>
              handleServiceChange('airbagModuleReset', e.target.checked)
            }
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm font-medium">Airbag Module Reset</span>
        </label>
      </div>

      {/* Module Replacement */}
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={!!formData.servicesRequired.moduleReplacement}
            onChange={(e) =>
              handleServiceChange(
                'moduleReplacement',
                e.target.checked ? [] : undefined,
              )
            }
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm font-medium">
            Module Replacement Programming or Calibration
          </span>
        </label>
        {formData.servicesRequired.moduleReplacement && (
          <div className="ml-6 space-y-2">
            {(
              [
                'ECM',
                'TCM',
                'BCM',
                'Airbag Module',
                'Instrument Cluster',
                'Front Radar',
                'Windshield Camera',
                'Blind Spot Monitor',
                'Headlamp Module',
                'Other',
              ] as ModuleService[]
            ).map((service) => (
              <label key={service} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.servicesRequired.moduleReplacement?.includes(
                    service,
                  )}
                  onChange={(e) => {
                    const current =
                      formData.servicesRequired.moduleReplacement || []
                    handleServiceChange(
                      'moduleReplacement',
                      e.target.checked
                        ? [...current, service]
                        : current.filter((s) => s !== service),
                    )
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm">{service}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Key Programming */}
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={!!formData.servicesRequired.keyProgramming}
            onChange={(e) => {
              const defaultQuantity = formData.vehicleMake === 'FORD' ? 2 : 1
              handleServiceChange(
                'keyProgramming',
                e.target.checked
                  ? {
                      service: 'All Keys Lost/No Working Keys',
                      keyType: 'Push Button Start',
                      keySource: 'JAM Providing',
                      quantity: defaultQuantity,
                    }
                  : undefined,
              )
            }}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm font-medium">
            Keys or Immobilizer Programming
          </span>
        </label>
        {formData.servicesRequired.keyProgramming && (
          <div className="ml-6 space-y-4">
            {/* Service Type Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Service Type
              </label>
              <div className="space-y-2">
                {(
                  [
                    'Immobilizer Module Replaced',
                    'All Keys Lost/No Working Keys',
                    'Adding Additional Spare Keys',
                  ] as KeyService[]
                ).map((service) => (
                  <label key={service} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={
                        formData.servicesRequired.keyProgramming?.service ===
                        service
                      }
                      onChange={() =>
                        handleKeyProgrammingChange(
                          service,
                          'Push Button Start',
                          'JAM Providing',
                          1,
                        )
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="text-sm">{service}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Key Type Selection (only for All Keys Lost and Adding Additional Spare Keys) */}
            {(formData.servicesRequired.keyProgramming.service ===
              'All Keys Lost/No Working Keys' ||
              formData.servicesRequired.keyProgramming.service ===
                'Adding Additional Spare Keys') && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Key Type
                </label>
                <div className="space-y-2">
                  {(['Push Button Start', 'Blade Ignition'] as KeyType[]).map(
                    (type) => (
                      <label key={type} className="flex items-center space-x-2">
                        <input
                          type="radio"
                          checked={
                            formData.servicesRequired.keyProgramming
                              ?.keyType === type
                          }
                          onChange={() =>
                            handleKeyProgrammingChange(
                              formData.servicesRequired.keyProgramming!.service,
                              type,
                              formData.servicesRequired.keyProgramming!
                                .keySource,
                              formData.servicesRequired.keyProgramming!
                                .quantity,
                            )
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="text-sm">{type}</span>
                      </label>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Key Source Selection (only for All Keys Lost and Adding Additional Spare Keys) */}
            {(formData.servicesRequired.keyProgramming.service ===
              'All Keys Lost/No Working Keys' ||
              formData.servicesRequired.keyProgramming.service ===
                'Adding Additional Spare Keys') && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Key Source
                </label>
                <div className="space-y-2">
                  {(['JAM Providing', 'Customer Providing'] as KeySource[]).map(
                    (source) => (
                      <label
                        key={source}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="radio"
                          checked={
                            formData.servicesRequired.keyProgramming
                              ?.keySource === source
                          }
                          onChange={() =>
                            handleKeyProgrammingChange(
                              formData.servicesRequired.keyProgramming!.service,
                              formData.servicesRequired.keyProgramming!.keyType,
                              source,
                              formData.servicesRequired.keyProgramming!
                                .quantity,
                            )
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="text-sm">{source}</span>
                      </label>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Quantity Selection (only for All Keys Lost and Adding Additional Spare Keys) */}
            {(() => {
              const keyProgramming = formData.servicesRequired.keyProgramming
              if (!keyProgramming?.service) return null

              if (
                keyProgramming.service === 'All Keys Lost/No Working Keys' ||
                keyProgramming.service === 'Adding Additional Spare Keys'
              ) {
                return (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Quantity{' '}
                      {formData.vehicleMake === 'FORD' &&
                      keyProgramming.service === 'All Keys Lost/No Working Keys'
                        ? '(minimum 2 required for Ford all-keys-lost)'
                        : '(max 3)'}
                    </label>
                    <input
                      type="number"
                      min={
                        formData.vehicleMake === 'FORD' &&
                        keyProgramming.service ===
                          'All Keys Lost/No Working Keys'
                          ? '2'
                          : '1'
                      }
                      max="3"
                      value={
                        keyProgramming.quantity ||
                        (formData.vehicleMake === 'FORD' &&
                        keyProgramming.service ===
                          'All Keys Lost/No Working Keys'
                          ? 2
                          : 1)
                      }
                      onChange={(e) => {
                        const newQuantity = parseInt(e.target.value)
                        if (
                          formData.vehicleMake === 'FORD' &&
                          keyProgramming.service ===
                            'All Keys Lost/No Working Keys' &&
                          newQuantity < 2
                        ) {
                          return // Don't allow less than 2 keys for Ford all keys lost
                        }
                        handleKeyProgrammingChange(
                          keyProgramming.service,
                          keyProgramming.keyType,
                          keyProgramming.keySource,
                          newQuantity,
                        )
                      }}
                      className={`mt-1 block w-14 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                        formData.vehicleMake === 'FORD' &&
                        keyProgramming.service ===
                          'All Keys Lost/No Working Keys' &&
                        keyProgramming.quantity < 2
                          ? 'border-red-500'
                          : ''
                      }`}
                    />
                    {formData.vehicleMake === 'FORD' &&
                      keyProgramming.service ===
                        'All Keys Lost/No Working Keys' &&
                      keyProgramming.quantity < 2 && (
                        <p className="mt-1 text-sm text-red-600">
                          Ford all-keys-lost requires a minimum of 2 keys
                        </p>
                      )}
                    {(formData.vehicleMake === 'KIA' ||
                      formData.vehicleMake === 'HYUNDAI') && (
                      <div className="mt-4 space-y-2">
                        <p className="text-sm text-red-600">
                          Important: For {formData.vehicleMake} vehicles, please
                          contact your dealer with the VIN to obtain the correct
                          key part number before proceeding.
                        </p>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Dealer Key Part Number
                          </label>
                          <input
                            type="text"
                            value={keyProgramming.partNumber || ''}
                            onChange={(e) => {
                              const partNumber = e.target.value
                              handleKeyProgrammingChange(
                                keyProgramming.service,
                                keyProgramming.keyType,
                                keyProgramming.keySource,
                                keyProgramming.quantity,
                                partNumber,
                              )
                            }}
                            placeholder="Enter dealer key part number"
                            className="mt-1 block w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            required={
                              formData.vehicleMake === 'KIA' ||
                              formData.vehicleMake === 'HYUNDAI'
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              }
              return null
            })()}
          </div>
        )}
      </div>

      {/* Diagnostic or Wiring Repair */}
      <div className="space-y-2">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={!!formData.servicesRequired.diagnosticOrWiring}
            onChange={(e) =>
              handleServiceChange('diagnosticOrWiring', e.target.checked)
            }
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span className="text-sm font-medium">
            Diagnostic or Wiring Repair
          </span>
        </label>
      </div>
    </div>
  )
}
