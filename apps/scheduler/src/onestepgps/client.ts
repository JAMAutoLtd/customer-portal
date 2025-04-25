import axios, { AxiosError } from 'axios';

const apiKey = process.env.ONESTEP_GPS_API_KEY;
const baseUrl = 'https://track.onestepgps.com/v3/api/public/device-info';

// Define LatLngLiteral interface here
interface LatLngLiteral {
    lat: number;
    lng: number;
}

// Define API/Response Types
interface OneStepGpsDevice {
    device_id: string;
    display_name: string;
    lat?: number;
    lng?: number;
    dt_tracker?: string; // ISO 8601 timestamp (UTC)
    // Add other potential fields if needed (e.g., drive_status) based on API spec/tests
}

// Type for the function's successful return value (maps device ID to location data)
export interface DeviceLocationMap {
    [deviceId: string]: {
        lat: number;
        lng: number;
        timestamp: string; // ISO 8601 timestamp
    }
}

/**
 * Fetches the latest known locations for all devices from the One Step GPS API.
 * @returns {Promise<DeviceLocationMap | null>} A map of device IDs to their location data, or null if the fetch fails.
 */
export async function fetchDeviceLocations(): Promise<DeviceLocationMap | null> {
    if (!apiKey) {
        console.error('OneStepGPS Error: ONESTEP_GPS_API_KEY environment variable not set.');
        return null;
    }

    // Parameters confirmed necessary by manual testing
    const params = {
        'lat_lng': 1,
        'device': 1,
        'dt_tracker': 1,
    };

    try {
        console.log('Fetching real-time locations from One Step GPS...');
        const response = await axios.get<OneStepGpsDevice[]>(baseUrl, {
            params,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 15000 // 15 second timeout
        });

        if (response.status === 200) {
            const locationData: DeviceLocationMap = {};
            let processedCount = 0;
            response.data.forEach(device => {
                // Ensure all required fields are present and lat/lng are valid numbers
                if (device.device_id &&
                    device.lat != null && typeof device.lat === 'number' &&
                    device.lng != null && typeof device.lng === 'number' &&
                    device.dt_tracker)
                {
                    locationData[device.device_id] = {
                        lat: device.lat,
                        lng: device.lng,
                        timestamp: device.dt_tracker
                    };
                    processedCount++;
                } else {
                    // Optional: Log devices skipped due to missing or invalid data
                    console.warn(`OneStepGPS: Skipping device due to missing/invalid data: ${JSON.stringify(device)}`);
                }
            });
            console.log(`OneStepGPS: Successfully processed ${processedCount} device locations.`);
            return locationData;
        } else {
            // This case might be less likely with axios as it throws for non-2xx status codes
            console.error(`OneStepGPS Error: Received non-200 status code: ${response.status}`);
            return null;
        }
    } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
            // The request was made and the server responded with a status code (4xx, 5xx)
            console.error(`OneStepGPS API Error: Status ${axiosError.response.status}`, axiosError.response.data || axiosError.message);
             if (axiosError.response.status === 401 || axiosError.response.status === 403) {
                 console.error("OneStepGPS API Error: Authentication failed. Check API Key.");
             } else if (axiosError.response.status === 429) {
                console.warn("OneStepGPS API rate limit likely exceeded.");
                // Future: Implement backoff/retry here if needed
            }
        } else if (axiosError.request) {
            // The request was made but no response was received
            console.error('OneStepGPS Network Error: No response received.', axiosError.message);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('OneStepGPS Request Setup Error:', axiosError.message);
        }
        // Note: Retry logic is currently out of scope. Returning null on first error.
        return null;
    }
} 