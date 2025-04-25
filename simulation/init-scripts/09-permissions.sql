-- Additional permissions to ensure all tables have proper access
-- This file runs after 00-roles.sql (which creates roles) and 01-schema.sql (which grants some permissions)

-- Grant broad permissions to PostgreSQL roles
-- GRANT USAGE ON SCHEMA public TO anon, authenticated; -- Covered in 01-schema
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated; -- Broad, rely on 01-schema grants for now
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated; -- Broad, rely on 01-schema grants for now
-- GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated; -- Broad, rely on 01-schema grants for now

-- Ensure all tables created in the future also have these permissions
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated; -- Broad, disable for testing
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated; -- Broad, disable for testing
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated; -- Broad, disable for testing

-- Specifically grant jobs table privileges to address permission issues
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobs TO anon, authenticated; -- Covered in 01-schema
GRANT SELECT ON TABLE public.jobs TO anon;

-- Grant permissions to the anon role (used by PostgREST)
GRANT SELECT ON public.addresses TO anon;
GRANT SELECT ON public.equipment TO anon;
-- Grant full CRUD permissions for the test environment anon role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO anon;
GRANT SELECT ON public.orders TO anon;
GRANT SELECT ON public.services TO anon;
GRANT SELECT ON public.technicians TO anon;
GRANT SELECT ON public.users TO anon;
GRANT SELECT ON public.vans TO anon;
GRANT SELECT ON public.van_equipment TO anon;
GRANT SELECT ON public.ymm_ref TO anon;
GRANT SELECT ON public.customer_vehicles TO anon;
GRANT SELECT ON public.order_services TO anon;

-- Grant SELECT on all equipment requirement tables
GRANT SELECT ON public.adas_equipment_requirements TO anon;
GRANT SELECT ON public.airbag_equipment_requirements TO anon;
GRANT SELECT ON public.immo_equipment_requirements TO anon;
GRANT SELECT ON public.prog_equipment_requirements TO anon;
GRANT SELECT ON public.diag_equipment_requirements TO anon;

-- Grant usage on schemas
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated; -- Grant usage on extensions schema if needed

-- Grant usage on sequences (needed for INSERTs if policies are used)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Informational message
SELECT 'Permissions script executed (broad grants temporarily disabled)';

-- Consider Row Level Security (RLS) for production environments.
-- Example RLS Policies:
-- ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY select_own_jobs ON public.jobs FOR SELECT TO authenticated USING (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');
-- CREATE POLICY manage_all_jobs_for_admin ON public.jobs FOR ALL TO authenticated USING (current_setting('request.jwt.claims', true)::jsonb->>'is_admin' = 'true') WITH CHECK (current_setting('request.jwt.claims', true)::jsonb->>'is_admin' = 'true'); 