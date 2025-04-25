## Unification Plan: Equipment Requirement Tables

**Goal:** Consolidate the five separate equipment requirement tables (`adas_equipment_requirements`, `airbag_equipment_requirements`, `diag_equipment_requirements`, `immo_equipment_requirements`, `prog_equipment_requirements`) into a single, unified `equipment_requirements` table. This aims to simplify the database schema, reduce redundancy, and streamline the code that queries for equipment needs.

---

**1. Proposed Schema for `equipment_requirements` Table**

```sql
-- Drop existing category-specific requirement tables (after data migration)
-- DROP TABLE IF EXISTS public.adas_equipment_requirements;
-- DROP TABLE IF EXISTS public.airbag_equipment_requirements;
-- DROP TABLE IF EXISTS public.diag_equipment_requirements;
-- DROP TABLE IF EXISTS public.immo_equipment_requirements;
-- DROP TABLE IF EXISTS public.prog_equipment_requirements;

-- Drop existing sequences if they are no longer needed (optional, depends on preference)
-- DROP SEQUENCE IF EXISTS public.adas_equipment_data_id_seq;
-- DROP SEQUENCE IF EXISTS public.diag_equipment_requirements_id_seq;
-- DROP SEQUENCE IF EXISTS public.prog_equipment_requirements_id_seq;

-- Create a single sequence for the new unified table
CREATE SEQUENCE IF NOT EXISTS public.equipment_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Create the unified table
CREATE TABLE IF NOT EXISTS public.equipment_requirements (
    id integer NOT NULL DEFAULT nextval('public.equipment_requirements_id_seq'::regclass),
    ymm_id integer NOT NULL,
    service_id integer NOT NULL,
    equipment_model text NOT NULL, -- Store the specific required model name/identifier

    CONSTRAINT equipment_requirements_pkey PRIMARY KEY (id),
    CONSTRAINT equipment_requirements_ymm_id_fkey FOREIGN KEY (ymm_id) REFERENCES public.ymm_ref(ymm_id),
    CONSTRAINT equipment_requirements_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id),
    -- IMPORTANT: Allow multiple equipment models per YMM/Service combination
    CONSTRAINT equipment_requirements_ymm_service_model_key UNIQUE (ymm_id, service_id, equipment_model)
);

-- Add ownership (adjust user if needed)
ALTER TABLE public.equipment_requirements OWNER TO postgres;
ALTER SEQUENCE public.equipment_requirements_id_seq OWNER TO postgres;

-- Add necessary indexes
CREATE INDEX IF NOT EXISTS idx_equipment_requirements_ymm_service ON public.equipment_requirements USING btree (ymm_id, service_id);
CREATE INDEX IF NOT EXISTS idx_equipment_requirements_model ON public.equipment_requirements USING btree (equipment_model);

-- Add comment
COMMENT ON TABLE public.equipment_requirements IS 'Defines specific equipment models required for a given service on a specific vehicle (YMM). Replaces the individual category requirement tables.';

```

**Schema Notes:**

*   A single `equipment_requirements` table is created.
*   A new sequence `equipment_requirements_id_seq` is used for the primary key `id`.
*   It includes foreign keys to `ymm_ref` and `services`.
*   The `equipment_model` column (renamed from `adas_equipment_model` and replacing the category-based defaults) now stores the specific required equipment model name (e.g., 'AUTEL-CSC0602/01', 'prog', 'immo'). It should be `TEXT` or `VARCHAR` and `NOT NULL`.
*   The `has_adas_service` column is **removed**, as this information can be derived by joining with the `services` table on `service_id` and checking `service_category = 'adas'`.
*   The `UNIQUE` constraint is changed to `(ymm_id, service_id, equipment_model)` to correctly allow multiple distinct equipment requirements for the same vehicle/service combination.
*   Indexes are added for efficient lookups based on vehicle/service (`ymm_id`, `service_id`) and potentially by equipment model.

---

**2. Data Migration Steps**

This should be done in a controlled environment (staging) or during a maintenance window. **Backup the database before proceeding.**

