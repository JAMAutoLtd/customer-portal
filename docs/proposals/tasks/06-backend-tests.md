# E2E Framework Task: Stage 6 - Backend Scenario Tests (Jest)

**Goal:** Develop Jest tests to validate the scheduler's orchestration logic (`runFullReplan`) against specific database states prepared by the scenario seeding scripts.
                            
**Dependencies:** Stage 1 (Jest Setup), Stage 3 (Baseline Seeding), Stage 5 (Scenario Seeding). Docker services (`scheduler`, `optimiser`, simulated DB/API) must be running.
                            
**Tasks:**

-   [ ] **Create Test Directory:**
    -   Ensure `tests/integration/scheduler/` exists.
-   [ ] **Implement Test Files (`*.test.ts`):**
    -   Create a `.test.ts` file for each scenario implemented in Stage 5 (e.g., `equipment_conflict.test.ts`, `fixed_time_today.test.ts`).
                                *   **Structure (per file):**
        *   Import necessary modules (`SupabaseClient`, `createClient`, types, `axios`/`fetch`, `fs`, `path`).
                                    *   Load the `seed-metadata.json` file in a `beforeAll` or at the top level to access scenario-specific IDs.
                                    *   Define the `describe` block for the scenario.
        *   **(Crucial):** Use a `beforeAll` or `beforeEach` hook to:
            1.  Ensure the Docker environment is running (perhaps by checking service health endpoints). **Note:** Starting/stopping Docker should ideally be handled *outside* the Jest tests by the main runner script (`e2e-runner.ts` or the older `run-e2e-tests.js`), not within Jest itself.                                             2.  **(Optional but Recommended for Isolation):** Trigger the appropriate baseline + scenario seeding *before each test* or *once per file*. This requires calling the seeding script via `child_process`. Alternatively, assume seeding is done manually or by the CLI runner before invoking Jest. For simplicity initially, assume seeding is done externally.
                3.  Initialize the Supabase client using `createStagingSupabaseClient(true)` (Service Role needed for potential direct DB checks).
                                    *   Write the `test` or `it` block:
            1.  Log the scenario being tested.
            2.  **(Trigger Replan):** Make an HTTP POST request to the **local running scheduler service's** `/run-replan` endpoint (e.g., `http://localhost:<scheduler_port>/run-replan` - **Note:** The port mapping needs to be defined in `docker-compose.test.yml` or use the internal Docker network name `http://scheduler:8080/run-replan` if tests run *inside* the Docker network). Use `axios` or Node `fetch`. Wait for the request to complete (acknowledge).
                                            3.  **(Wait for Completion):** Add a reasonable delay (`await setTimeout(...)`) to allow the asynchronous `runFullReplan` process within the scheduler container to finish processing and update the database. This duration might need tuning (e.g., 5-15 seconds). *Alternatively, implement polling on the DB state for a more robust wait.*

                4.  **(Verification):** Query the Staging Supabase DB using the client. Fetch the final state of the specific jobs/orders identified in `seed-metadata.json` for the current scenario.                                  5.  **(Assertions):** Use `expect` assertions to validate the final `status`, `assigned_technician`, `estimated_sched`, etc., based on the expected outcome of the scenario (e.g., `expect(job.status).toBe('pending_review')` for `equipment_conflict`).
                                                            *   **Example (`equipment_conflict.test.ts`):**
        ```typescript
        import { createClient, SupabaseClient } from '@supabase/supabase-js';
        import { Database, Tables } from '../../simulation/scripts/db/seed/staged.database.types'; // Adjust path
                                    import fs from 'fs';
        import path from 'path';
        import axios from 'axios'; // Or use fetch


``` 