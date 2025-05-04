import { Client, LatLngLiteral, TravelMode, DistanceMatrixRequest, DistanceMatrixResponseData } from '@googlemaps/google-maps-services-js';
import { logger } from '../utils/logger'; // Import logger
import { OptimizationLocation, TravelTimeMatrix } from '../types/optimization.types'; // Added imports

// Basic in-memory cache for travel times
// Key format: "originLat,originLng:destLat,destLng" - for standard requests
// Key format: "originLat,originLng:destLat,destLng:realtime" - for real-time requests
// Value: duration in seconds
const travelTimeCache = new Map<string, number>();
const REALTIME_CACHE_TTL = 20 * 60 * 1000; // 20 minutes in milliseconds
const PREDICTIVE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const cacheTimeStamps = new Map<string, number>();

// Load Google Maps API Key from environment variable
const apiKey = process.env.GOOGLE_MAPS_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_MAPS_API_KEY must be provided in environment variables.');
}

const mapsClient = new Client({});

/**
 * Generates a cache key from origin and destination coordinates, including request type suffix.
 */
function getCacheKey(
    origin: LatLngLiteral, 
    destination: LatLngLiteral, 
    useRealTime: boolean, 
    departureTime?: Date
): string {
  // Suffix is determined solely by departureTime presence for predictive vs real-time
  const suffix = departureTime ? ':predictive' : ':realtime'; 
  return `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}${suffix}`;
}

/**
 * Cleans expired entries from the cache based on their TTL (real-time or predictive).
 */
function cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, timestamp] of cacheTimeStamps.entries()) {
        // Default to REALTIME, use PREDICTIVE only if suffix matches
        const ttl = key.endsWith(':predictive') ? PREDICTIVE_CACHE_TTL : REALTIME_CACHE_TTL;

        if (now - timestamp > ttl) {
            travelTimeCache.delete(key);
            cacheTimeStamps.delete(key);
            // logger.debug(`Cache expired for ${key}.`); // Commented out
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
  // --- Start: Cache Check Logic --- 
  const cacheKey = getCacheKey(origin, destination, useRealTime, departureTime);
  // Determine TTL based on key suffix
  const cacheTTL = cacheKey.endsWith(':predictive') ? PREDICTIVE_CACHE_TTL : REALTIME_CACHE_TTL;

  if (travelTimeCache.has(cacheKey)) {
    const cachedTime = travelTimeCache.get(cacheKey);
    const cacheTimestamp = cacheTimeStamps.get(cacheKey) || 0;
    if (Date.now() - cacheTimestamp <= cacheTTL) {
        return cachedTime as number;
    } else {
        travelTimeCache.delete(cacheKey);
        cacheTimeStamps.delete(cacheKey);
        // console.log(`Cache expired for ${cacheKey}.`);
        // logger.debug(`Cache expired for ${cacheKey}.`); // Commented out
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

// --- Start: Refactored Bulk Travel Time Function ---

// Google Maps API Limits
const MAX_ORIGINS_PER_REQUEST = 25;
const MAX_DESTINATIONS_PER_REQUEST = 25;
const HIGH_PENALTY_SECONDS = 999999;

/**
 * Fetches travel times for multiple locations and returns a complete TravelTimeMatrix.
 * Handles batching API requests and uses an internal cache.
 *
 * @param {OptimizationLocation[]} locations - Array of locations with coordinates and unique IDs.
 * @param {boolean} [useRealTime=false] - Whether to request real-time traffic data.
 * @param {Date} [departureTime] - Optional specific departure time for predictive traffic.
 * @returns {Promise<TravelTimeMatrix>} A matrix where matrix[i][j] is the travel time in seconds from locations[i] to locations[j].
 */
export async function getBulkTravelTimes(
  locations: OptimizationLocation[],
  useRealTime: boolean = false,
  departureTime?: Date
): Promise<TravelTimeMatrix> {
  logger.info(`Starting bulk travel time fetch for ${locations.length} locations. Real-time: ${useRealTime}, Predictive: ${!!departureTime}`);
  const matrix: TravelTimeMatrix = {};
  const locationCoords = locations.map(loc => loc.coords); // Extract coords
  const n = locations.length;

  // Initialize matrix structure
  for (let i = 0; i < n; i++) {
    matrix[i] = {};
    matrix[i][i] = 0; // Distance to self is 0
  }

  const pairsToFetch: { originIndex: number; destIndex: number }[] = [];
  let cacheHits = 0;

  // Check Cache
  logger.debug('Checking cache for existing travel times...');
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const origin = locationCoords[i];
      const destination = locationCoords[j];
      const cacheKey = getCacheKey(origin, destination, useRealTime, departureTime);
      const cacheTTL = cacheKey.endsWith(':predictive') ? PREDICTIVE_CACHE_TTL : REALTIME_CACHE_TTL;

      if (travelTimeCache.has(cacheKey)) {
        const cachedTime = travelTimeCache.get(cacheKey);
        const cacheTimestamp = cacheTimeStamps.get(cacheKey) || 0;
        if (Date.now() - cacheTimestamp <= cacheTTL) {
          matrix[i][j] = cachedTime as number;
          cacheHits++;
        } else {
          // Expired, needs fetching
          travelTimeCache.delete(cacheKey);
          cacheTimeStamps.delete(cacheKey);
          pairsToFetch.push({ originIndex: i, destIndex: j });
        }
      } else {
        // Not in cache, needs fetching
        pairsToFetch.push({ originIndex: i, destIndex: j });
      }
    }
  }
  logger.debug(`Cache check complete. Hits: ${cacheHits}, Pairs to fetch: ${pairsToFetch.length}`);

  if (pairsToFetch.length === 0) {
    logger.info('No pairs need fetching from API.');
    // Ensure all non-diagonal entries are filled (might be unnecessary if loops covered all)
    for (let i = 0; i < n; i++) {
       for (let j = 0; j < n; j++) {
          if (i !== j && matrix[i][j] === undefined) { 
              logger.warn(`Matrix entry [${i}][${j}] was undefined after cache check despite no API fetch needed. Assigning penalty.`);
              matrix[i][j] = HIGH_PENALTY_SECONDS;
          }
       }
    }
    return matrix;
  }

  // Group pairs by origin for efficient batching
  const requestsByOrigin = new Map<number, number[]>(); // Map<originIndex, destIndex[]>
  pairsToFetch.forEach(pair => {
    if (!requestsByOrigin.has(pair.originIndex)) {
      requestsByOrigin.set(pair.originIndex, []);
    }
    requestsByOrigin.get(pair.originIndex)?.push(pair.destIndex);
  });

  // Process API requests batching by origin and destination
  logger.debug(`Processing API fetches for ${requestsByOrigin.size} unique origins.`);
  for (const [originIndex, destinationIndices] of requestsByOrigin.entries()) {
    const originCoord = locationCoords[originIndex];
    
    // Batch destinations for this single origin
    for (let i = 0; i < destinationIndices.length; i += MAX_DESTINATIONS_PER_REQUEST) {
      const destIndexSubBatch = destinationIndices.slice(i, i + MAX_DESTINATIONS_PER_REQUEST);
      const destinationCoordsSubBatch = destIndexSubBatch.map(idx => locationCoords[idx]);

      logger.debug(`API Sub-batch: Origin ${originIndex}, Destinations ${destIndexSubBatch.join(',')}`);

      try {
        const apiParams: DistanceMatrixRequest['params'] = {
          origins: [originCoord],
          destinations: destinationCoordsSubBatch,
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

        if (data.status === 'OK' && data.rows.length > 0) {
          const row = data.rows[0];
          row.elements.forEach((element, k) => {
            const destIndex = destIndexSubBatch[k]; // Get original destination index
            const cacheKey = getCacheKey(originCoord, locationCoords[destIndex], useRealTime, departureTime);

            if (element.status === 'OK') {
              const durationSeconds = (departureTime || useRealTime) && element.duration_in_traffic
                ? element.duration_in_traffic.value
                : element.duration.value;
              matrix[originIndex][destIndex] = durationSeconds;
              travelTimeCache.set(cacheKey, durationSeconds);
              cacheTimeStamps.set(cacheKey, Date.now());
            } else {
              logger.warn(`Element status error for Origin ${originIndex} -> Dest ${destIndex}: ${element.status}. Assigning penalty.`);
              matrix[originIndex][destIndex] = HIGH_PENALTY_SECONDS;
              // Do not cache errors
            }
          });
        } else {
          logger.error(`Distance Matrix API error for Origin ${originIndex}. Status: ${data.status}. Assigning penalty to sub-batch destinations: ${destIndexSubBatch.join(',')}`);
          destIndexSubBatch.forEach(destIndex => {
             if (matrix[originIndex][destIndex] === undefined) { // Avoid overwriting penalties from previous errors
                matrix[originIndex][destIndex] = HIGH_PENALTY_SECONDS;
             }
          });
        }
      } catch (error: any) {
        logger.error(`Error calling Google Maps API for Origin ${originIndex}. Destinations: ${destIndexSubBatch.join(',')}:`, error.response?.data || error.message || error);
        destIndexSubBatch.forEach(destIndex => {
           if (matrix[originIndex][destIndex] === undefined) {
              matrix[originIndex][destIndex] = HIGH_PENALTY_SECONDS;
           }
        });
      }
    } // End loop over destination sub-batches
  } // End loop over origins

  // Final check for any undefined entries (shouldn't happen ideally)
  for (let i = 0; i < n; i++) {
     for (let j = 0; j < n; j++) {
         if (i !== j && matrix[i][j] === undefined) { 
             logger.error(`Matrix entry [${i}][${j}] was unexpectedly undefined after API fetches. Assigning penalty.`);
             matrix[i][j] = HIGH_PENALTY_SECONDS;
         }
     }
  }

  logger.info(`Bulk travel time fetch complete. Matrix size: ${n}x${n}`);
  return matrix;
}
// --- End: Refactored Bulk Travel Time Function ---

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