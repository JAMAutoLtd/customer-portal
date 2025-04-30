import { Client, LatLngLiteral, TravelMode, DistanceMatrixRequest, DistanceMatrixResponseData } from '@googlemaps/google-maps-services-js';
import { logger } from '../utils/logger'; // Import logger

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

// --- Start: Add Types for Bulk Operation ---

/** Represents a single origin-destination pair for bulk fetching. */
export interface TravelTimePair {
  origin: LatLngLiteral;
  destination: LatLngLiteral;
}

/** Represents the result map from the bulk operation. Key: "originLat,originLng:destLat,destLng", Value: duration seconds or null */
export type BulkTravelTimeResultMap = Map<string, number | null>;

// --- End: Add Types for Bulk Operation ---

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
            logger.debug(`Cache expired for ${key}.`);
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
 * @param {Date} [departureTime] - Optional specific departure time for predictive traffic. Overrides useRealTime if provided.
 * @returns {Promise<number | null>} A promise resolving to the travel duration in seconds, or null if an error occurs.
 */
export async function getTravelTime(
  origin: LatLngLiteral,
  destination: LatLngLiteral,
  useRealTime: boolean = false,
  departureTime?: Date
): Promise<number | null> {
  // --- Start: Cache Check Logic (Consistent with Bulk) ---
  const cacheKey = getCacheKey(origin, destination, useRealTime || !!departureTime);
  const cacheTTL = useRealTime || !!departureTime ? REALTIME_CACHE_TTL : STANDARD_CACHE_TTL;

  if (travelTimeCache.has(cacheKey)) {
    const cachedTime = travelTimeCache.get(cacheKey);
    const cacheTimestamp = cacheTimeStamps.get(cacheKey) || 0;
    if (Date.now() - cacheTimestamp <= cacheTTL) {
        return cachedTime as number;
    } else {
        travelTimeCache.delete(cacheKey);
        cacheTimeStamps.delete(cacheKey);
        // console.log(`Cache expired for ${cacheKey}.`);
        logger.debug(`Cache expired for ${cacheKey}.`);
    }
  }
  // --- End: Cache Check Logic ---

  try {
    const apiParams: DistanceMatrixRequest['params'] = {
      origins: [origin],
      destinations: [destination],
      mode: TravelMode.driving,
      key: apiKey!,
    };

    if (departureTime) {
      apiParams.departure_time = departureTime;
      // console.log(`Requesting predictive travel time for ${cacheKey} at ${departureTime.toISOString()}`);
      logger.debug(`Requesting predictive travel time for ${cacheKey} at ${departureTime.toISOString()}`);
    } else if (useRealTime) {
      apiParams.departure_time = new Date();
    }

    const response = await mapsClient.distancematrix({
      params: apiParams,
      timeout: 5000, 
    });

    const data = response.data as DistanceMatrixResponseData; 

    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      const durationSeconds = (departureTime || useRealTime) && data.rows[0].elements[0].duration_in_traffic
          ? data.rows[0].elements[0].duration_in_traffic.value
          : data.rows[0].elements[0].duration.value;

      // console.log(`Successfully fetched travel time for ${cacheKey}: ${durationSeconds}s ${departureTime ? `(predictive @ ${departureTime.toISOString()})` : (useRealTime ? '(real-time)' : '(standard)')}`);

      // --- Start: Cache Update Logic (Consistent with Bulk) ---
      travelTimeCache.set(cacheKey, durationSeconds);
      cacheTimeStamps.set(cacheKey, Date.now());
      // --- End: Cache Update Logic ---

      return durationSeconds;
    } else {
      // console.error(
      logger.error(
        `Error fetching distance matrix for ${cacheKey}: ` +
        `Response status: ${data.status}, Element status: ${data.rows[0]?.elements[0]?.status}`
      );
      return null;
    }
  } catch (error: any) {
    // console.error(`Error calling Google Maps API for ${cacheKey}:`, error.response?.data || error.message || error);
    logger.error(`Error calling Google Maps API for ${cacheKey}:`, error.response?.data || error.message || error);
    return null;
  }
}

// --- Start: Update Bulk Travel Time Function with Caching ---

// Google Maps API Limits (example, check current documentation)
const MAX_ORIGINS_PER_REQUEST = 25;
const MAX_DESTINATIONS_PER_REQUEST = 25;
const MAX_ELEMENTS_PER_REQUEST = 100; // Origins * Destinations

