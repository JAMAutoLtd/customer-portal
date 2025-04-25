-- Create PostgreSQL roles needed by PostgREST
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

-- PostgreSQL will execute these scripts in alphabetical order,
-- so 00-roles.sql will run before 01-schema.sql.
-- This ensures the roles exist before any grants are attempted. 