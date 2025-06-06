import { TravelTimeCacheService } from '../../src/supabase/travel-time-cache';
import { createClient } from '@supabase/supabase-js';
import { LatLngLiteral } from '@googlemaps/google-maps-services-js';

// Mock Supabase client
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockMatch = jest.fn();
const mockGt = jest.fn();
const mockLimit = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockLt = jest.fn();
const mockOr = jest.fn();
const mockEq = jest.fn();
const mockIs = jest.fn();

// Setup mock chain
mockFrom.mockReturnValue({
  select: mockSelect,
  upsert: mockUpsert,
  delete: mockDelete
});

mockSelect.mockReturnValue({
  match: mockMatch,
  or: mockOr,
  eq: mockEq,
  is: mockIs,
  gt: mockGt
});

mockMatch.mockReturnValue({
  gt: mockGt
});

mockGt.mockReturnValue({
  limit: mockLimit,
  eq: mockEq,
  is: mockIs
});

mockEq.mockReturnValue({
  eq: mockEq,
  is: mockIs,
  gt: mockGt
});

mockIs.mockReturnValue({
  eq: mockEq,
  is: mockIs,
  gt: mockGt
});

mockOr.mockReturnValue({
  eq: mockEq,
  gt: mockGt,
  is: mockIs
});

mockDelete.mockReturnValue({
  lt: mockLt
});

