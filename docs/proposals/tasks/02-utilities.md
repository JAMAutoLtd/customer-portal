# E2E Framework Task: Stage 2 - Core Utilities

**Goal:** Implement shared utility functions, particularly for establishing Supabase client connections configured for the staging environment.
                            
**Tasks:**

-   [ ] **Create Utility Directory:**
    -   Ensure the directory `simulation/scripts/utils/` exists.
-   [ ] **Create Main Utility File:**
    -   Create `simulation/scripts/utils/index.ts`.
-   [ ] **Implement Supabase Client Factory:**
    -   Inside `simulation/scripts/utils/index.ts`, create a function `createStagingSupabaseClient(useServiceRole = false)`:
        -   Ensures environment variables are loaded (e.g., via `dotenv.config()` called from Jest/Playwright setup or script entry points, or by assuming they are globally available).
        -   Reads `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`).
        -   Reads `SUPABASE_SERVICE_ROLE_KEY` if `useServiceRole` is true.
        -   Reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` if `useServiceRole` is false.
        -   Validates that the required URL and key are present. Throw an error if missing.
        -   Uses `@supabase/supabase-js`'s `createClient` to instantiate and return a Supabase client instance configured for the Staging DB.
-   [ ] **Add Type Exports:**
    -   Re-export necessary types from the consolidated generated types file for easier access by scripts (e.g., `export * from '../db/seed/staged.database.types';`).
-   [ ] **(Optional) Implement Logging Utility:**
    -   Create a simple shared logging function (e.g., `logInfo`, `logError`) that standardizes console output format for scripts.
                            