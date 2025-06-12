import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger'; // Import logger

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
        logger.error('OneStepGPS Error: ONESTEP_GPS_API_KEY environment variable not set.');
        return null;
    }

    // Parameters confirmed necessary by manual testing
    const params = {
        'lat_lng': 1,
        'device': 1,
        'dt_tracker': 1,
    };

    try {
        logger.info('Fetching real-time locations from One Step GPS...');
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
                    logger.warn(`OneStepGPS: Skipping device due to missing/invalid data: ${JSON.stringify(device)}`);
                }
            });
            logger.info(`OneStepGPS: Successfully processed ${processedCount} device locations.`);
            return locationData;
        } else {
            // This case might be less likely with axios as it throws for non-2xx status codes
            logger.error(`OneStepGPS Error: Received non-200 status code: ${response.status}`);
            return null;
        }
    } catch (error) {
        // Check if it's an AxiosError
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            if (axiosError.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                logger.error(`OneStepGPS API Error: Status ${axiosError.response.status}`, axiosError.response.data || axiosError.message);
                if (axiosError.response.status === 401 || axiosError.response.status === 403) {
                    logger.error("OneStepGPS API Error: Authentication failed. Check API Key.");
                } else if (axiosError.response.status === 429) {
                    logger.warn("OneStepGPS API rate limit likely exceeded.");
                    // Future: Implement backoff/retry here if needed
                }
                // Depending on the status code, you might want to return null or throw
            } else if (axiosError.request) {
                // The request was made but no response was received
                logger.error('OneStepGPS Network Error: No response received.', axiosError.message);
            } else {
                // Something happened in setting up the request that triggered an Error
                logger.error('OneStepGPS Request Setup Error:', axiosError.message);
            }
            // Ensure null is returned if it's an AxiosError and none of the specific returns were hit
            return null;
        } else {
            // Handle non-Axios errors (e.g., programming errors)
            logger.error('OneStepGPS Non-Axios Error:', error);
            return null;
        }
    }
} 