/**
 * Fetches travel times for multiple origin-destination pairs using batched Google Maps API requests.
 * Handles basic batching based on origin count and checks cache first.
 *
 * @param {TravelTimePair[]} pairs - Array of origin-destination pairs.
 * @param {boolean} [useRealTime=false] - Whether to request real-time traffic data.
 * @param {Date} [departureTime] - Optional specific departure time for predictive traffic. Overrides useRealTime if provided.
 * @returns {Promise<BulkTravelTimeResultMap>} A map where keys are "originLat,originLng:destLat,destLng" and values are duration in seconds or null.
 */
export async function getBulkTravelTimes(
  pairs: TravelTimePair[],
  useRealTime: boolean = false,
  departureTime?: Date
): Promise<BulkTravelTimeResultMap> {
  // console.log(`Starting bulk travel time fetch for ${pairs.length} pairs. Real-time: ${useRealTime}, Predictive: ${!!departureTime}`);
  logger.info(`Starting bulk travel time fetch for ${pairs.length} pairs. Real-time: ${useRealTime}, Predictive: ${!!departureTime}`);
  const results: BulkTravelTimeResultMap = new Map();
  const pairsToFetch: TravelTimePair[] = [];
  const isPredictiveOrRealtime = useRealTime || !!departureTime;
  const cacheTTL = isPredictiveOrRealtime ? REALTIME_CACHE_TTL : STANDARD_CACHE_TTL;

  // --- Start: Check Cache Before Fetching --- 
  // console.log('Checking cache for existing travel times...');
  logger.debug('Checking cache for existing travel times...');
  let cacheHits = 0;
  pairs.forEach(pair => {
    const cacheKey = getCacheKey(pair.origin, pair.destination, isPredictiveOrRealtime);
    if (travelTimeCache.has(cacheKey)) {
        const cachedTime = travelTimeCache.get(cacheKey);
        const cacheTimestamp = cacheTimeStamps.get(cacheKey) || 0;
        if (Date.now() - cacheTimestamp <= cacheTTL) {
            results.set(cacheKey.replace(/:realtime$/, ''), cachedTime as number); // Store result with standard key format
            cacheHits++;
        } else {
            // Expired, needs fetching
            travelTimeCache.delete(cacheKey);
            cacheTimeStamps.delete(cacheKey);
            pairsToFetch.push(pair);
        }
    } else {
        // Not in cache, needs fetching
        pairsToFetch.push(pair);
    }
  });
  // console.log(`Cache check complete. Hits: ${cacheHits}, Pairs to fetch: ${pairsToFetch.length}`);
  logger.debug(`Cache check complete. Hits: ${cacheHits}, Pairs to fetch: ${pairsToFetch.length}`);
  // --- End: Check Cache Before Fetching --- 

  if (pairsToFetch.length === 0) {
    // console.log('No pairs need fetching from API.');
    logger.info('No pairs need fetching from API.');
    return results; 
  }

  // --- Start: Batching Logic (No Change Needed) --- 
  const uniqueOriginsMap = new Map<string, { coords: LatLngLiteral, destinations: LatLngLiteral[] }>();
  pairsToFetch.forEach(pair => {
    const originKey = `${pair.origin.lat},${pair.origin.lng}`;
    if (!uniqueOriginsMap.has(originKey)) {
        uniqueOriginsMap.set(originKey, { coords: pair.origin, destinations: [] });
    }
    uniqueOriginsMap.get(originKey)?.destinations.push(pair.destination);
  });

  const originBatches: LatLngLiteral[][] = [];
  let currentBatch: LatLngLiteral[] = [];
  uniqueOriginsMap.forEach((originData) => {
    if (currentBatch.length >= MAX_ORIGINS_PER_REQUEST) {
        originBatches.push(currentBatch);
        currentBatch = [];
    }
    currentBatch.push(originData.coords);
  });
  if (currentBatch.length > 0) {
    originBatches.push(currentBatch);
  }
  // --- End: Batching Logic --- 

  // console.log(`Created ${originBatches.length} origin batches for API requests.`);
  logger.debug(`Created ${originBatches.length} origin batches for API requests.`);

  // Process each batch of origins
  for (const originBatch of originBatches) {
    const destinationsForBatchSet = new Set<string>();
    const allDestinationsForBatchCoords: LatLngLiteral[] = [];
    originBatch.forEach(originCoord => {
        const originKey = `${originCoord.lat},${originCoord.lng}`;
        uniqueOriginsMap.get(originKey)?.destinations.forEach(destCoord => {
            const destKey = `${destCoord.lat},${destCoord.lng}`;
            if (!destinationsForBatchSet.has(destKey)) {
                destinationsForBatchSet.add(destKey);
                allDestinationsForBatchCoords.push(destCoord);
            }
        });
    });

    if (allDestinationsForBatchCoords.length === 0) continue;

    // --- Start: Implement Destination Sub-Batching --- 
    // Instead of one call per origin batch, call for each origin with its destinations batched
    for (const singleOrigin of originBatch) {
        const originKey = `${singleOrigin.lat},${singleOrigin.lng}`;
        const destinationsForThisOrigin = uniqueOriginsMap.get(originKey)?.destinations || [];
        if (destinationsForThisOrigin.length === 0) continue;

        // Batch destinations for this single origin
        for (let i = 0; i < destinationsForThisOrigin.length; i += MAX_DESTINATIONS_PER_REQUEST) {
            const destinationSubBatch = destinationsForThisOrigin.slice(i, i + MAX_DESTINATIONS_PER_REQUEST);
            
            logger.debug(`Processing sub-batch: 1 origin, ${destinationSubBatch.length} destinations.`);

            try {
              const apiParams: DistanceMatrixRequest['params'] = {
                origins: [singleOrigin], // Single origin
                destinations: destinationSubBatch, // Sub-batch of destinations
                mode: TravelMode.driving,
                key: apiKey!,
              };
              if (departureTime) {
                apiParams.departure_time = departureTime;
              } else if (useRealTime) {
                apiParams.departure_time = new Date();
              }

              const response = await mapsClient.distancematrix({ params: apiParams, timeout: 10000 });
              const data = response.data as DistanceMatrixResponseData;

              if (data.status === 'OK') {
                // Result has one row corresponding to the single origin
                if (data.rows.length > 0) {
                    const row = data.rows[0];
                    row.elements.forEach((element, j) => {
                        const destination = destinationSubBatch[j];
                        const resultKeyStandard = `${singleOrigin.lat},${singleOrigin.lng}:${destination.lat},${destination.lng}`;
                        const cacheKey = getCacheKey(singleOrigin, destination, isPredictiveOrRealtime);

                        if (element.status === 'OK') {
                          const durationSeconds = (departureTime || useRealTime) && element.duration_in_traffic
                            ? element.duration_in_traffic.value
                            : element.duration.value;
                          results.set(resultKeyStandard, durationSeconds);
                          travelTimeCache.set(cacheKey, durationSeconds);
                          cacheTimeStamps.set(cacheKey, Date.now());
                        } else {
                          logger.warn(`Element status error for ${resultKeyStandard}: ${element.status}`);
                          results.set(resultKeyStandard, null);
                        }
                    });
                } else {
                     logger.error(`Distance Matrix API error: No rows returned for single origin request.`);
                     // Mark all destinations for this sub-batch as null
                     destinationSubBatch.forEach(dest => { 
                        const resultKeyStandard = `${singleOrigin.lat},${singleOrigin.lng}:${dest.lat},${dest.lng}`;
                        if (!results.has(resultKeyStandard)) results.set(resultKeyStandard, null);
                     });
                }
              } else {
                logger.error(`Distance Matrix API error for sub-batch. Origin: ${originKey}, Status: ${data.status}, Error: ${data.error_message || 'N/A'}`);
                destinationSubBatch.forEach(dest => { 
                    const resultKeyStandard = `${singleOrigin.lat},${singleOrigin.lng}:${dest.lat},${dest.lng}`;
                    if (!results.has(resultKeyStandard)) results.set(resultKeyStandard, null);
                 });
              }
            } catch (error: any) {
              logger.error(`Error calling Google Maps API for sub-batch. Origin: ${originKey}:`, error.response?.data || error.message || error);
              destinationSubBatch.forEach(dest => { 
                  const resultKeyStandard = `${singleOrigin.lat},${singleOrigin.lng}:${dest.lat},${dest.lng}`;
                  if (!results.has(resultKeyStandard)) results.set(resultKeyStandard, null);
              });
            }
        } // End loop over destination sub-batches
    } // End loop over single origins within originBatch
    // --- End: Implement Destination Sub-Batching --- 
  } // End loop over origin batches

  logger.info(`Bulk travel time fetch complete. Final results map size: ${results.size}`);
  return results;
}
// --- End: Update Bulk Travel Time Function with Caching ---

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