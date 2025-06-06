-- Migration: Unify Equipment Requirements Tables
-- Consolidates 5 separate equipment requirement tables into a single unified table
-- Date: 2025-06-06
-- Author: Claude Code / JAMAutoLtd

BEGIN;

-- Step 1: Create the unified equipment_requirements table
CREATE SEQUENCE IF NOT EXISTS public.equipment_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.equipment_requirements (
    id integer NOT NULL DEFAULT nextval('public.equipment_requirements_id_seq'::regclass),
    ymm_id integer NOT NULL,
    service_id integer NOT NULL,
    equipment_model text NOT NULL,
    
    CONSTRAINT equipment_requirements_pkey PRIMARY KEY (id),
    CONSTRAINT equipment_requirements_ymm_id_fkey FOREIGN KEY (ymm_id) REFERENCES public.ymm_ref(ymm_id),
    CONSTRAINT equipment_requirements_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id),
    -- Allow multiple equipment models per YMM/Service combination
    CONSTRAINT equipment_requirements_ymm_service_model_key UNIQUE (ymm_id, service_id, equipment_model)
);

-- Set ownership
ALTER TABLE public.equipment_requirements OWNER TO postgres;
ALTER SEQUENCE public.equipment_requirements_id_seq OWNER TO postgres;

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_equipment_requirements_ymm_service 
    ON public.equipment_requirements USING btree (ymm_id, service_id);
CREATE INDEX IF NOT EXISTS idx_equipment_requirements_model 
    ON public.equipment_requirements USING btree (equipment_model);

-- Add table comment
COMMENT ON TABLE public.equipment_requirements IS 'Defines specific equipment models required for a given service on a specific vehicle (YMM). Replaces the individual category requirement tables.';

-- Step 2: Migrate data from existing tables

-- Migrate from adas_equipment_requirements
INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
SELECT ymm_id, service_id, equipment_model
FROM public.adas_equipment_requirements
ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

-- Migrate from airbag_equipment_requirements
INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
SELECT ymm_id, service_id, equipment_model
FROM public.airbag_equipment_requirements
ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

-- Migrate from diag_equipment_requirements
INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
SELECT ymm_id, service_id, equipment_model
FROM public.diag_equipment_requirements
ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

-- Migrate from immo_equipment_requirements
INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
SELECT ymm_id, service_id, equipment_model
FROM public.immo_equipment_requirements
ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

-- Migrate from prog_equipment_requirements
INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
SELECT ymm_id, service_id, equipment_model
FROM public.prog_equipment_requirements
ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

-- Step 3: Verify data migration
-- Check that we have the expected number of rows
DO $$
DECLARE
    old_count INTEGER;
    new_count INTEGER;
    adas_count INTEGER;
    airbag_count INTEGER;
    diag_count INTEGER;
    immo_count INTEGER;
    prog_count INTEGER;
BEGIN
    -- Count rows in old tables
    SELECT COUNT(*) INTO adas_count FROM public.adas_equipment_requirements;
    SELECT COUNT(*) INTO airbag_count FROM public.airbag_equipment_requirements;
    SELECT COUNT(*) INTO diag_count FROM public.diag_equipment_requirements;
    SELECT COUNT(*) INTO immo_count FROM public.immo_equipment_requirements;
    SELECT COUNT(*) INTO prog_count FROM public.prog_equipment_requirements;
    
    old_count := adas_count + airbag_count + diag_count + immo_count + prog_count;
    
    -- Count rows in new table
    SELECT COUNT(*) INTO new_count FROM public.equipment_requirements;
    
    -- Log the counts
    RAISE NOTICE 'Migration verification:';
    RAISE NOTICE '  ADAS requirements: %', adas_count;
    RAISE NOTICE '  Airbag requirements: %', airbag_count;
    RAISE NOTICE '  Diag requirements: %', diag_count;
    RAISE NOTICE '  Immo requirements: %', immo_count;
    RAISE NOTICE '  Prog requirements: %', prog_count;
    RAISE NOTICE '  Total old table rows: %', old_count;
    RAISE NOTICE '  New unified table rows: %', new_count;
    
    -- Check if migration was successful
    -- Note: new_count might be less than old_count if there were duplicates
    IF new_count = 0 THEN
        RAISE EXCEPTION 'Migration failed: No data was migrated to equipment_requirements table';
    END IF;
    
    IF new_count > old_count THEN
        RAISE EXCEPTION 'Migration error: More rows in new table (%) than sum of old tables (%)', new_count, old_count;
    END IF;
    
    RAISE NOTICE 'Migration verification completed successfully';
END $$;

-- Step 4: Create a view for backward compatibility (optional)
-- This can help during the transition period
CREATE OR REPLACE VIEW public.v_equipment_requirements_by_category AS
SELECT 
    er.*,
    s.service_category
FROM public.equipment_requirements er
JOIN public.services s ON er.service_id = s.id;

COMMENT ON VIEW public.v_equipment_requirements_by_category IS 'Backward compatibility view showing equipment requirements with service category';

COMMIT;

-- Instructions for completing the migration:
-- 1. Apply this migration to create the unified table and migrate data
-- 2. Update application code to use the new equipment_requirements table
-- 3. Test thoroughly in staging environment
-- 4. Once verified, drop the old tables using the rollback section below

-- ROLLBACK INSTRUCTIONS (run these commands if rollback is needed):
-- DROP VIEW IF EXISTS public.v_equipment_requirements_by_category;
-- DROP TABLE IF EXISTS public.equipment_requirements;
-- DROP SEQUENCE IF EXISTS public.equipment_requirements_id_seq;

-- TO COMPLETE MIGRATION (run after code update and testing):
-- DROP TABLE IF EXISTS public.adas_equipment_requirements;
-- DROP TABLE IF EXISTS public.airbag_equipment_requirements; 
-- DROP TABLE IF EXISTS public.diag_equipment_requirements;
-- DROP TABLE IF EXISTS public.immo_equipment_requirements;
-- DROP TABLE IF EXISTS public.prog_equipment_requirements;
-- DROP SEQUENCE IF EXISTS public.adas_equipment_data_id_seq;
-- DROP SEQUENCE IF EXISTS public.diag_equipment_requirements_id_seq;
-- DROP SEQUENCE IF EXISTS public.prog_equipment_requirements_id_seq;