1.  **Create the New Table:** Apply the SQL schema definition above to create the `equipment_requirements` table and its sequence.
2.  **Migrate Data from Each Old Table:** Run the following `INSERT` statements:

    ```sql
    -- Migrate from adas_equipment_requirements
    INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
    SELECT ymm_id, service_id, equipment_model
    FROM public.adas_equipment_requirements
    ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

    -- Migrate from airbag_equipment_requirements
    INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
    SELECT ymm_id, service_id, equipment_model -- Assumes 'airbag' was the default or stored here
    FROM public.airbag_equipment_requirements
    ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

    -- Migrate from diag_equipment_requirements
    INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
    SELECT ymm_id, service_id, equipment_model -- Assumes 'diag' was the default or stored here
    FROM public.diag_equipment_requirements
    ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

    -- Migrate from immo_equipment_requirements
    INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
    SELECT ymm_id, service_id, equipment_model -- Assumes 'immo' was the default or stored here
    FROM public.immo_equipment_requirements
    ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;

    -- Migrate from prog_equipment_requirements
    INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model)
    SELECT ymm_id, service_id, equipment_model -- Assumes 'prog' was the default or stored here
    FROM public.prog_equipment_requirements
    ON CONFLICT (ymm_id, service_id, equipment_model) DO NOTHING;
    ```

    *   `ON CONFLICT DO NOTHING` handles potential duplicate entries if the same requirement was accidentally present in multiple old tables.

3.  **Verify Data Migration:**
    *   Compare row counts between the old tables (summed) and the new `equipment_requirements` table.
    *   Spot-check data for specific `ymm_id`/`service_id` combinations to ensure `equipment_model` values were transferred correctly.
        ```sql
        -- Example Verification Query
        SELECT equipment_model FROM public.equipment_requirements WHERE ymm_id = 4321 AND service_id = 1;

        -- Compare with:
        -- SELECT equipment_model FROM public.adas_equipment_requirements WHERE ymm_id = 4321 AND service_id = 1;
        ```

4.  **Drop Old Tables (After Code Update & Verification):** Once confident the data is migrated and the application code is updated and tested, drop the old tables.
    ```sql
    DROP TABLE public.adas_equipment_requirements;
    DROP TABLE public.airbag_equipment_requirements;
    DROP TABLE public.diag_equipment_requirements;
    DROP TABLE public.immo_equipment_requirements;
    DROP TABLE public.prog_equipment_requirements;

    -- Optionally drop old sequences if no longer needed
    -- DROP SEQUENCE public.adas_equipment_data_id_seq;
    -- DROP SEQUENCE public.diag_equipment_requirements_id_seq;
    -- DROP SEQUENCE public.prog_equipment_requirements_id_seq;
    ```

---

**3. Code Modification Steps**

The primary location needing changes is the function responsible for fetching equipment requirements.

*   **File:** `apps/scheduler/src/supabase/equipment.ts`
*   **Function:** `getRequiredEquipmentForJob(job: Job): Promise<string[]>`

    *   **Current Logic:** Determines the job's `service_category` and queries the corresponding specific table (e.g., `adas_equipment_requirements`).
    *   **New Logic:**
        1.  Keep the existing logic to fetch the `ymm_id` for the job's order using `getYmmIdForOrder(job.order_id)`. Handle the case where `ymm_id` is null.
        2.  **Remove** the `switch` statement or conditional logic based on `service_category`.
        3.  Perform a **single query** against the new `public.equipment_requirements` table.
        4.  Filter the query by `ymm_id` (obtained in step 1) and `service_id` (from `job.service_id`).
        5.  Select only the `equipment_model` column.
        6.  The result will be an array of objects (e.g., `[{ equipment_model: 'modelA' }, { equipment_model: 'modelB' }]`). Map this array to extract just the `equipment_model` strings.
        7.  Return the array of required `equipment_model` strings.

    *   **Example Code Snippet (Illustrative):**
        ```typescript
        // apps/scheduler/src/supabase/equipment.ts
        import { supabase } from '../client'; // Ensure correct import
        import { Job } from '../../types/database.types';
        import { getYmmIdForOrder } from '../orders'; // Correct path

        export async function getRequiredEquipmentForJob(job: Job): Promise<string[]> {
          if (!job.service_id) {
            console.warn(`Job ${job.id} is missing service_id. Cannot determine equipment requirements.`);
            return [];
          }

          const ymmId = await getYmmIdForOrder(job.order_id);
          if (ymmId === null) {
            console.warn(`Could not determine ymm_id for order ${job.order_id}. Cannot fetch equipment requirements.`);
            return [];
          }

          console.log(`Fetching equipment requirements for ymm_id: ${ymmId}, service_id: ${job.service_id}`);

          // --- START NEW LOGIC ---
          try {
            const { data, error } = await supabase
              .from('equipment_requirements') // Query the NEW unified table
              .select('equipment_model') // Select the model name/identifier
              .eq('ymm_id', ymmId)
              .eq('service_id', job.service_id);

            if (error) {
              console.error(`Error fetching equipment requirements for ymm_id ${ymmId}, service_id ${job.service_id}:`, error);
              return []; // Return empty array on error
            }

            if (!data || data.length === 0) {
              // console.log(`No specific equipment requirements found for ymm_id ${ymmId}, service_id ${job.service_id}.`);
              return []; // No requirements found
            }

            // Extract the equipment model strings from the result
            const requiredModels = data.map(req => req.equipment_model);
            console.log(`Required models for job ${job.id}: [${requiredModels.join(', ')}]`);
            return requiredModels;

          } catch (fetchError) {
             console.error(`Exception during equipment requirement fetch for job ${job.id}:`, fetchError);
             return [];
          }
          // --- END NEW LOGIC ---
        }

        // getEquipmentForVans function remains unchanged as it queries van_equipment table
        // ... (rest of the file) ...
        ```

