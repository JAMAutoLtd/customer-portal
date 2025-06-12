-- Migration: Add travel_time_cache table for Google Maps API results
-- Created: 2025-05-30

-- Travel Time Cache Table for Google Maps API Results
CREATE TABLE IF NOT EXISTS "public"."travel_time_cache" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "origin_lat" numeric(9,6) NOT NULL,
    "origin_lng" numeric(9,6) NOT NULL,
    "destination_lat" numeric(9,6) NOT NULL,
    "destination_lng" numeric(9,6) NOT NULL,
    "is_predictive" boolean NOT NULL DEFAULT false,
    "target_hour_utc" smallint CHECK (target_hour_utc >= 0 AND target_hour_utc <= 23),
    "target_day_of_week_utc" smallint CHECK (target_day_of_week_utc >= 0 AND target_day_of_week_utc <= 6),
    "travel_time_seconds" integer NOT NULL,
    "distance_meters" integer,
    "retrieved_at" timestamp with time zone NOT NULL DEFAULT now(),
    "expires_at" timestamp with time zone NOT NULL
);

ALTER TABLE "public"."travel_time_cache" OWNER TO "postgres";

-- Primary key
ALTER TABLE ONLY "public"."travel_time_cache"
    ADD CONSTRAINT "travel_time_cache_pkey" PRIMARY KEY ("id");

-- Unique index for cache lookups
-- Note: We handle NULL values in the unique constraint by including them in the index
CREATE UNIQUE INDEX idx_travel_cache_lookup ON travel_time_cache 
    (origin_lat, origin_lng, destination_lat, destination_lng, is_predictive, 
     COALESCE(target_hour_utc, -1), COALESCE(target_day_of_week_utc, -1));

-- Index for expiration cleanup
CREATE INDEX idx_travel_cache_expires_at ON travel_time_cache (expires_at);

-- Optional: Index for coordinate-based queries
CREATE INDEX idx_travel_cache_coords ON travel_time_cache (origin_lat, origin_lng, destination_lat, destination_lng);

-- Function to cleanup expired cache entries (can be called by a cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_travel_cache()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM travel_time_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to clean up expired entries (requires pg_cron extension)
-- If pg_cron is available, uncomment the following:
-- SELECT cron.schedule('cleanup-travel-cache', '0 * * * *', 'SELECT cleanup_expired_travel_cache();'); 