-- Script to generate complete database schema
-- psql "postgresql://postgres.rpwazhpyylwqfbxcwtsy:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
-- \o src/db/schema_output.sql
-- \i src/db/generate_schema.sql
WITH 
-- First get all the sequences
sequences AS (
    SELECT 
        sequence_name,
        'CREATE SEQUENCE IF NOT EXISTS ' || sequence_name || ';' as sequence_sql
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
),
-- Get all ENUMs
enums AS (
    SELECT 
        t.typname,
        'CREATE TYPE ' || quote_ident(t.typname) || ' AS ENUM (' || -- Use quote_ident for type name
        string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) || ');' AS enum_sql
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
),
-- Get unique constraint columns
unique_constraint_columns AS (
    SELECT 
        tc.table_name,
        tc.constraint_name,
        string_agg(quote_ident(kcu.column_name), ', ' ORDER BY kcu.ordinal_position) as columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name
),
-- Get primary key info
pk_info AS (
    SELECT 
        tc.table_name,
        tc.constraint_name,
        string_agg(quote_ident(kcu.column_name), ', ' ORDER BY kcu.ordinal_position) as pk_columns,
        COUNT(*) as pk_count -- Count columns in PK
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name
),
-- Get foreign key info
fk_info AS (
    SELECT 
        tc.table_name,
        tc.constraint_name,
        kcu.column_name as fk_column,
        ccu.table_schema as ref_schema, -- Added referenced schema
        ccu.table_name as ref_table,
        ccu.column_name as ref_column,
        rc.update_rule,
        rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public' -- Constraint defined in public schema
    AND tc.constraint_type = 'FOREIGN KEY'
),
-- Get check constraint info
check_info AS (
    SELECT 
        tc.table_name,
        tc.constraint_name,
        -- Remove outer parentheses if they exist
        regexp_replace(cc.check_clause, '^\((.*)\)$', '\1') as check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
    WHERE tc.constraint_schema = 'public'
    AND tc.constraint_type = 'CHECK'
    -- Exclude specific auth check and standard NOT NULL checks
    AND tc.constraint_name NOT LIKE 'auth_%' 
    AND cc.check_clause NOT LIKE '%IS NOT NULL%'
),
-- Get column definitions (incl. inline single-column PK)
column_definitions AS (
    SELECT
        c.table_name,
        c.ordinal_position,
        '    ' || quote_ident(c.column_name) || ' ' || 
        -- Use format_type for standard type names
        format_type(att.atttypid, att.atttypmod) ||
        CASE 
            WHEN pk.pk_count = 1 AND pk.pk_columns = quote_ident(c.column_name) THEN ' PRIMARY KEY' -- Inline single PK
            ELSE ''
        END ||
        CASE 
            WHEN c.is_nullable = 'NO' AND (pk.pk_columns IS NULL OR pk.pk_columns <> quote_ident(c.column_name)) THEN ' NOT NULL' -- Add NOT NULL if not PK
            ELSE ''
        END ||
        CASE 
            WHEN c.column_default IS NOT NULL THEN ' DEFAULT ' || c.column_default
            ELSE ''
        END AS definition
    FROM information_schema.columns c
    JOIN pg_catalog.pg_namespace n ON n.nspname = c.table_schema
    JOIN pg_catalog.pg_class cl ON cl.relname = c.table_name AND cl.relnamespace = n.oid
    JOIN pg_catalog.pg_attribute att ON att.attrelid = cl.oid AND att.attname = c.column_name
    LEFT JOIN pk_info pk ON c.table_name = pk.table_name -- Join to check pk_count
    WHERE c.table_schema = 'public'
),
-- Aggregate definitions per table
tables AS (
    SELECT 
        table_name,
        string_agg(definition, E',\n' ORDER BY ordinal_position) as columns,
        -- Get COMPOSITE primary key constraint (only if pk_count > 1)
        (SELECT E',\n    PRIMARY KEY (' || pk_columns || ')' 
         FROM pk_info pk 
         WHERE pk.table_name = cd.table_name AND pk.pk_count > 1 -- Only for composite PKs
         LIMIT 1) AS pk_constraint,
        -- Get unique constraints (as separate constraints)
        (SELECT string_agg(E',\n    UNIQUE (' || columns || ')', '')
         FROM unique_constraint_columns ucc
         WHERE ucc.table_name = cd.table_name) AS unique_constraints,
        -- Get check constraints (as separate constraints)
        (SELECT string_agg(E',\n    CHECK (' || check_clause || ')', '')
         FROM check_info ci
         WHERE ci.table_name = cd.table_name) AS check_constraints,
        -- Get ALL foreign keys (as separate constraints)
        (SELECT string_agg(E',\n    FOREIGN KEY (' || quote_ident(fk.fk_column) || ') REFERENCES ' || 
                    CASE WHEN fk.ref_schema <> 'public' THEN quote_ident(fk.ref_schema) || '.' ELSE '' END || -- Add schema prefix if not public
                    quote_ident(fk.ref_table) || '(' || quote_ident(fk.ref_column) || ')' ||
                    CASE WHEN fk.update_rule <> 'NO ACTION' THEN ' ON UPDATE ' || fk.update_rule ELSE '' END ||
                    CASE WHEN fk.delete_rule <> 'NO ACTION' THEN ' ON DELETE ' || fk.delete_rule ELSE '' END, '')
         FROM fk_info fk
         WHERE fk.table_name = cd.table_name) AS foreign_key_constraints
    FROM column_definitions cd
    GROUP BY table_name
),
-- Get indexes (excluding those for constraints)
indexes AS (
    SELECT 
        pi.tablename as table_name,
        string_agg(
            'CREATE INDEX ' || quote_ident(pi.indexname) || ' ON ' || quote_ident(pi.tablename) || ' (' || 
            regexp_replace(regexp_replace(pg_get_indexdef(pi.indexname::regclass::oid), '^.*USING \w+ \((.*)\)$', '\1'), ' (ASC|DESC|NULLS (FIRST|LAST))', '', 'g') || ');',
            E'\n'
        ) as index_definitions
    FROM pg_indexes pi
    LEFT JOIN pg_constraint pcon ON pcon.conindid = (
        SELECT oid FROM pg_class WHERE relname = pi.indexname AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = pi.schemaname)
    )
    WHERE pi.schemaname = 'public'
    AND pcon.oid IS NULL -- Exclude constraint-based indexes
    GROUP BY pi.tablename
),
-- Get table comments
comments AS (
    SELECT 
        c.relname as table_name,
        'COMMENT ON TABLE ' || quote_ident(c.relname) || ' IS ' || quote_literal(d.description) || ';' as comment_sql
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind = 'r'
),
-- Aggregate table definitions
tables_output AS (
    SELECT string_agg(
        'CREATE TABLE ' || quote_ident(table_name) || ' (\n' ||
        columns ||
        COALESCE(pk_constraint, '') || -- Add COMPOSITE PK if exists
        COALESCE(unique_constraints, '') ||
        COALESCE(check_constraints, '') ||
        COALESCE(foreign_key_constraints, '') || -- Use the unified FK constraints
        E'\n);\n\n',
        ''
        ORDER BY table_name
    ) as tables_sql
    FROM tables
),
-- Combine all parts
final_output AS (
    SELECT 
        E'-- Generated Schema\n\n' ||
        -- ENUMs
        E'-- Create enum types\n' ||
        COALESCE((SELECT string_agg(enum_sql, E'\n' ORDER BY typname) FROM enums), '') || E'\n\n' ||
        -- Sequences
        E'-- Create sequences\n' ||
        COALESCE((SELECT string_agg(sequence_sql, E'\n' ORDER BY sequence_name) FROM sequences), '') || E'\n\n' ||
        -- Tables
        E'-- Create tables\n' ||
        COALESCE((SELECT tables_sql FROM tables_output), '') ||
        -- Indexes
        E'-- Create indexes\n' ||
        COALESCE((SELECT string_agg(index_definitions, E'\n' ORDER BY table_name) FROM indexes), '') || E'\n\n' ||
        -- Comments
        E'-- Add table comments\n' ||
        COALESCE((SELECT string_agg(comment_sql, E'\n' ORDER BY table_name) FROM comments), '') as schema_output
)
SELECT schema_output FROM final_output; 