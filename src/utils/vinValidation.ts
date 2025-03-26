const API_URL = process.env.NEXT_PUBLIC_NHTSA_API_URL

if (!API_URL) {
  throw new Error('NEXT_PUBLIC_NHTSA_API_URL is not defined')
}

export type DecodedVehicleInfo = {
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
}

export async function validateAndDecodeVin(
  vin: string
): Promise<DecodedVehicleInfo> {
  const response = await fetch(`${API_URL}/decodevin/${vin}?format=json`)
  const data = await response.json()

  const make = data.Results.find((item: any) => item.Variable === 'Make')?.Value
  const year = data.Results.find(
    (item: any) => item.Variable === 'Model Year'
  )?.Value
  const model = data.Results.find(
    (item: any) => item.Variable === 'Model'
  )?.Value
  const error = data.Results.find(
    (item: any) => item.Variable === 'Error Code'
  )?.Value

  if (error !== '0' || !make || !year || !model) {
    throw new Error(
      'Invalid VIN or incomplete vehicle data. Please check the number or use "VIN Unknown" option.'
    )
  }

  return {
    vehicleYear: year,
    vehicleMake: make.toUpperCase(),
    vehicleModel: model.toUpperCase(),
  }
}
