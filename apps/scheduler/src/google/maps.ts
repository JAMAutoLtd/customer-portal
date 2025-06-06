import { Client, LatLngLiteral, TravelMode, DistanceMatrixRequest, DistanceMatrixResponseData } from '@googlemaps/google-maps-services-js';
import { logger } from '../utils/logger'; // Import logger
import { OptimizationLocation, TravelTimeMatrix } from '../types/optimization.types'; // Added imports
import { TravelTimeCacheService } from '../supabase/travel-time-cache';
import { createClient } from '@supabase/supabase-js';

// Basic in-memory cache for travel times (Level 1 cache)
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

// Initialize Supabase cache service (Level 2 cache)
let cacheService: TravelTimeCacheService | null = null;
if (process.env.NODE_ENV !== 'test' && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  cacheService = new TravelTimeCacheService(supabase);
  logger.info('Initialized Supabase travel time cache service');
} else {
  logger.warn('Supabase travel time cache service not initialized - using in-memory cache only');
}

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
  
  // Also periodically clean up Supabase cache (less frequently)
  if (cacheService) {
    setInterval(async () => {
      try {
        await cacheService!.cleanupExpiredEntries();
      } catch (error) {
        logger.error('Error cleaning up Supabase cache', { error });
      }
    }, 60 * 60 * 1000); // Every hour
  }
}

/**
 * Fetches travel time between two points using Google Maps Distance Matrix API.
 * Uses a two-level cache: in-memory (L1) and Supabase (L2) with different TTLs.
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
  // --- Start: L1 Cache Check (In-Memory) --- 
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
        // logger.debug(`Cache expired for ${cacheKey}.`); // Commented out
    }
  }
  // --- End: L1 Cache Check ---

  // --- Start: L2 Cache Check (Supabase) ---
  if (cacheService) {
    try {
      const isPredictive = !!departureTime;
      const cachedTime = await cacheService.getCacheEntry(origin, destination, isPredictive, departureTime);
      if (cachedTime !== null) {
        // Store in L1 cache for faster subsequent access
        travelTimeCache.set(cacheKey, cachedTime);
        cacheTimeStamps.set(cacheKey, Date.now());
        return cachedTime;
      }
    } catch (error) {
      logger.error('Error checking Supabase cache', { error });
      // Continue to API call if cache check fails
    }
  }
  // --- End: L2 Cache Check ---

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
      const element = data.rows[0].elements[0];
      const durationSeconds = (departureTime || useRealTime) && element.duration_in_traffic
          ? element.duration_in_traffic.value
          : element.duration.value;
      const distanceMeters = element.distance?.value;

      // console.log(`Successfully fetched travel time for ${cacheKey}: ${durationSeconds}s ${departureTime ? `(predictive @ ${departureTime.toISOString()})` : (useRealTime ? '(real-time)' : '(standard)')}`);

      // --- Start: Cache Update Logic (L1 and L2) ---
      // Update L1 cache
      travelTimeCache.set(cacheKey, durationSeconds);
      cacheTimeStamps.set(cacheKey, Date.now());
      
      // Update L2 cache
      if (cacheService) {
        const isPredictive = !!departureTime;
        cacheService.setCacheEntry(
          origin, 
          destination, 
          durationSeconds, 
          distanceMeters,
          isPredictive, 
          departureTime
        ).catch(error => {
          logger.error('Error storing in Supabase cache', { error });
        });
      }
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
 * Handles batching API requests and uses both in-memory and Supabase caches.
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
  let supabaseCacheHits = 0;

  // Check L1 Cache (In-Memory)
  logger.debug('Checking in-memory cache for existing travel times...');
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
        // Not in L1 cache, needs checking in L2 or fetching
        pairsToFetch.push({ originIndex: i, destIndex: j });
      }
    }
  }
  
  // Check L2 Cache (Supabase) for pairs not in L1
  if (cacheService && pairsToFetch.length > 0) {
    logger.debug(`Checking Supabase cache for ${pairsToFetch.length} pairs...`);
    const isPredictive = !!departureTime;
    const pairsForSupabase = pairsToFetch.map(pair => ({
      origin: locationCoords[pair.originIndex],
      destination: locationCoords[pair.destIndex]
    }));
    
    try {
      const supabaseResults = await cacheService.getBulkCacheEntries(pairsForSupabase, isPredictive, departureTime);
      
      // Process Supabase results and update pairsToFetch
      const stillNeedsFetching: typeof pairsToFetch = [];
      
      for (const pair of pairsToFetch) {
        const origin = locationCoords[pair.originIndex];
        const destination = locationCoords[pair.destIndex];
        const key = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
        
        if (supabaseResults.has(key)) {
          const travelTime = supabaseResults.get(key)!;
          matrix[pair.originIndex][pair.destIndex] = travelTime;
          
          // Also update L1 cache
          const cacheKey = getCacheKey(origin, destination, useRealTime, departureTime);
          travelTimeCache.set(cacheKey, travelTime);
          cacheTimeStamps.set(cacheKey, Date.now());
          
          supabaseCacheHits++;
        } else {
          stillNeedsFetching.push(pair);
        }
      }
      
      pairsToFetch.length = 0;
      pairsToFetch.push(...stillNeedsFetching);
    } catch (error) {
      logger.error('Error checking Supabase cache in bulk', { error });
      // Continue with API calls for all pairs
    }
  }
  
  logger.debug(`Cache check complete. L1 hits: ${cacheHits}, L2 hits: ${supabaseCacheHits}, Pairs to fetch from API: ${pairsToFetch.length}`);

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

  // Collect entries for bulk Supabase storage
  const cacheEntriesToStore: Array<{
    origin: LatLngLiteral;
    destination: LatLngLiteral;
    travelTimeSeconds: number;
    distanceMeters?: number;
  }> = [];

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
            const destCoord = locationCoords[destIndex];
            const cacheKey = getCacheKey(originCoord, destCoord, useRealTime, departureTime);

                        if (element.status === 'OK') {
                          const durationSeconds = (departureTime || useRealTime) && element.duration_in_traffic
                            ? element.duration_in_traffic.value
                            : element.duration.value;
                          const distanceMeters = element.distance?.value;
                          
              matrix[originIndex][destIndex] = durationSeconds;
                          
                          // Update L1 cache
                          travelTimeCache.set(cacheKey, durationSeconds);
                          cacheTimeStamps.set(cacheKey, Date.now());
                          
                          // Collect for L2 cache batch update
                          cacheEntriesToStore.push({
                            origin: originCoord,
                            destination: destCoord,
                            travelTimeSeconds: durationSeconds,
                            distanceMeters
                          });
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

  // Bulk store to Supabase cache
  if (cacheService && cacheEntriesToStore.length > 0) {
    const isPredictive = !!departureTime;
    cacheService.setBulkCacheEntries(cacheEntriesToStore, isPredictive, departureTime).catch(error => {
      logger.error('Error bulk storing to Supabase cache', { error });
    });
  }

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