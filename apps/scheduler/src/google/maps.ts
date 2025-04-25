import { Client, LatLngLiteral, TravelMode, DistanceMatrixRequest, DistanceMatrixResponseData } from '@googlemaps/google-maps-services-js';

// Basic in-memory cache for travel times
// Key format: "originLat,originLng:destLat,destLng" - for standard requests
// Key format: "originLat,originLng:destLat,destLng:realtime" - for real-time requests
// Value: duration in seconds
const travelTimeCache = new Map<string, number>();
const STANDARD_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const REALTIME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const cacheTimeStamps = new Map<string, number>();

// Load Google Maps API Key from environment variable
const apiKey = process.env.GOOGLE_MAPS_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_MAPS_API_KEY must be provided in environment variables.');
}

const mapsClient = new Client({});

/**
 * Generates a cache key from origin and destination coordinates, including real-time flag.
 */
function getCacheKey(origin: LatLngLiteral, destination: LatLngLiteral, useRealTime: boolean): string {
  const suffix = useRealTime ? ':realtime' : '';
  return `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}${suffix}`;
}

/**
 * Cleans expired entries from the cache based on their TTL (standard or real-time).
 */
function cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, timestamp] of cacheTimeStamps.entries()) {
        const isRealTimeEntry = key.endsWith(':realtime');
        const ttl = isRealTimeEntry ? REALTIME_CACHE_TTL : STANDARD_CACHE_TTL;
        if (now - timestamp > ttl) {
            travelTimeCache.delete(key);
            cacheTimeStamps.delete(key);
            // console.log(`Cache entry expired and removed: ${key}`); // Less noisy logging
        }
    }
}

// Clean cache periodically (e.g., every minute to catch short TTLs)
if (process.env.NODE_ENV !== 'test') {
  // Shorten interval for faster cleanup of real-time entries
  setInterval(cleanExpiredCache, 1 * 60 * 1000); // Check every minute
}

/**
 * Fetches travel time between two points using Google Maps Distance Matrix API.
 * Uses a simple in-memory cache with different TTLs for standard vs. real-time requests.
 *
 * @param {LatLngLiteral} origin - The starting point coordinates.
 * @param {LatLngLiteral} destination - The ending point coordinates.
 * @param {boolean} [useRealTime=false] - Whether to request real-time traffic data (affects API call and cache TTL).
 * @returns {Promise<number | null>} A promise resolving to the travel duration in seconds, or null if an error occurs.
 */
export async function getTravelTime(
  origin: LatLngLiteral,
  destination: LatLngLiteral,
  useRealTime: boolean = false
): Promise<number | null> {
  const cacheKey = getCacheKey(origin, destination, useRealTime);
  const cacheTTL = useRealTime ? REALTIME_CACHE_TTL : STANDARD_CACHE_TTL;

  // Check cache first
  if (travelTimeCache.has(cacheKey)) {
    const cachedTime = travelTimeCache.get(cacheKey);
    const cacheTimestamp = cacheTimeStamps.get(cacheKey) || 0;
    if (Date.now() - cacheTimestamp <= cacheTTL) {
        // console.log(`Cache hit for ${cacheKey}. Duration: ${cachedTime}s`); // Commented out for cleaner logs
        return cachedTime as number;
    } else {
        // Entry expired, remove it
        travelTimeCache.delete(cacheKey);
        cacheTimeStamps.delete(cacheKey);
        console.log(`Cache expired for ${cacheKey}.`);
    }
  }

  // console.log(`Cache miss for ${cacheKey}. Fetching from Google Maps API...`);

  try {
    // Build parameters conditionally
    const apiParams: DistanceMatrixRequest['params'] = {
      origins: [origin],
      destinations: [destination],
      mode: TravelMode.driving,
      key: apiKey!,
    };

    if (useRealTime) {
      apiParams.departure_time = new Date(); // Use current time instead of string 'now'
      console.log(`Requesting real-time travel time for ${cacheKey}`);
    }

    const response = await mapsClient.distancematrix({
      params: apiParams,
      timeout: 5000, // Timeout in milliseconds
    });

    // Type assertion for response data
    const data = response.data as DistanceMatrixResponseData; 

    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      // duration_in_traffic is available when departure_time is set
      const durationSeconds = useRealTime && data.rows[0].elements[0].duration_in_traffic
          ? data.rows[0].elements[0].duration_in_traffic.value
          : data.rows[0].elements[0].duration.value;

      console.log(`Successfully fetched travel time for ${cacheKey}: ${durationSeconds}s ${useRealTime ? '(real-time)' : '(standard)'}`);

      // Store in cache with timestamp
      travelTimeCache.set(cacheKey, durationSeconds);
      cacheTimeStamps.set(cacheKey, Date.now());

      return durationSeconds;
    } else {
      console.error(
        `Error fetching distance matrix for ${cacheKey}: ` +
        `Response status: ${data.status}, Element status: ${data.rows[0]?.elements[0]?.status}`
      );
      return null;
    }
  } catch (error: any) {
    console.error(`Error calling Google Maps API for ${cacheKey}:`, error.response?.data || error.message || error);
    return null;
  }
}

// Example usage
/*
async function runMapsExample() {
  const originPoint = { lat: 40.7128, lng: -74.0060 }; // Example: NYC
  const destinationPoint = { lat: 34.0522, lng: -118.2437 }; // Example: LA

  try {
    console.log(`Fetching travel time from ${JSON.stringify(originPoint)} to ${JSON.stringify(destinationPoint)}`);
    const duration1 = await getTravelTime(originPoint, destinationPoint);
    console.log(`Attempt 1 - Duration: ${duration1 !== null ? `${duration1} seconds` : 'Error'}`);

    console.log('\nFetching same route again (should hit cache)...');
    const duration2 = await getTravelTime(originPoint, destinationPoint);
    console.log(`Attempt 2 - Duration: ${duration2 !== null ? `${duration2} seconds` : 'Error'}`);

  } catch (err) {
      console.error('Maps example failed:', err);
  }
}

// runMapsExample();
*/ 