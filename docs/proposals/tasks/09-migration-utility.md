# E2E Framework Task: Stage 9 - Production Migration Utility

**Goal:** Implement a script to safely migrate data from Production Supabase to Staging Supabase, anonymizing sensitive information during the process.
                            
**Dependencies:** Stage 1 (Env Vars), Stage 2 (Utilities).

**Warning:** This script operates on Production data (read-only) and writes to Staging. Extreme caution is required.

**Tasks:**

-   [ ] **Create Migration Script:** // Not started
    -   Create `simulation/scripts/db/migrate-prod-to-staging.ts`.
-   [ ] **Import Dependencies:** // Not started
    -   Import `SupabaseClient` from `@supabase/supabase-js`.
    *   Import `createStagingSupabaseClient` from `../utils/index.ts`.
    *   Import `@faker-js/faker`.
    *   Import `inquirer` for confirmation prompts.
    *   Import types (`Database`, `Tables`) from the **Staging** types file.
    *   Define types for **Production** data if schemas differ significantly (consider generating prod types separately).
-   [ ] **Implement Production Supabase Client Factory:** // Not started
    -   Similar to `createStagingSupabaseClient`, create `createProdSupabaseClient(useServiceRole = true)` in `utils/index.ts` or within the migration script.
    -   This function **must** read separate environment variables for the Production Supabase instance (e.g., `PROD_SUPABASE_URL`, `PROD_SUPABASE_SERVICE_ROLE_KEY`).
    -   **Emphasize:** Use the Service Role key for reading necessary data (like `auth.users`).
-   [ ] **Implement Main Migration Function (`migrateProdToStaging`):** // Not started
    -   Define `async function migrateProdToStaging(): Promise<void>`.
    -   **Initialize Clients:** Create both `prodSupabaseAdmin` and `stagingSupabaseAdmin` clients.
    -   **EXTREME WARNING & Confirmation:**
        -   Log multiple, prominent warnings about reading from Production and writing to Staging.
        -   Use `inquirer` to ask for explicit confirmation multiple times (e.g., type "MIGRATE PROD TO STAGING" to proceed).
        -   Exit immediately if not confirmed.
    -   **(Optional but Recommended) Staging Cleanup:** Ask the user if they want to run the staging cleanup script first (`db:clean:staging`).
    -   **Fetch Production Data (Read-Only):**
        -   Select data from Production tables in a logical order (users, addresses, vehicles, equipment, services, etc.).
        -   Fetch `auth.users` using `prodSupabaseAdmin.auth.admin.listUsers()`.
        -   Fetch public data using `.select('*')`.
        -   Handle pagination if necessary for large tables (`.range()`).
    -   **Anonymize Data:**
        -   Create a mapping for original Prod IDs to new Staging IDs (important for FK relationships).
        -   Iterate through fetched data:
            *   **Users:** Replace emails (`faker.internet.email()`), names (`faker.person.*`), phone numbers (`faker.phone.number()`) etc. Keep original UUIDs for `auth.users` but replace sensitive fields in `public.users`.
            *   **Addresses:** Replace street addresses (`faker.location.*`), potentially zip codes depending on required granularity.
            *   **Vehicles:** Replace VINs, license plates.
            *   **Notes/Descriptions:** Consider scrubbing free-text fields for PII.
            *   **Update Foreign Keys:** Use the ID mapping to replace original Prod FKs with the corresponding new Staging FKs.
    -   **Insert Anonymized Data into Staging:**
        -   Use the `stagingSupabaseAdmin` client.
        -   Insert `auth.users` first using `stagingSupabaseAdmin.auth.admin.createUser({...})` with the original UUID but anonymized details. Handle conflicts.
        -   Insert public data into Staging tables in the correct order using the `insertData` helper, ensuring all FKs reference the *new* Staging IDs.
    -   Add comprehensive logging for fetching, anonymizing, and inserting data for each table.
    -   Wrap the entire process in a `try...catch` block.
-   [ ] **Add Script Entry Point:** // Not started
    -   Add logic to run `migrateProdToStaging` when the script is executed directly.
-   [ ] **Add `db:migrate:prod-staging` Script:** // Not started
    -   Add script to root `package.json`: `"db:migrate:prod-staging": "ts-node simulation/scripts/db/migrate-prod-to-staging.ts"`
-   [ ] **Update `.env.test`:** // Requires manual user action
 Add the required `PROD_SUPABASE_URL` and `PROD_SUPABASE_SERVICE_ROLE_KEY` variables (ensure these are kept secure).