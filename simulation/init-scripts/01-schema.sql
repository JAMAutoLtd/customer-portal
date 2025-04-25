SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS "public";
CREATE SCHEMA IF NOT EXISTS "auth"; -- Add auth schema needed for FKs
CREATE SCHEMA IF NOT EXISTS "extensions"; -- Add extensions schema if needed

-- Add required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE TYPE "public"."availability_exception_type" AS ENUM (
    'time_off',
    'custom_hours'
);


ALTER TYPE "public"."availability_exception_type" OWNER TO "postgres";


CREATE TYPE "public"."customer_type" AS ENUM (
    'residential',
    'commercial',
    'insurance'
);


ALTER TYPE "public"."customer_type" OWNER TO "postgres";


CREATE TYPE "public"."job_status" AS ENUM (
    'pending_review',
    'queued',
    'en_route',
    'pending_revisit',
    'fixed_time',
    'completed',
    'cancelled',
    'paid',
    'in_progress'
);


ALTER TYPE "public"."job_status" OWNER TO "postgres";


CREATE TYPE "public"."service_category" AS ENUM (
    'adas',
    'airbag',
    'immo',
    'prog',
    'diag'
);


ALTER TYPE "public"."service_category" OWNER TO "postgres";

-- Create auth.users table if it doesn't exist (needed for FK)
-- Ensure this runs before tables referencing it (like public.users)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
  -- Add other columns as needed for your simulation
);


CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("user_email" "text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT id FROM auth.users WHERE email = user_email LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ymm_ref" (
    "ymm_id" integer NOT NULL,
    "year" smallint NOT NULL,
    "make" character varying(50) NOT NULL,
    "model" character varying(100) NOT NULL
);


ALTER TABLE "public"."ymm_ref" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."adas_ymm_ref_ymm_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."adas_ymm_ref_ymm_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."adas_ymm_ref_ymm_id_seq" OWNED BY "public"."ymm_ref"."ymm_id";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" integer NOT NULL,
    "service_name" character varying(100) NOT NULL,
    "slug" "text",
    "service_category" "public"."service_category"
);


ALTER TABLE "public"."services" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."services_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."services_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."services_id_seq" OWNED BY "public"."services"."id";