*   **Other Code Locations:**
    *   Search the codebase (especially `apps/scheduler/`) for any direct references to the old table names (`adas_equipment_requirements`, etc.) and update them if found (unlikely outside of `equipment.ts` and potentially tests/seeds).

---

**4. Seed Data Update**

*   **File:** `simulation/init-scripts/06-equipment-requirements-test-data.sql`
*   **Action:** Modify this file to insert data directly into the new `equipment_requirements` table instead of the five separate tables. Ensure the `equipment_model` column is populated correctly based on the original data (either the specific ADAS model or the category name like 'prog', 'immo', etc.).
    *   **Example:** Combine the inserts into one `INSERT INTO public.equipment_requirements (ymm_id, service_id, equipment_model) VALUES ...` statement.

---

**5. Testing Strategy**

1.  **Unit Tests:**
    *   Update `apps/scheduler/tests/supabase/equipment.test.ts` to reflect the changes in `getRequiredEquipmentForJob`.
    *   Ensure mocks query the `equipment_requirements` table.
    *   Test scenarios where a service requires zero, one, or multiple equipment models.
    *   Test error handling (e.g., null `ymm_id`).
2.  **Integration Tests:**
    *   Review `apps/scheduler/tests/integration/orchestrator.test.ts` and `apps/scheduler/tests/scheduler/eligibility.test.ts`. While these primarily mock the `getRequiredEquipmentForJob` function, ensure the mocked return values are still appropriate (arrays of model strings).
3.  **End-to-End Tests:**
    *   Run the full E2E suite using `simulation/run-e2e-tests.js --generate`.
    *   **Critical Verification:** Ensure the `determineTechnicianEligibility` step within the scheduler still functions correctly. Jobs should be correctly assigned to technicians whose vans have the required `equipment_model`(s) listed in the new `equipment_requirements` table (based on `van_equipment` data), or marked as `pending_review` if no eligible technician is found.
    *   Pay close attention to scenarios involving specific equipment needs (like `missing-equipment` or `split-bundle` if used in E2E).

---

**6. Rollback Plan**

1.  **Database Backup:** Perform a full database backup *before* applying the schema changes and migrating data.
2.  **Code Changes:** Use Git branching. Reverting the code changes in `apps/scheduler/src/supabase/equipment.ts` is the primary step.
3.  **Database Rollback:**
    *   **If Old Tables Still Exist:** Truncate the new `equipment_requirements` table (`TRUNCATE TABLE public.equipment_requirements;`). Revert code changes.
    *   **If Old Tables Were Dropped:** Restore the database from the backup taken before the migration. Revert code changes.

---

**7. Benefits of Unification**

*   **Simplified Schema:** Reduces the number of tables and removes redundancy.
*   **Simplified Code:** The logic in `getRequiredEquipmentForJob` becomes much simpler, removing the need to switch queries based on service category.
*   **Improved Maintainability:** Easier to manage requirements as there's only one table to query and update.
*   **Flexibility:** Easily allows services to require multiple pieces of equipment without complex joins across tables.

This plan provides a clear path to unifying the equipment requirement tables, simplifying the system while maintaining functionality. Remember to test thoroughly in a staging environment before applying to production. 