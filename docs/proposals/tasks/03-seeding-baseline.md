# E2E Framework Task: Stage 3 - Database Seeding (Baseline)

**Goal:** Implement the script (`_baseline.ts`) to populate the Staging Supabase database with essential, static baseline data.
                            
**Dependencies:** Stage 1 (Env Vars), Stage 2 (Utilities), Generated Supabase Types.

**Tasks:**

-   [ ] **Generate/Consolidate Supabase Types:**
    -   Run `supabase gen types typescript --project-id <staging-project-ref> --schema public > simulation/scripts/db/seed/staged.database.types.ts`.
                                -   Verify the generated `Database` interface and `Tables` utility type cover all necessary tables.     
    -   **(Optional):** Manually add types for `auth.users` if not generated.
-   [ ] **Create Baseline Script:**
    -   Create `simulation/scripts/db/seed/scenarios/_baseline.ts`.
-   [ ] **Import Dependencies:**
    -   Import `SupabaseClient` from `@supabase/supabase-js`.
    *   Import `Database`, `Tables` from `../staged.database.types.ts`.
    *   Import `createStagingSupabaseClient` from `../../utils/index.ts`.
    *   Import `cleanupAllTestData` function (from Stage 4 - create a placeholder if not done yet).
-   [ ] **Define Data Interfaces:**
    -   Use the imported `Tables<'table_name'>` utility type to define specific types for baseline data arrays (e.g., `type Address = Tables<'addresses'>;`).
                                -   Define `AuthUserSeedData` interface for creating `auth.users`.
-   [ ] **Define Baseline Data Arrays:**
    -   Copy or adapt the static data from `simulation/init-scripts/05-merged-custom-test-data.sql` and `06-equipment-requirements-test-data.sql` into TypeScript arrays typed with the interfaces defined above (e.g., `const addressesData: Address[] = [...]`).
                                                            -   Ensure data includes `addresses`, `equipment`, `ymm_ref`, `services`, `customer_vehicles`.
    -   Include data for **all 4** potential technicians in `authUsersData` and `publicUsersData` (the script will filter later).
                                -   Include data for **all 4** `vans`.
    -   Include **all** equipment requirements data (`diag_`, `immo_`, `prog_`, `airbag_`, `adas_`).        
-   [ ] **Implement `seedBaseline` Function:**
    -   Define `async function seedBaseline(supabaseAdmin: SupabaseClient<Database>, technicianCount: 1 | 2 | 3 | 4): Promise<void>`. Use the *admin* client capable of creating auth users.
                                -   Add validation for `technicianCount`.
    -   **Call Cleanup:** Invoke the (yet to be fully implemented) cleanup function: `await cleanupAllTestData(supabaseAdmin);`.
                                -   **Filter Technician Data:** Filter `authUsersData`, `publicUsersData`, `techniciansData`, and `vansData` based on the provided `technicianCount`. Also include all non-technician users.                            -   **Insert Auth Users:** Iterate through filtered `authUsersData`. Use `supabase.auth.admin.createUser({...})`, passing the predefined UUID and email. Handle potential "user already exists" errors gracefully (log warning, continue).
                                                            -   **Insert Public Data:** Use a helper function `insertData` (similar to the one in `docs/proposals/supabase-gen-types.md`) to insert data into public tables in the correct order (respecting FKs):                      1.  `addresses`
        2.  `equipment`
        3.  `ymm_ref`
        4.  `services`
        5.  `users` (filtered public users)
        6.  `vans` (filtered vans)
        7.  `customer_vehicles`
        8.  `technicians` (filtered technicians)
        9.  All `*_equipment_requirements` tables.
    -   Add logging for each step.
-   [ ] **Implement `insertData` Helper:**
    -   Add the generic `insertData` helper function within `_baseline.ts` or move it to `utils/index.ts`. Ensure it uses the typed Supabase client.
                            -   [ ] **Add Seeding Script Entry Point (Optional but Recommended):**
    -   Create `simulation/scripts/db/seed/index.ts`.
    -   Parse command-line arguments (e.g., using `process.argv`) to determine action (`baseline`, `scenario`), technician count, and scenario name.
                                -   Import and call `seedBaseline` based on arguments.
    -   Add placeholder logic for calling scenario scripts (Stage 5).
-   [ ] **Add `db:seed:staging` Script:**
    -   Add script to root `package.json`: `"db:seed:staging": "ts-node simulation/scripts/db/seed/index.ts"
` 