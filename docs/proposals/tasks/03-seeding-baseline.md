# E2E Framework Task: Stage 3 - Database Seeding (Baseline)

**Goal:** Implement the script (`baseline.ts`) to populate the Staging Supabase database with essential, static baseline data.
                            
**Dependencies:** Stage 1 (Env Vars), Stage 2 (Utilities), Generated Supabase Types.

**Tasks:**


-   [ ] **Implement `seedBaseline` Function:**
    -   Define `async function seedBaseline(supabaseAdmin: SupabaseClient<Database>, technicianCount: 1 | 2 | 3 | 4): Promise<BaselineRefs>`. Use the *admin* client capable of creating auth users.
    -   Add validation for `technicianCount`.
    -   **Call Cleanup:** Invoke the (yet to be fully implemented) cleanup function: `await cleanupAllTestData(supabaseAdmin);`.
    -   **Filter Technician Data:** Filter `authUsersData`, `publicUsersData`, `techniciansData`, and `vansData` based on the provided `technicianCount`. Also include all non-technician users.
    -   **Insert Auth Users:** Iterate through filtered `authUsersData`. Use `supabase.auth.admin.createUser({...})`, passing the predefined UUID and email. Handle potential "user already exists" errors gracefully (log warning, continue).
    -   **Insert Public Data:** Use a helper function `insertData` (similar to the one in `docs/proposals/supabase-gen-types.md`) to insert data into public tables in the correct order (respecting FKs):                      
        1.  `addresses`
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
    -   Add the generic `insertData` helper function within `baseline.ts` or move it to `utils/index.ts`. Ensure it uses the typed Supabase client.
-   [ ] **Add Seeding Script Entry Point (Optional but Recommended):**
    -   Create `simulation/scripts/db/seed/index.ts`.
    -   Parse command-line arguments (e.g., using `process.argv`) to determine action (`baseline`, `scenario`), technician count, and scenario name.
    -   Import and call `seedBaseline` based on arguments.
    -   Add placeholder logic for calling scenario scripts (Stage 5).
-   [ ] **Add `db:seed:staging` Script:**
    -   Add script to root `package.json`: `"db:seed:staging": "ts-node simulation/scripts/db/seed/index.ts"` 