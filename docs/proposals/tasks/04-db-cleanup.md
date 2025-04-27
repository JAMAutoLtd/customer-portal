# E2E Framework Task: Stage 4 - Database Cleanup

**Goal:** Implement a script to reliably remove all test data created by the seeding process from the Staging Supabase database.
                            
**Dependencies:** Stage 1 (Env Vars), Stage 2 (Utilities).

**Tasks:**

-   [ ] **Create Cleanup Script:**
    -   Create `simulation/scripts/db/cleanup-staging.ts`.
-   [ ] **Import Dependencies:**
    -   Import `SupabaseClient` from `@supabase/supabase-js`.
    *   Import `Database` from `./seed/staged.database.types.ts`.
    *   Import `createStagingSupabaseClient` from `../utils/index.ts`.
    *   Import `inquirer` for confirmation prompts.
-   [ ] **Define Identifier Pattern:**
    -   Establish the convention for identifying test data (e.g., email domain `@e2etest.jam-auto.com`, notes prefix `[E2E_TEST]`). Document this pattern clearly within the script's comments.
-   [ ] **Implement `cleanupAllTestData` Function:**
    -   Define `async function cleanupAllTestData(supabaseAdmin: SupabaseClient<Database>, skipConfirmation = false): Promise<void>`. Use the *admin* client.
    -   **Confirmation Prompt:** If `skipConfirmation` is false, use `inquirer` to ask the user multiple times (e.g., "Are you sure you want to delete ALL test data from STAGING DB?") before proceeding. Exit if not confirmed.
    -   **Deletion Logic (Order Matters):**
        1.  **Fetch Test User IDs:** Select IDs from `auth.users` matching the email pattern. Select corresponding IDs from `public.users`.
        2.  **Delete Dependent Public Data:** Delete records referencing test users or test orders/jobs from junction tables and tables with foreign keys *first*, matching the test pattern where applicable:                      *           
            *   `technician_availability_exceptions` (using test technician IDs)
            *   `technician_default_hours` (using test technician IDs)
            *   `van_equipment` (using test van IDs)
            *   `order_services` (using test order IDs)
            *   `order_uploads` (using test order IDs)
            *   `jobs` (using test order IDs or technician IDs)
            *   `orders` (using test user IDs or vehicle IDs)
            *   `user_addresses` (using test user IDs)
            *   `technicians` (using test user IDs)
        3.  **Delete Core Public Data:**
            *   `customer_vehicles` (if identifiable as test data, e.g., via linked orders)
            *   `vans` (using test van IDs)
            *   `public.users` (using test user IDs)
            *   `addresses` (if identifiable, e.g., only linked to test users/orders)
        4.  **Delete Auth Users:** Iterate through the fetched test user IDs and use `supabase.auth.admin.deleteUser(userId)`. Handle errors (e.g., user not found).
            -   Add comprehensive logging for each deletion step.
    -   Wrap deletions in `try...catch` blocks.
-   [ ] **Add Script Entry Point:**
    -   Add logic to allow running the script directly (`if (require.main === module) { ... }`).
    -   Initialize the admin Supabase client.
    -   Call `cleanupAllTestData(supabaseAdmin)`.
-   [ ] **Add `db:clean:staging` Script:**
    -   Add script to root `package.json`: `"db:clean:staging": "ts-node simulation/scripts/db/cleanup-staging.ts"`
                            