CREATE TABLE IF NOT EXISTS "public"."adas_equipment_requirements" (
    "id" integer NOT NULL,
    "ymm_id" integer NOT NULL,
    "service_id" integer NOT NULL,
    "equipment_model" character varying(100) NOT NULL,
    "has_adas_service" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."adas_equipment_requirements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."adas_equipment_data_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."adas_equipment_data_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."adas_equipment_data_id_seq" OWNED BY "public"."adas_equipment_requirements"."id";




CREATE TABLE IF NOT EXISTS "public"."addresses" (
    "id" integer NOT NULL,
    "street_address" character varying(255) NOT NULL,
    "lat" numeric(9,6),
    "lng" numeric(9,6)
);


ALTER TABLE "public"."addresses" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."addresses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."addresses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."addresses_id_seq" OWNED BY "public"."addresses"."id";



CREATE TABLE IF NOT EXISTS "public"."airbag_equipment_requirements" (
    "id" integer NOT NULL, -- Set DEFAULT below
    "ymm_id" integer NOT NULL,
    "service_id" integer NOT NULL,
    "equipment_model" "text" DEFAULT 'airbag'::"text" NOT NULL
);


ALTER TABLE "public"."airbag_equipment_requirements" OWNER TO "postgres";

-- Sequence for airbag (separate from adas one)
-- CREATE SEQUENCE IF NOT EXISTS "public"."airbag_equipment_requirements_id_seq"
--     AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
-- ALTER SEQUENCE "public"."airbag_equipment_requirements_id_seq" OWNED BY "public"."airbag_equipment_requirements"."id";


COMMENT ON TABLE "public"."airbag_equipment_requirements" IS 'This is a duplicate of immo_equipment_requirements'; -- Copied comment from backup



CREATE TABLE IF NOT EXISTS "public"."customer_vehicles" (
    "id" integer NOT NULL,
    "vin" character varying(17) UNIQUE, -- Added UNIQUE constraint back
    "make" character varying(100) NOT NULL,
    "year" smallint,
    "model" character varying(100) -- Changed back from NOT NULL based on backup
);


ALTER TABLE "public"."customer_vehicles" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."vehicles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."vehicles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vehicles_id_seq" OWNED BY "public"."customer_vehicles"."id";


CREATE TABLE IF NOT EXISTS "public"."diag_equipment_requirements" (
    "id" integer NOT NULL,
    "ymm_id" integer NOT NULL,
    "service_id" integer NOT NULL,
    "equipment_model" "text" DEFAULT 'diag'::"text" NOT NULL
);


ALTER TABLE "public"."diag_equipment_requirements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."diag_equipment_requirements_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."diag_equipment_requirements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."diag_equipment_requirements_id_seq" OWNED BY "public"."diag_equipment_requirements"."id";


CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" integer NOT NULL,
    "model" "text",
    "equipment_type" "public"."service_category"
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."equipment_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."equipment_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."equipment_id_seq" OWNED BY "public"."equipment"."id";



CREATE TABLE IF NOT EXISTS "public"."vans" (
    "id" integer NOT NULL,
    "last_service" timestamp with time zone,
    "next_service" timestamp with time zone,
    "vin" character varying, -- Changed back based on backup
    "lat" numeric, -- Changed back based on backup
    "lng" numeric -- Changed back based on backup
);


ALTER TABLE "public"."vans" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fleet_vehicles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."fleet_vehicles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fleet_vehicles_id_seq" OWNED BY "public"."vans"."id";



CREATE TABLE IF NOT EXISTS "public"."immo_equipment_requirements" (
    "id" integer NOT NULL, -- Set DEFAULT below
    "ymm_id" integer NOT NULL,
    "service_id" integer NOT NULL,
    "equipment_model" "text" DEFAULT 'immo'::"text" NOT NULL
);


ALTER TABLE "public"."immo_equipment_requirements" OWNER TO "postgres";

-- Use adas sequence as per backup schema
-- Sequence for immo
-- CREATE SEQUENCE IF NOT EXISTS "public"."immo_equipment_requirements_id_seq"
--     AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
-- ALTER SEQUENCE "public"."immo_equipment_requirements_id_seq" OWNED BY "public"."immo_equipment_requirements"."id";

COMMENT ON TABLE "public"."immo_equipment_requirements" IS 'This is a duplicate of adas_equipment_requirements'; -- Copied comment from backup


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL, -- References auth.users
    "full_name" character varying(100) NOT NULL,
    "phone" character varying(100),
    "home_address_id" integer, -- FK added later
    "is_admin" boolean DEFAULT false,
    "customer_type" "public"."customer_type" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."technicians" (
    "id" integer NOT NULL,
    "user_id" "uuid", -- FK to users
    "assigned_van_id" integer, -- FK to vans
    "workload" integer,
    CONSTRAINT "technicians_workload_check" CHECK (("workload" >= 0))
);


ALTER TABLE "public"."technicians" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."technicians_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."technicians_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."technicians_id_seq" OWNED BY "public"."technicians"."id";



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" integer NOT NULL,
    "user_id" "uuid", -- FK to users
    "vehicle_id" integer, -- FK to customer_vehicles
    "repair_order_number" character varying(50),
    "address_id" integer, -- FK to addresses
    "earliest_available_time" timestamp with time zone,
    "notes" "text",
    "invoice" integer
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."orders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."orders_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."orders_id_seq" OWNED BY "public"."orders"."id";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" integer NOT NULL,
    "order_id" integer, -- FK to orders
    "assigned_technician" integer, -- FK to technicians
    "address_id" integer, -- FK to addresses
    "priority" integer,
    "status" "public"."job_status",
    "requested_time" timestamp with time zone,
    "estimated_sched" timestamp with time zone,
    "job_duration" integer,
    "notes" "text",
    "service_id" integer, -- FK to services
    "fixed_assignment" boolean DEFAULT false NOT NULL,
    "fixed_schedule_time" timestamp with time zone,
    "technician_notes" "text",
    CONSTRAINT "jobs_job_duration_check" CHECK (("job_duration" > 0)),
    CONSTRAINT "jobs_priority_check" CHECK (("priority" >= 0))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."jobs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."jobs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."jobs_id_seq" OWNED BY "public"."jobs"."id";



CREATE TABLE IF NOT EXISTS "public"."keys" (
    "sku_id" character varying(50) NOT NULL,
    "quantity" integer NOT NULL,
    "min_quantity" integer NOT NULL,
    "part_number" character varying(50),
    "purchase_price" numeric(10,2),
    "sale_price" numeric(10,2),
    "supplier" character varying(100),
    "fcc_id" character varying(50),
    CONSTRAINT "keys_min_quantity_check" CHECK (("min_quantity" >= 0)),
    CONSTRAINT "keys_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_services" (
    "order_id" integer NOT NULL, -- FK to orders
    "service_id" integer NOT NULL -- FK to services
);


ALTER TABLE "public"."order_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_uploads" (
    "id" integer NOT NULL,
    "order_id" integer, -- FK to orders
    "file_name" character varying(255) NOT NULL,
    "file_type" character varying(100),
    "file_url" "text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "public"."order_uploads" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."order_uploads_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."order_uploads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."order_uploads_id_seq" OWNED BY "public"."order_uploads"."id";



CREATE TABLE IF NOT EXISTS "public"."prog_equipment_requirements" (
    "id" integer NOT NULL,
    "ymm_id" integer NOT NULL,
    "service_id" integer NOT NULL,
    "equipment_model" "text" DEFAULT 'prog'::"text" NOT NULL
);


ALTER TABLE "public"."prog_equipment_requirements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."prog_equipment_requirements_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."prog_equipment_requirements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."prog_equipment_requirements_id_seq" OWNED BY "public"."prog_equipment_requirements"."id";




CREATE TABLE IF NOT EXISTS "public"."technician_availability_exceptions" (
    "id" integer NOT NULL,
    "technician_id" integer NOT NULL, -- FK to technicians
    "exception_type" "public"."availability_exception_type" NOT NULL,
    "date" "date" NOT NULL,
    "is_available" boolean NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_time_range" CHECK (((("is_available" = false) AND ("start_time" IS NULL) AND ("end_time" IS NULL)) OR (("is_available" = true) AND ("start_time" < "end_time"))))
);


ALTER TABLE "public"."technician_availability_exceptions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."technician_availability_exceptions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."technician_availability_exceptions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."technician_availability_exceptions_id_seq" OWNED BY "public"."technician_availability_exceptions"."id";



CREATE TABLE IF NOT EXISTS "public"."technician_default_hours" (
    "id" integer NOT NULL,
    "technician_id" integer NOT NULL, -- FK to technicians
    "day_of_week" smallint NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "technician_default_hours_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "valid_time_range" CHECK (("start_time" < "end_time")) -- Name matches backup
);


ALTER TABLE "public"."technician_default_hours" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."technician_default_hours_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."technician_default_hours_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."technician_default_hours_id_seq" OWNED BY "public"."technician_default_hours"."id";


CREATE TABLE IF NOT EXISTS "public"."user_addresses" (
    "user_id" "uuid" NOT NULL, -- FK to users
    "address_id" integer NOT NULL -- FK to addresses
);


ALTER TABLE "public"."user_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."van_equipment" (
    "van_id" integer NOT NULL, -- FK to vans
    "equipment_id" integer NOT NULL -- FK to equipment
);


ALTER TABLE "public"."van_equipment" OWNER TO "postgres";


-- Set Default Values using Sequences
ALTER TABLE ONLY "public"."adas_equipment_requirements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."adas_equipment_data_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."addresses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."addresses_id_seq"'::"regclass");
-- Set default for airbag using adas sequence as per backup
ALTER TABLE ONLY "public"."airbag_equipment_requirements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."adas_equipment_data_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."customer_vehicles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vehicles_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."diag_equipment_requirements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."diag_equipment_requirements_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."equipment" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."equipment_id_seq"'::"regclass");
-- Set default for immo using adas sequence as per backup
ALTER TABLE ONLY "public"."immo_equipment_requirements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."adas_equipment_data_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."jobs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."jobs_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."order_uploads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."order_uploads_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."orders" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."orders_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."prog_equipment_requirements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."prog_equipment_requirements_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."services" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."services_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."technician_availability_exceptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."technician_availability_exceptions_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."technician_default_hours" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."technician_default_hours_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."technicians" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."technicians_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."vans" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fleet_vehicles_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."ymm_ref" ALTER COLUMN "ymm_id" SET DEFAULT "nextval"('"public"."adas_ymm_ref_ymm_id_seq"'::"regclass");


-- Primary Keys
ALTER TABLE ONLY "public"."adas_equipment_requirements" ADD CONSTRAINT "adas_equipment_data_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."ymm_ref" ADD CONSTRAINT "adas_ymm_ref_pkey" PRIMARY KEY ("ymm_id");
ALTER TABLE ONLY "public"."addresses" ADD CONSTRAINT "addresses_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."airbag_equipment_requirements" ADD CONSTRAINT "airbag_equipment_requirements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."diag_equipment_requirements" ADD CONSTRAINT "diag_equipment_requirements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."equipment" ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."van_equipment" ADD CONSTRAINT "fleet_vehicle_equipment_pkey" PRIMARY KEY ("van_id", "equipment_id");
ALTER TABLE ONLY "public"."vans" ADD CONSTRAINT "fleet_vehicles_pkey" PRIMARY KEY ("id");
-- Use adas sequence for immo PK default, but need PK constraint
ALTER TABLE ONLY "public"."immo_equipment_requirements" ADD CONSTRAINT "immo_equipment_requirements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."jobs" ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."keys" ADD CONSTRAINT "keys_pkey" PRIMARY KEY ("sku_id");
ALTER TABLE ONLY "public"."order_services" ADD CONSTRAINT "order_services_pkey" PRIMARY KEY ("order_id", "service_id");
ALTER TABLE ONLY "public"."order_uploads" ADD CONSTRAINT "order_uploads_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."prog_equipment_requirements" ADD CONSTRAINT "prog_equipment_requirements_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."services" ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."technician_availability_exceptions" ADD CONSTRAINT "technician_availability_exceptions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."technician_default_hours" ADD CONSTRAINT "technician_default_hours_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."technicians" ADD CONSTRAINT "technicians_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_addresses" ADD CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("user_id", "address_id");
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."customer_vehicles" ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");

-- Unique Constraints
ALTER TABLE ONLY "public"."adas_equipment_requirements" ADD CONSTRAINT "adas_equipment_data_ymm_id_service_id_key" UNIQUE ("ymm_id", "service_id");
ALTER TABLE ONLY "public"."ymm_ref" ADD CONSTRAINT "adas_ymm_ref_year_make_model_key" UNIQUE ("year", "make", "model");
ALTER TABLE ONLY "public"."airbag_equipment_requirements" ADD CONSTRAINT "airbag_equipment_requirements_ymm_id_service_id_key" UNIQUE ("ymm_id", "service_id");
ALTER TABLE ONLY "public"."diag_equipment_requirements" ADD CONSTRAINT "diag_equipment_requirements_ymm_service_key" UNIQUE ("ymm_id", "service_id");
ALTER TABLE ONLY "public"."immo_equipment_requirements" ADD CONSTRAINT "immo_equipment_requirements_ymm_id_service_id_key" UNIQUE ("ymm_id", "service_id");
ALTER TABLE ONLY "public"."prog_equipment_requirements" ADD CONSTRAINT "prog_equipment_requirements_ymm_service_key" UNIQUE ("ymm_id", "service_id");
ALTER TABLE ONLY "public"."services" ADD CONSTRAINT "services_service_name_key" UNIQUE ("service_name");
ALTER TABLE ONLY "public"."technician_default_hours" ADD CONSTRAINT "unique_tech_day" UNIQUE ("technician_id", "day_of_week");


-- Indexes
CREATE INDEX IF NOT EXISTS "idx_addresses_coords" ON "public"."addresses" USING "btree" ("lat", "lng");
CREATE INDEX IF NOT EXISTS "idx_jobs_estimated_sched" ON "public"."jobs" USING "btree" ("estimated_sched");
CREATE INDEX IF NOT EXISTS "idx_jobs_status" ON "public"."jobs" USING "btree" ("status");
CREATE INDEX IF NOT EXISTS "idx_tech_exceptions_date" ON "public"."technician_availability_exceptions" USING "btree" ("technician_id", "date");
CREATE INDEX IF NOT EXISTS "idx_tech_exceptions_date_range" ON "public"."technician_availability_exceptions" USING "btree" ("technician_id", "date", "start_time", "end_time");

-- Triggers (From backup)
CREATE OR REPLACE TRIGGER "update_technician_availability_exceptions_updated_at" BEFORE UPDATE ON "public"."technician_availability_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "update_technician_default_hours_updated_at" BEFORE UPDATE ON "public"."technician_default_hours" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


-- Foreign Keys (Order based on dependencies)
ALTER TABLE ONLY "public"."adas_equipment_requirements"
    ADD CONSTRAINT "adas_equipment_data_ymm_id_fkey" FOREIGN KEY ("ymm_id") REFERENCES "public"."ymm_ref"("ymm_id");
ALTER TABLE ONLY "public"."adas_equipment_requirements"
    ADD CONSTRAINT "adas_equipment_requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");

ALTER TABLE ONLY "public"."airbag_equipment_requirements"
    ADD CONSTRAINT "airbag_equipment_requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");