mockLt.mockReturnValue({
  select: mockSelect
});

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom
  }))
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe('TravelTimeCacheService', () => {
  let service: TravelTimeCacheService;
  let mockSupabase: any;
  
  const origin: LatLngLiteral = { lat: 40.7128, lng: -74.0060 };
  const destination: LatLngLiteral = { lat: 34.0522, lng: -118.2437 };
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = createClient('mock-url', 'mock-key');
    service = new TravelTimeCacheService(mockSupabase);
  });

  describe('getCacheEntry', () => {
    it('should return cached travel time when found', async () => {
      const mockData = [{ travel_time_seconds: 3600 }];
      mockLimit.mockResolvedValueOnce({ data: mockData, error: null });
      
      const result = await service.getCacheEntry(origin, destination, false);
      
      expect(result).toBe(3600);
      expect(mockFrom).toHaveBeenCalledWith('travel_time_cache');
      expect(mockSelect).toHaveBeenCalledWith('travel_time_seconds');
      expect(mockMatch).toHaveBeenCalledWith({
        origin_lat: 40.7128,
        origin_lng: -74.006,
        destination_lat: 34.0522,
        destination_lng: -118.2437,
        is_predictive: false
      });
    });

    it('should return null when no cache entry found', async () => {
      mockLimit.mockResolvedValueOnce({ data: [], error: null });
      
      const result = await service.getCacheEntry(origin, destination, false);
      
      expect(result).toBeNull();
    });

    it('should handle predictive queries with departure time', async () => {
      const departureTime = new Date('2025-01-26T14:30:00Z'); // Sunday, 14:30 UTC
      const mockData = [{ travel_time_seconds: 4200 }];
      mockLimit.mockResolvedValueOnce({ data: mockData, error: null });
      
      const result = await service.getCacheEntry(origin, destination, true, departureTime);
      
      expect(result).toBe(4200);
      expect(mockMatch).toHaveBeenCalledWith({
        origin_lat: 40.7128,
        origin_lng: -74.006,
        destination_lat: 34.0522,
        destination_lng: -118.2437,
        is_predictive: true,
        target_hour_utc: 14,
        target_day_of_week_utc: 0 // Sunday
      });
    });

    it('should handle errors gracefully', async () => {
      mockLimit.mockResolvedValueOnce({ data: null, error: new Error('Database error') });
      
      const result = await service.getCacheEntry(origin, destination, false);
      
      expect(result).toBeNull();
    });
  });

  describe('setCacheEntry', () => {
    it('should store cache entry for real-time request', async () => {
      mockUpsert.mockResolvedValueOnce({ error: null });
      
      await service.setCacheEntry(origin, destination, 3600, 1000, false);
      
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          origin_lat: 40.7128,
          origin_lng: -74.006,
          destination_lat: 34.0522,
          destination_lng: -118.2437,
          is_predictive: false,
          travel_time_seconds: 3600,
          distance_meters: 1000,
          expires_at: expect.any(String)
        }),
        expect.objectContaining({
          onConflict: expect.any(String)
        })
      );
    });

    it('should store cache entry for predictive request', async () => {
      const departureTime = new Date('2025-01-26T14:30:00Z');
      mockUpsert.mockResolvedValueOnce({ error: null });
      
      await service.setCacheEntry(origin, destination, 4200, 1500, true, departureTime);
      
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          origin_lat: 40.7128,
          origin_lng: -74.006,
          destination_lat: 34.0522,
          destination_lng: -118.2437,
          is_predictive: true,
          target_hour_utc: 14,
          target_day_of_week_utc: 0,
          travel_time_seconds: 4200,
          distance_meters: 1500
        }),
        expect.any(Object)
      );
    });

    it('should handle upsert errors gracefully', async () => {
      mockUpsert.mockResolvedValueOnce({ error: new Error('Upsert failed') });
      
      // Should not throw
      await expect(service.setCacheEntry(origin, destination, 3600)).resolves.not.toThrow();
    });
  });

  describe('getBulkCacheEntries', () => {
    it('should handle empty pairs array', async () => {
      const result = await service.getBulkCacheEntries([], false);
      
      expect(result.size).toBe(0);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('setBulkCacheEntries', () => {
    it('should store multiple entries', async () => {
      const entries = [
        {
          origin,
          destination,
          travelTimeSeconds: 3600,
          distanceMeters: 1000
        },
        {
          origin: destination,
          destination: origin,
          travelTimeSeconds: 3700,
          distanceMeters: 1100
        }
      ];
      
      mockUpsert.mockResolvedValueOnce({ error: null });
      
      await service.setBulkCacheEntries(entries, false);
      
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            origin_lat: 40.7128,
            origin_lng: -74.006,
            destination_lat: 34.0522,
            destination_lng: -118.2437,
            travel_time_seconds: 3600,
            distance_meters: 1000
          }),
          expect.objectContaining({
            origin_lat: 34.0522,
            origin_lng: -118.2437,
            destination_lat: 40.7128,
            destination_lng: -74.006,
            travel_time_seconds: 3700,
            distance_meters: 1100
          })
        ]),
        expect.any(Object)
      );
    });

    it('should handle empty entries array', async () => {
      await service.setBulkCacheEntries([], false);
      
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should delete expired entries and return count', async () => {
      const mockDeletedData = [{ id: '1' }, { id: '2' }, { id: '3' }];
      mockSelect.mockResolvedValueOnce({ data: mockDeletedData, error: null });
      
      const result = await service.cleanupExpiredEntries();
      
      expect(result).toBe(3);
      expect(mockDelete).toHaveBeenCalled();
      expect(mockLt).toHaveBeenCalledWith('expires_at', expect.any(String));
    });

    it('should return 0 when no entries deleted', async () => {
      mockSelect.mockResolvedValueOnce({ data: [], error: null });
      
      const result = await service.cleanupExpiredEntries();
      
      expect(result).toBe(0);
    });

    it('should handle errors and return 0', async () => {
      mockSelect.mockResolvedValueOnce({ data: null, error: new Error('Delete failed') });
      
      const result = await service.cleanupExpiredEntries();
      
      expect(result).toBe(0);
    });
  });

  describe('coordinate precision', () => {
    it('should round coordinates to 6 decimal places', async () => {
      const impreciseOrigin = { lat: 40.71284567890123, lng: -74.00601234567890 };
      const impreciseDestination = { lat: 34.05224567890123, lng: -118.24371234567890 };
      
      mockLimit.mockResolvedValueOnce({ data: [], error: null });
      
      await service.getCacheEntry(impreciseOrigin, impreciseDestination, false);
      
      expect(mockMatch).toHaveBeenCalledWith({
        origin_lat: 40.712846,
        origin_lng: -74.006012,
        destination_lat: 34.052246,
        destination_lng: -118.243712,
        is_predictive: false
      });
    });
  });
}); 