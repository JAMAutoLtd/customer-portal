import { SupabaseClient } from '@supabase/supabase-js';
import { LatLngLiteral } from '@googlemaps/google-maps-services-js';
import { logger } from '../utils/logger';
import { TravelTimeCache } from '../types/database.types';

// Cache configuration
const REALTIME_TTL_HOURS = 0.33; // 20 minutes
const PREDICTIVE_TTL_HOURS = 24; // 24 hours
const COORDINATE_PRECISION = 6; // Decimal places for lat/lng

/**
 * Service for managing travel time cache in Supabase
 */
export class TravelTimeCacheService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Rounds coordinates to consistent precision to avoid cache misses due to floating point differences
   */
  private roundCoordinate(coord: number): number {
    return Math.round(coord * Math.pow(10, COORDINATE_PRECISION)) / Math.pow(10, COORDINATE_PRECISION);
  }

  /**
   * Builds cache lookup parameters for a given origin-destination pair
   */
  private buildCacheParams(
    origin: LatLngLiteral,
    destination: LatLngLiteral,
    isPredictive: boolean,
    departureTime?: Date
  ) {
    const params: any = {
      origin_lat: this.roundCoordinate(origin.lat),
      origin_lng: this.roundCoordinate(origin.lng),
      destination_lat: this.roundCoordinate(destination.lat),
      destination_lng: this.roundCoordinate(destination.lng),
      is_predictive: isPredictive
    };

    if (isPredictive && departureTime) {
      params.target_hour_utc = departureTime.getUTCHours();
      params.target_day_of_week_utc = departureTime.getUTCDay();
    }

    return params;
  }

  /**
   * Fetches a single cache entry
   */
  async getCacheEntry(
    origin: LatLngLiteral,
    destination: LatLngLiteral,
    isPredictive: boolean,
    departureTime?: Date
  ): Promise<number | null> {
    try {
      const params = this.buildCacheParams(origin, destination, isPredictive, departureTime);
      
      let query = this.supabase
        .from('travel_time_cache')
        .select('travel_time_seconds')
        .match(params)
        .gt('expires_at', new Date().toISOString())
        .limit(1);

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching from travel time cache', { error, params });
        return null;
      }

      if (data && data.length > 0) {
        logger.debug('Cache hit for travel time', { 
          origin, 
          destination, 
          isPredictive, 
          travelTime: data[0].travel_time_seconds 
        });
        return data[0].travel_time_seconds;
      }

      return null;
    } catch (error) {
      logger.error('Exception in getCacheEntry', { error });
      return null;
    }
  }

  /**
   * Fetches multiple cache entries in bulk using chunked queries to avoid PostgREST limits
   */
  async getBulkCacheEntries(
    pairs: Array<{ origin: LatLngLiteral; destination: LatLngLiteral }>,
    isPredictive: boolean,
    departureTime?: Date
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    
    if (pairs.length === 0) return results;

    try {
      // Get unique coordinate values to build a simple filter
      const uniqueCoords = new Set<number>();
      pairs.forEach(pair => {
        const params = this.buildCacheParams(pair.origin, pair.destination, isPredictive, departureTime);
        uniqueCoords.add(params.origin_lat);
        uniqueCoords.add(params.origin_lng);
        uniqueCoords.add(params.destination_lat);
        uniqueCoords.add(params.destination_lng);
      });

      const coordArray = Array.from(uniqueCoords);
      
      // Use simple in() queries instead of complex OR
      let query = this.supabase
        .from('travel_time_cache')
        .select('origin_lat, origin_lng, destination_lat, destination_lng, travel_time_seconds')
        .in('origin_lat', coordArray)
        .in('origin_lng', coordArray)
        .in('destination_lat', coordArray)
        .in('destination_lng', coordArray)
        .eq('is_predictive', isPredictive)
        .gt('expires_at', new Date().toISOString());

      if (isPredictive && departureTime) {
        query = query
          .eq('target_hour_utc', departureTime.getUTCHours())
          .eq('target_day_of_week_utc', departureTime.getUTCDay());
      } else if (!isPredictive) {
        query = query
          .is('target_hour_utc', null)
          .is('target_day_of_week_utc', null);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching bulk cache entries', { error });
        return results;
      }

      if (data) {
        // Filter results to only include exact matches
        const requestedPairs = new Set(
          pairs.map(pair => {
            const params = this.buildCacheParams(pair.origin, pair.destination, isPredictive, departureTime);
            return `${params.origin_lat},${params.origin_lng}:${params.destination_lat},${params.destination_lng}`;
          })
        );

        data.forEach(entry => {
          const entryKey = `${entry.origin_lat},${entry.origin_lng}:${entry.destination_lat},${entry.destination_lng}`;
          if (requestedPairs.has(entryKey)) {
            const key = this.getCacheKey(
              { lat: entry.origin_lat, lng: entry.origin_lng },
              { lat: entry.destination_lat, lng: entry.destination_lng }
            );
            results.set(key, entry.travel_time_seconds);
          }
        });
      }

      logger.debug(`Bulk cache lookup: ${results.size} hits out of ${pairs.length} requests using coordinate filtering`);
      return results;
    } catch (error) {
      logger.error('Exception in getBulkCacheEntries', { error });
      return results;
    }
  }

  /**
   * Stores a single cache entry
   */
  async setCacheEntry(
    origin: LatLngLiteral,
    destination: LatLngLiteral,
    travelTimeSeconds: number,
    distanceMeters?: number,
    isPredictive: boolean = false,
    departureTime?: Date
  ): Promise<void> {
    try {
      const ttlHours = isPredictive ? PREDICTIVE_TTL_HOURS : REALTIME_TTL_HOURS;
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ttlHours);

      const cacheEntry: Partial<TravelTimeCache> = {
        origin_lat: this.roundCoordinate(origin.lat),
        origin_lng: this.roundCoordinate(origin.lng),
        destination_lat: this.roundCoordinate(destination.lat),
        destination_lng: this.roundCoordinate(destination.lng),
        is_predictive: isPredictive,
        travel_time_seconds: travelTimeSeconds,
        distance_meters: distanceMeters || null,
        expires_at: expiresAt.toISOString()
      };

      if (isPredictive && departureTime) {
        cacheEntry.target_hour_utc = departureTime.getUTCHours();
        cacheEntry.target_day_of_week_utc = departureTime.getUTCDay();
      } else {
        // Explicitly set NULL values for non-predictive queries
        cacheEntry.target_hour_utc = null;
        cacheEntry.target_day_of_week_utc = null;
      }

      const { error } = await this.supabase
        .from('travel_time_cache')
        .upsert(cacheEntry);

      if (error) {
        logger.error('Error storing cache entry', { error, cacheEntry });
      } else {
        logger.debug('Successfully cached travel time', { 
          origin, 
          destination, 
          travelTimeSeconds,
          isPredictive,
          expiresAt 
        });
      }
    } catch (error) {
      logger.error('Exception in setCacheEntry', { error });
    }
  }

  /**
   * Stores multiple cache entries in bulk
   */
  async setBulkCacheEntries(
    entries: Array<{
      origin: LatLngLiteral;
      destination: LatLngLiteral;
      travelTimeSeconds: number;
      distanceMeters?: number;
    }>,
    isPredictive: boolean = false,
    departureTime?: Date
  ): Promise<void> {
    if (entries.length === 0) return;

    try {
      const ttlHours = isPredictive ? PREDICTIVE_TTL_HOURS : REALTIME_TTL_HOURS;
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ttlHours);

      const cacheEntries = entries.map(entry => {
        const cacheEntry: Partial<TravelTimeCache> = {
          origin_lat: this.roundCoordinate(entry.origin.lat),
          origin_lng: this.roundCoordinate(entry.origin.lng),
          destination_lat: this.roundCoordinate(entry.destination.lat),
          destination_lng: this.roundCoordinate(entry.destination.lng),
          is_predictive: isPredictive,
          travel_time_seconds: entry.travelTimeSeconds,
          distance_meters: entry.distanceMeters || null,
          expires_at: expiresAt.toISOString()
        };

        if (isPredictive && departureTime) {
          cacheEntry.target_hour_utc = departureTime.getUTCHours();
          cacheEntry.target_day_of_week_utc = departureTime.getUTCDay();
        } else {
          // Explicitly set NULL values for non-predictive queries
          cacheEntry.target_hour_utc = null;
          cacheEntry.target_day_of_week_utc = null;
        }

        return cacheEntry;
      });

      const { error } = await this.supabase
        .from('travel_time_cache')
        .upsert(cacheEntries);

      if (error) {
        logger.error('Error storing bulk cache entries', { error, count: entries.length });
      } else {
        logger.debug(`Successfully cached ${entries.length} travel times in bulk`);
      }
    } catch (error) {
      logger.error('Exception in setBulkCacheEntries', { error });
    }
  }

  /**
   * Generates a consistent cache key for a coordinate pair
   */
  private getCacheKey(origin: LatLngLiteral, destination: LatLngLiteral): string {
    return `${this.roundCoordinate(origin.lat)},${this.roundCoordinate(origin.lng)}:${this.roundCoordinate(destination.lat)},${this.roundCoordinate(destination.lng)}`;
  }

  /**
   * Cleans up expired cache entries
   */
  async cleanupExpiredEntries(): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('travel_time_cache')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('id');

      if (error) {
        logger.error('Error cleaning up expired cache entries', { error });
        return 0;
      }

      const deletedCount = data?.length || 0;
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired travel time cache entries`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Exception in cleanupExpiredEntries', { error });
      return 0;
    }
  }
} 