ALTER TABLE ONLY "public"."airbag_equipment_requirements"
    ADD CONSTRAINT "airbag_equipment_requirements_ymm_id_fkey" FOREIGN KEY ("ymm_id") REFERENCES "public"."ymm_ref"("ymm_id");

ALTER TABLE ONLY "public"."diag_equipment_requirements"
    ADD CONSTRAINT "diag_equipment_requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");
ALTER TABLE ONLY "public"."diag_equipment_requirements"
    ADD CONSTRAINT "diag_equipment_requirements_ymm_id_fkey" FOREIGN KEY ("ymm_id") REFERENCES "public"."ymm_ref"("ymm_id");

ALTER TABLE ONLY "public"."van_equipment"
    ADD CONSTRAINT "van_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."van_equipment"
    ADD CONSTRAINT "van_equipment_van_id_fkey" FOREIGN KEY ("van_id") REFERENCES "public"."vans"("id") ON DELETE CASCADE;

-- Foreign key from vans.vin to customer_vehicles.vin exists in backup but vin is not PK on customer_vehicles
-- Omitting this FK constraint for simulation unless strictly necessary
-- ALTER TABLE ONLY "public"."vans"
--     ADD CONSTRAINT "fleet_vehicles_vin_fkey" FOREIGN KEY ("vin") REFERENCES "public"."customer_vehicles"("vin") ON UPDATE CASCADE;

