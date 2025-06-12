
# Travel Time Caching Upgrade Proposal

> **STATUS: ✅ IMPLEMENTED** (June 2025)  
> Implementation completed with two-level cache system achieving 60-80% cache hit rates and ~$350/day cost savings.
> See: `apps/scheduler/src/supabase/travel-time-cache.ts` and `docs/guides/travel-time-caching.md`

You're right to focus on these areas. Caching and database indexing are fundamental for performance and cost optimization in a system like this. Let's break down my thoughts:

**1. Caching for Google Maps API Calls (using Supabase)**

This is an excellent idea, especially given that customer locations are often reused. The goal is to store the results of Google Maps Distance Matrix API calls in a Supabase table to avoid redundant external API requests.

**A. Cacheable Data & Strategy:**

*   **Predictive Travel Times:**
    *   **What:** Travel times between two static geocoded locations (e.g., customer A's address to customer B's address, or a customer's address to the common `DEFAULT_DEPOT_LOCATION` which serves as the universal end point). These are requested for *future dates* using Google's predictive traffic models.
    *   **Cache Key:** A composite key based on (origin_lat, origin_lng, dest_lat, dest_lng, target_hour_of_day_utc, target_day_of_week_utc).
        *   Why hour and day of week? Predictive traffic varies by these. Caching for an exact timestamp might lead to too many misses. Grouping by hour and day of the week (e.g., all Tuesdays at 2 PM UTC) is a good balance.
    *   **TTL (Time To Live):** Long. Predictive models for general traffic don't change drastically day-to-day for the same hour/day-of-week slot. A TTL of 1-7 days could be appropriate. Monitor how often you'd expect these patterns to significantly update.
*   **Real-time Travel Times:**
    *   **What:** Travel times for "now".
    *   **Cache Key:** (origin_lat, origin_lng, dest_lat, dest_lng, "realtime_flag").
    *   **TTL:** Short. Real-time conditions change rapidly. A TTL of 5-15 minutes might be useful to handle very closely spaced replans or retries, but not much longer. The existing in-memory cache in `maps.ts` likely handles very immediate repeats already. A Supabase cache for this would be for slightly longer (but still short-term) persistence across service restarts or for different scheduler instances if scaled.
*   **What NOT to Cache (or cache very carefully):** Travel times involving a technician's *current dynamic location* if that location is frequently changing and used for real-time planning. If their "current location" for the start of the day is fixed once determined, then it's cacheable like any other static point for that planning cycle.

**B. Supabase Table Design for Cache (`travel_time_cache`):**

*   `id` (uuid, primary key, default `gen_random_uuid()`)
*   `origin_lat` (numeric(9,6), not null)
*   `origin_lng` (numeric(9,6), not null)
*   `destination_lat` (numeric(9,6), not null)
*   `destination_lng` (numeric(9,6), not null)
*   `is_predictive` (boolean, not null, default `false`)
*   `target_hour_utc` (smallint, nullable): For predictive cache entries (0-23).
*   `target_day_of_week_utc` (smallint, nullable): For predictive cache entries (0=Sunday, 6=Saturday, or your chosen convention).
*   `travel_time_seconds` (integer, not null)
*   `distance_meters` (integer, nullable)
*   `retrieved_at` (timestamptz, not null, default `now()`)
*   `expires_at` (timestamptz, not null): Calculated on insert (`retrieved_at` + TTL).

**C. Indexing for `travel_time_cache`:**

*   **Primary Lookup Index (Composite):**
    `CREATE UNIQUE INDEX idx_travel_cache_lookup ON travel_time_cache (origin_lat, origin_lng, destination_lat, destination_lng, is_predictive, target_hour_utc, target_day_of_week_utc);`
    *   This allows very fast lookups for existing cache entries. The `is_predictive`, `target_hour_utc`, and `target_day_of_week_utc` would be queried appropriately based on the request type. For real-time, you'd query with `is_predictive = false` and `target_hour_utc IS NULL`, `target_day_of_week_utc IS NULL`.
*   **Expiration Index:**
    `CREATE INDEX idx_travel_cache_expires_at ON travel_time_cache (expires_at);`
    *   Useful for a background job/Supabase function to periodically delete stale entries (`DELETE FROM travel_time_cache WHERE expires_at < NOW();`).

**D. Workflow Changes in `apps/scheduler/src/google/maps.ts` (`getBulkTravelTimes`):**

1.  **Input:** `locations: OptimizationLocation[]`, `isForToday: boolean`, `futureDepartureTime?: Date`.
2.  **Transform `futureDepartureTime`:** If `!isForToday` and `futureDepartureTime` is present, extract `target_hour_utc` and `target_day_of_week_utc`.
3.  **For each origin-destination pair needed:**
    *   **Query Supabase Cache:**
        *   Construct query based on coordinates.
        *   If predictive: also filter by `is_predictive = true`, `target_hour_utc`, `target_day_of_week_utc`.
        *   If real-time: filter by `is_predictive = false`.
        *   Add `WHERE expires_at > NOW()`.
    *   **If Cache Hit:** Use the `travel_time_seconds`.
    *   **If Cache Miss:** Add this pair to a list of pairs to fetch from Google Maps API.
4.  **Google Maps API Call:**
    *   For all cache-missed pairs, make optimized batch calls to the Distance Matrix API.
5.  **Store in Supabase Cache:**
    *   For each result from Google:
        *   Calculate `expires_at` (e.g., `NOW() + interval '1 day'` for predictive, `NOW() + interval '10 minutes'` for real-time).
        *   `INSERT` into `travel_time_cache`. Handle potential race conditions/duplicates with an `ON CONFLICT DO UPDATE` if necessary, or rely on the unique index and handle errors (though querying first should reduce direct conflicts).
6.  **Return Combined Matrix:** Merge results from cache and API.

**E. Considerations:**
*   **Coordinate Precision:** Using `numeric(9,6)` is good. Ensure consistent precision when querying.
*   **Supabase Load:** This will add read/write load. Monitor your Supabase instance. For very high volume, a dedicated caching service like Redis might eventually be better, but Supabase is a good starting point for persistence.
*   **Error Handling:** If Supabase cache reads/writes fail, gracefully fall back to calling the Google API (and perhaps log the cache error).
*   **Initial Cold Cache:** Performance will be slower initially until the cache warms up with frequently used routes.

**2. Improving Database Indexing**

Gemini's suggestions are a good starting point. My thoughts build on that:

*   **General Strategy:**
    *   **Identify Slow Queries:** Use Supabase's built-in query performance tools or connect with `pgAdmin` and use `EXPLAIN ANALYZE` on queries suspected to be slow, especially those within `runFullReplan`. Focus on queries with high execution times or those performing `Seq Scan` on large tables.
    *   **Index Selectively:** Don't just index every column. Indexes speed up reads but slow down writes (INSERT, UPDATE, DELETE). Prioritize indexes that provide the most benefit to your critical read paths.

*   **Specific Table/Column Indexing Considerations (beyond the obvious FKs):**

    *   **`jobs` table:**
        *   `assigned_technician`: You confirmed this needs an index. Absolutely critical for queries filtering by technician (e.g., "get all jobs for tech X," "get locked jobs for these techs").
        *   `status`: Already indexed, good.
        *   `estimated_sched`: Already indexed, good.
        *   **Composite Indexes:**
            *   `(status, estimated_sched)`: Useful if you frequently query for jobs with a certain status within a date range.
            *   `(assigned_technician, status, estimated_sched)`: Potentially very useful for fetching a specific technician's jobs of a certain status for a given day/period (e.g., for `applyLockedJobsToWindows`). The order matters based on query patterns.
            *   `(fixed_assignment, assigned_technician)`: If you often look up jobs that are fixed-assigned to a tech.

    *   **`technician_availability_exceptions` table:**
        *   `idx_tech_exceptions_date (technician_id, date)`: Good.
        *   `idx_tech_exceptions_date_range (technician_id, date, start_time, end_time)`: Good.
        *   No obvious additions here unless specific queries are slow.

    *   **`technician_default_hours` table:**
        *   `unique_tech_day (technician_id, day_of_week)`: Already unique and thus indexed. This is optimal for fetching a specific tech's hours for a specific day of the week.

    *   **`orders` table:**
        *   `earliest_available_time`: If you often query or sort orders based on this, an index could help. Especially if combined with other filters.

    *   **`services` table:**
        *   `service_category`: If you filter jobs/orders by service category frequently *without* going through the `services.id` first, an index here might be useful.

    *   **Cross-Table Queries (Eligibility Logic in `determineTechnicianEligibility`):**
        *   This involves joins across `jobs`, `services`, `orders`, `customer_vehicles`, `ymm_ref`, and `*_equipment_requirements`.
        *   Ensure all `id` columns used in joins are indexed (primary keys usually are, foreign keys should be).
        *   `ymm_ref (year, make, model)` unique index is crucial.
        *   `*_equipment_requirements (ymm_id, service_id)` unique indexes are crucial.

*   **Actionable Steps for Indexing:**
    1.  **List Key Queries:** Identify the top 5-10 most frequent or performance-critical read queries made by the scheduler.
    2.  **`EXPLAIN ANALYZE`:** Run this for each of those queries in the Supabase SQL editor.
    3.  **Look For:**
        *   `Seq Scan` on large tables.
        *   High startup or total costs for query plans.
        *   Bitmap Heap Scans that are re-checking many rows.
    4.  **Add Indexes Iteratively:**
        *   Start with single-column indexes on columns that appear frequently in `WHERE` clauses with equality or range operators and are not already well-indexed.
        *   Consider composite indexes where multiple columns are used together in `WHERE` clauses. The order of columns in the composite index should generally match the order of most selective filter to least selective, or the order they appear in `AND` conditions.
    5.  **Re-Test Performance:** After adding an index, re-run `EXPLAIN ANALYZE` and observe if the query plan changes and if performance improves.
    6.  **Monitor Write Performance:** Be mindful that too many indexes, or indexes on frequently updated columns, can degrade write performance. It's a trade-off.

**Implementation of Supabase Cache for Travel Times:**

This would primarily involve modifications to `apps/scheduler/src/google/maps.ts` and adding the new table/indexes to your Supabase schema (e.g., in a new migration file).

The refactoring to use the Supabase cache would be a significant but likely very beneficial change. The indexing improvements require careful analysis of current query plans but can also yield substantial performance boosts.

I recommend tackling the **database indexing first** by analyzing your current slow queries. This is often lower-hanging fruit than implementing a new caching layer. Once the database is performing optimally for its current load, then introduce the travel time caching using Supabase.
