# Travel Time Caching System

## Overview

The Travel Time Caching System is a two-level caching solution designed to reduce Google Maps Distance Matrix API costs and improve performance by storing and reusing travel time calculations between locations.

## Architecture

### Two-Level Cache Design

1. **Level 1 (L1) - In-Memory Cache**
   - Fastest access time
   - Limited by process memory
   - Lost on service restart
   - Implemented using JavaScript Maps

2. **Level 2 (L2) - Supabase Persistent Cache**
   - Persists across service restarts
   - Shared across multiple service instances
   - Unlimited storage capacity
   - Slightly slower than L1 cache

### Cache Flow

```
Request → L1 Cache → L2 Cache → Google Maps API
   ↓         ↓           ↓              ↓
Response ← Update L1 ← Update L2 ← API Response
```

## Implementation Details

### Database Schema

The `travel_time_cache` table stores cached travel time data:

```sql
CREATE TABLE travel_time_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_lat numeric(9,6) NOT NULL,
    origin_lng numeric(9,6) NOT NULL,
    destination_lat numeric(9,6) NOT NULL,
    destination_lng numeric(9,6) NOT NULL,
    is_predictive boolean NOT NULL DEFAULT false,
    target_hour_utc smallint,  -- 0-23
    target_day_of_week_utc smallint,  -- 0-6 (Sunday=0)
    travel_time_seconds integer NOT NULL,
    distance_meters integer,
    retrieved_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
```

### Cache Keys

#### Real-time Traffic
- Key components: `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`
- TTL: 20 minutes
- Used for current traffic conditions

#### Predictive Traffic
- Key components: `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`, `target_hour_utc`, `target_day_of_week_utc`
- TTL: 24 hours
- Used for future planning based on typical traffic patterns

### Coordinate Precision

All coordinates are rounded to 6 decimal places (approximately 0.11 meters precision) to ensure consistent cache hits despite minor floating-point variations.

## Usage

### Configuration

The caching system requires the following environment variables:

```env
# Required for Google Maps API
GOOGLE_MAPS_API_KEY=your_api_key

# Required for Supabase cache (optional - falls back to L1 only)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### API Integration

The caching is transparent to the caller. Simply use the existing functions:

```typescript
// Single location pair
const travelTime = await getTravelTime(
  { lat: 40.7128, lng: -74.0060 },  // Origin
  { lat: 34.0522, lng: -118.2437 },  // Destination
  false,  // useRealTime
  departureTime  // Optional: for predictive traffic
);

// Multiple locations (bulk)
const travelTimeMatrix = await getBulkTravelTimes(
  locations,  // Array of OptimizationLocation
  useRealTime,
  departureTime
);
```

## Performance Benefits

### Cost Reduction

1. **API Call Reduction**: Typical reduction of 60-80% in Google Maps API calls
2. **Cost Savings**: Based on Google's pricing of $5 per 1,000 elements:
   - 100,000 daily requests without cache: $500/day
   - With 70% cache hit rate: $150/day
   - **Savings: $350/day or ~$10,500/month**

### Response Time Improvement

- L1 Cache Hit: <1ms
- L2 Cache Hit: 10-50ms
- Google Maps API: 200-1000ms

## Cache Management

### Automatic Cleanup

1. **In-Memory (L1)**: Cleaned every minute
2. **Supabase (L2)**: Cleaned hourly via scheduled job

### Manual Cleanup

Execute the cleanup function directly:

```sql
SELECT cleanup_expired_travel_cache();
```

Or schedule with pg_cron:

```sql
SELECT cron.schedule(
  'cleanup-travel-cache', 
  '0 * * * *',  -- Every hour
  'SELECT cleanup_expired_travel_cache();'
);
```

## Monitoring

### Cache Performance Metrics

Monitor these key metrics:

1. **Cache Hit Rate**
   - L1 hits vs misses
   - L2 hits vs misses
   - Overall hit rate

2. **API Cost Reduction**
   - API calls made vs cached responses
   - Cost savings calculations

3. **Cache Size**
   - Number of entries in L2 cache
   - Storage space used

### Sample Monitoring Query

```sql
-- Cache statistics
SELECT 
  COUNT(*) as total_entries,
  COUNT(CASE WHEN is_predictive THEN 1 END) as predictive_entries,
  COUNT(CASE WHEN NOT is_predictive THEN 1 END) as realtime_entries,
  AVG(travel_time_seconds) as avg_travel_time,
  MIN(retrieved_at) as oldest_entry,
  MAX(retrieved_at) as newest_entry
FROM travel_time_cache
WHERE expires_at > NOW();
```

## Best Practices

1. **Coordinate Consistency**: Always use consistent coordinate precision
2. **TTL Tuning**: Adjust TTLs based on your traffic patterns
3. **Error Handling**: Cache failures should gracefully fall back to API calls
4. **Monitoring**: Track cache performance to optimize configuration
5. **Bulk Operations**: Use bulk functions when fetching multiple routes

## Troubleshooting

### Common Issues

1. **Low Cache Hit Rate**
   - Check coordinate precision consistency
   - Verify TTL settings are appropriate
   - Ensure Supabase connection is stable

2. **Cache Not Working**
   - Verify environment variables are set
   - Check Supabase table exists and has proper indexes
   - Monitor logs for connection errors

3. **Performance Issues**
   - Check index usage with `EXPLAIN ANALYZE`
   - Monitor Supabase connection pool
   - Consider increasing in-memory cache size

### Debug Logging

Enable debug logging to troubleshoot cache behavior:

```typescript
// In your logger configuration
logger.level = 'debug';
```

## Future Enhancements

1. **Redis Integration**: Add Redis as an intermediate cache layer
2. **Smart Prefetching**: Predictively cache common routes
3. **Cache Warming**: Pre-populate cache during off-peak hours
4. **Analytics Dashboard**: Real-time cache performance visualization
5. **Multi-Region Support**: Cache replication across regions 