ALTER TABLE ONLY "public"."immo_equipment_requirements"
    ADD CONSTRAINT "immo_equipment_requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");
ALTER TABLE ONLY "public"."immo_equipment_requirements"
    ADD CONSTRAINT "immo_equipment_requirements_ymm_id_fkey" FOREIGN KEY ("ymm_id") REFERENCES "public"."ymm_ref"("ymm_id");

ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_assigned_technician_fkey" FOREIGN KEY ("assigned_technician") REFERENCES "public"."technicians"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");

ALTER TABLE ONLY "public"."order_services"
    ADD CONSTRAINT "order_services_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."order_services"
    ADD CONSTRAINT "order_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."order_uploads"
    ADD CONSTRAINT "order_uploads_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."customer_vehicles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."prog_equipment_requirements"
    ADD CONSTRAINT "prog_equipment_requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");
ALTER TABLE ONLY "public"."prog_equipment_requirements"
    ADD CONSTRAINT "prog_equipment_requirements_ymm_id_fkey" FOREIGN KEY ("ymm_id") REFERENCES "public"."ymm_ref"("ymm_id");

ALTER TABLE ONLY "public"."technician_availability_exceptions"
    ADD CONSTRAINT "technician_availability_exceptions_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id");

ALTER TABLE ONLY "public"."technician_default_hours"
    ADD CONSTRAINT "technician_default_hours_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id");

ALTER TABLE ONLY "public"."technicians"
    ADD CONSTRAINT "technicians_assigned_van_id_fkey" FOREIGN KEY ("assigned_van_id") REFERENCES "public"."vans"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."technicians"
    ADD CONSTRAINT "technicians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_addresses"
    ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_home_address_id_fkey" FOREIGN KEY ("home_address_id") REFERENCES "public"."addresses"("id") ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- No GRANTs, RLS, ALTER DEFAULT PRIVILEGES, or RESET ALL needed for init script