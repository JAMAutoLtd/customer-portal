# E2E Testing Framework & Workflow Plan (Staging DB)

**Version:** 1.4
**Date:** 2024-09-06 (Updated)

## 1. Goal

To establish a robust and user-friendly End-to-End (E2E) testing framework for the JAM Auto application suite. This framework will:

1.  Utilize the existing `docker-compose.test.yml` to run local instances of the `web`, `scheduler`, and `optimiser` services.
2.  Connect these services to a designated **Staging Supabase instance** (credentials configured via `.env.test`).
3.  Provide a command-line interface (CLI) for easy execution of test suites and utility scripts.
4.  Enable developers to monitor logs from all running services during test execution.
5.  Include mechanisms for seeding the Staging Supabase database for:
    a. Backend scenario testing (validating scheduler logic).
    b. UI E2E testing prerequisites.
6.  Implement UI E2E tests (Playwright) for core user workflows: Registration and Order Placement.
7.  Implement Backend Scenario tests (Jest) for scheduler/optimizer logic validation.
8.  Provide utility scripts for DB cleanup and migration.

## 2. Core Technologies

*   **Orchestration:** Node.js, TypeScript, pnpm Workspaces
*   **Containerization:** Docker, Docker Compose (`docker-compose.test.yml`)
*   **CLI Menu:** `inquirer`
*   **Log Aggregation:** Manual separate terminal viewing (recommended).
*   **Database Interaction:** `@supabase/supabase-js` client library
*   **E2E Testing:** Playwright (`@playwright/test`)
*   **Data Generation:** `@faker-js/faker`
*   **Environment Config:** `dotenv` (`.env.test`, `.env.prod` - managed securely).
*   **Script Execution:** `ts-node`
*   **Backend Testing:** Jest (`jest`, `ts-jest`) - For testing scheduler scenarios.

**Required Dependencies:**
*   Add as root workspace dev dependencies (`pnpm add -D -w`): `ts-node @types/node`, `@faker-js/faker @types/faker`, `inquirer @types/inquirer`, `dotenv`.
*   Add as root workspace dependency (`pnpm add -w`): `@supabase/supabase-js`.

## 3. Directory Structure (Updated)

```
jam-auto/
├── apps/
│   ├── web/
│   ├── scheduler/
│   └── optimiser/
├── docs/
│   └── proposals/
│       └── test-scripts-plan.md # This file
├── simulation/                  # Root for simulation and E2E testing scripts
│   ├── scripts/
│   │   ├── db/
│   │   │   ├── seed/
│   │   │   │   ├── scenarios/   # Directory for scenario logic files
│   │   │   │   │   ├── base_schedule.ts
│   │   │   │   │   └── ... (equipment_conflict.ts, etc.)
│   │   │   │   ├── baseline.ts # Logic for baseline data (parameterized)
│   │   │   │   └── staged.database.types.ts # CONSOLIDATED Generated Supabase types
│   │   │   ├── cleanup-staging.ts # Script to clean test data from Staging DB
│   │   │   └── migrate-prod-to-staging.ts # Utility script for Prod -> Staging migration
│   │   │
│   │   ├── utils/             # Common utility functions for scripts (e.g., Supabase client setup)
│   │   │   └── index.ts
│   │   └── e2e-runner.ts      # Main CLI menu script
│   │
│   ├── docker-compose.yml     # NOTE: Plan uses docker-compose.test.yml, confirm which is correct
│   └── ... (Other simulation assets like README.md, init-scripts/ if still used for anything)
│
├── tests/
│   ├── e2e/                   # Playwright UI E2E tests
│   │   ├── specs/
│   │   │   ├── registration.spec.ts
│   │   │   └── order-placement.spec.ts
│   │   └── fixtures/
│   │   └── playwright.config.ts
│   │   └── package.json         # Or managed at root
│   └── integration/           # Backend scenario tests (Jest)
│       ├── scheduler/         # Tests focused on scheduler logic
│       │   ├── base_schedule.test.ts
│       │   └── equipment_conflict.test.ts
│       │   └── ... (Other scenario test files)
│       └── jest.config.integration.js # Optional: Dedicated Jest config
│
├── .env.test                  # Staging DB & local service config
├── .env.prod                  # Production DB config (NOT COMMITTED, handled securely)
├── docker-compose.test.yml    # Test environment service definitions
└── package.json               # Root package.json with scripts
```
*(Note: Test scripts are under `simulation/scripts/`. Consolidated types file is now within `simulation/scripts/db/seed/`).*

## 4. Implementation Details

**General Scripting Considerations:**
*   All custom Node.js scripts (`simulation/scripts/**/*.ts`) should include robust error handling (try/catch blocks) and provide clear, informative logging messages for success and failure conditions.

### 4.1. CLI Menu Script (`simulation/scripts/e2e-runner.ts`)

*   **Technology:** Node.js, TypeScript, `inquirer`.
*   **Location:** `simulation/scripts/e2e-runner.ts`.
*   **Functionality:**
    *   Present a main menu with options:
        *   "Start Docker Services (Test Env)"
        *   "Stop Docker Services (Test Env)"
        *   "View Docker Logs (Instructions)"
        *   "Seed Staging Database (Baseline + Scenario)"
        *   "Clean Staging Database (ALL Test Data)"
        *   "Run ALL UI E2E Tests (Playwright)"
        *   "Run Specific UI E2E Suite (Playwright)"
        *   "Run Backend Scenario Test (Jest - Select Scenario)" (Sub-menu or prompt)
        *   "Migrate Production Data to Staging" (With strong warnings)
        *   "Exit"
    *   Use `child_process.spawn` to execute other scripts/commands.
    *   Load `.env.test` using `dotenv`.
    *   **Seed Option Flow:**
        1.  Prompt: "Select number of baseline technicians (1-4):"
        2.  Execute `simulation/scripts/db/seed/index.ts` with `baseline` action and technician count.
        3.  Prompt: "Select scenario to layer on top: (`base_schedule`, `equipment_conflict`, ..., 'None')"
        4.  If a scenario is chosen (not 'None'), execute `simulation/scripts/db/seed/index.ts` with the selected scenario action.
    *   **Start Services Command:** Execute `docker-compose --env-file .env.test -f docker-compose.test.yml up -d --build`.
    *   **Stop Services Command:** Execute `docker-compose --env-file .env.test -f docker-compose.test.yml down -v --remove-orphans`.
    *   **Run UI Tests Option:** Executes the Playwright command (e.g., `pnpm test:e2e:run`).
    *   **Run Backend Test Option:**
        1.  Prompts user to select a scenario (e.g., `base_schedule`, `equipment_conflict`, etc.).
        2.  Executes the corresponding Jest test file (e.g., `pnpm jest tests/integration/scheduler/equipment_conflict.test.ts`).
*   **`package.json` Script:**
    ```json
    // In root package.json
    "scripts": {
      // ... other scripts ...
      "test:e2e:menu": "ts-node simulation/scripts/e2e-runner.ts",
      "test:e2e:run": "playwright test --config=tests/e2e/playwright.config.ts",
      "test:integration": "jest --config=tests/integration/jest.config.integration.js", // Or use root Jest config with path
      "db:seed:staging": "ts-node simulation/scripts/db/seed/index.ts",
      "db:clean:staging": "ts-node simulation/scripts/db/cleanup-staging.ts",
      "db:migrate:prod-staging": "ts-node simulation/scripts/db/migrate-prod-to-staging.ts"
    }
    ```

### 4.2. Aggregated Docker Logs

*   **Recommended Approach: Separate Terminal**
    *   The CLI menu script, when selecting "View Docker Logs", should simply display instructions:
        ```
        To view live logs, please open a new terminal and run:
        docker-compose -f docker-compose.test.yml logs -f --tail=50
        ```

### 4.3. Staging DB Seeding (`simulation/scripts/db/seed/`)

*   **Technology:** Node.js, TypeScript, `@supabase/supabase-js`, `@faker-js/faker`.
*   **`index.ts`:** Orchestrates seeding. Takes arguments (e.g., `baseline --techs=3`, `scenario --name=equipment_conflict`) or runs interactively via `e2e-runner.ts`.
*   **`seed/baseline.ts`:**
    *   Located at `simulation/scripts/db/seed/baseline.ts`.
    *   Responsibility: Create baseline dataset corresponding to `05-merged-custom-test-data.sql` and `06-equipment-requirements-test-data.sql`.
    *   Imports types from `staged.database.types.ts`.
    *   Calls cleanup logic from `../../cleanup-staging.ts`.
    *   Accepts `technicianCount` (1-4) as input.
    *   Connects to Staging Supabase.
    *   Before inserting, it should call the `cleanup-staging.ts` logic or perform equivalent deletions to ensure a clean slate.
    *   Inserts all baseline data (addresses, static equipment, services, ymm_ref, requirements, etc.).
    *   Inserts the specified number of technicians (data into `auth.users`, `public.users`, `public.technicians`). Use a consistent naming/email pattern (e.g., `e2e_tech_1@test.com`) to aid cleanup.
    *   Inserts baseline `vans` (linking to the created technicians).
*   **Scenario Scripts (`simulation/scripts/db/seed/scenarios/*.ts`):**
    *   Responsibility: Add ONLY the dynamic data for a specific test condition **primarily intended for backend scenario tests**. (UI tests might use a simpler baseline or specific fixtures).
    *   Ensure data generated is relationally correct between orders, order_services, jobs, van_equipment, technician_availability_exceptions and their relevant entries in other tables.
    *   Assume the baseline data (with the correct number of techs) already exists.
    *   Use `@supabase/supabase-js` and `@faker-js/faker`.
        1.  **`base_schedule`**: Standard scheduling flow, mix of jobs/priorities, expect successful scheduling or clean overflow.
        2.  **`equipment_conflict`**: Job requires equipment no technician has -> `pending_review`.
        3.  **`bundle_equipment_conflict`**: Multi-job order requires equipment split across techs -> `pending_review`.
        4.  **`fixed_time_today`**: Job fixed for today, ensure scheduling respects it.
        5.  **`fixed_time_future_overflow`**: Job fixed for tomorrow, ensure scheduling respects it.
        6.  **`technician_unavailable_today`**: Tech unavailable for a block today, ensure no jobs scheduled then.
        7.  **`availability_overflow_skip_day`**: All techs unavailable tomorrow, ensure overflow skips to Day+2.
        8.  **`priority_conflict`**: High/Low priority jobs compete, ensure high priority wins under capacity constraint.
        9.  **`same_location_jobs`**: Multiple jobs at one address, test optimizer handling.
        10. **`long_duration_job`**: One very long job, test impact on scheduling capacity.

**Proposed Scenarios:**

1.  **`base_schedule`**:
    *   **Goal:** Test the standard scheduling flow with a mix of jobs and priorities.
    *   **Data:** Several technicians with standard availability and equipment. A handful of orders with 1-2 jobs each, varying locations, durations, and priorities (but no immediate conflicts or impossible constraints). Some jobs should be schedulable today, others might overflow to tomorrow.
    *   **Verification:** Most jobs get assigned (`queued`), potentially some overflow to the next day(s). No `pending_review` expected due to constraints.
2.  **`equipment_conflict`**:
    *   **Goal:** Test handling of jobs requiring unavailable equipment.
    *   **Data:** Similar to `base_schedule`, but include one specific job requiring equipment (e.g., `prog_tool_xyz`) that *no* available technician/van possesses in the static seed data.
    *   **Verification:** The specific job requiring missing equipment ends up as `pending_review`. Other jobs schedule normally.
3.  **`bundle_equipment_conflict`**:
    *   **Goal:** Test handling of multi-job orders where no single tech has all required equipment.
    *   **Data:** One specific order with two jobs. Job A requires `equip_A`, Job B requires `equip_B`. Configure technicians so Tech 1 has `equip_A` (but not `equip_B`), and Tech 2 has `equip_B` (but not `equip_A`). No single tech can do the whole bundle.
    *   **Verification:** Both jobs in the specific order end up as `pending_review` (assuming the logic doesn't split bundles automatically for assignment).
4.  **`fixed_time_today`**:
    *   **Goal:** Test scheduling around a job fixed for today.
    *   **Data:** Similar to `base_schedule`, but one job has `fixed_schedule_time` set for a specific time today (e.g., 2:00 PM).
    *   **Verification:** The fixed job is scheduled for the correct technician at the specified time. Other jobs are scheduled around it.
5.  **`fixed_time_future_overflow`**:
    *   **Goal:** Test scheduling a job fixed for a future day.
    *   **Data:** One job has `fixed_schedule_time` set for tomorrow (Day+1) at a specific time (e.g., 10:00 AM). Include enough other jobs today to potentially cause scheduling pressure.
    *   **Verification:** The fixed job is scheduled correctly for tomorrow. Today's jobs are scheduled, potentially overflowing around the future fixed job if necessary.
6.  **`technician_unavailable_today`**:
    *   **Goal:** Test scheduling around a technician's unavailability period today.
    *   **Data:** Similar to `base_schedule`, but create a `technician_availability_exceptions` record for one specific technician, making them unavailable for a few hours today (e.g., 12:00 PM - 3:00 PM). Ensure there are enough jobs to potentially assign to this tech.
    *   **Verification:** No jobs are assigned to the specific technician during their unavailable period. Jobs are scheduled before/after or assigned to other techs.
7.  **`availability_overflow_skip_day`**:
    *   **Goal:** Test job overflow logic correctly skipping non-working/unavailable days.
    *   **Data:** Enough jobs today to guarantee overflow. Create `technician_availability_exceptions` making *all* technicians unavailable for *all* of tomorrow (Day+1).
    *   **Verification:** Jobs that cannot be scheduled today are scheduled for Day+2 (or the next available day), skipping the fully unavailable Day+1.
8.  **`priority_conflict`**:
    *   **Goal:** Test prioritization under limited capacity.
    *   **Data:** Create more jobs than can realistically be scheduled today. Ensure at least one high-priority job (e.g., priority 10) and several low-priority jobs (e.g., priority 1) compete for the same technician time slots.
    *   **Verification:** The high-priority job gets scheduled, while some/all low-priority jobs end up as `pending_review`.

**New Ideas Inspired by Review:**

9.   **`same_location_jobs`**: Explicitly create the scenario where multiple separate orders/jobs are requested for the exact same address ID on the same day. Verify how the optimizer/scheduler handles this (single visit vs. multiple).
10.   **`long_duration_job`**: Include a job with an unusually long duration that might significantly impact a technician's capacity for the day, testing how it affects other job scheduling.

### 4.4. Staging DB Cleanup (`simulation/scripts/db/cleanup-staging.ts`)

*   Located at `simulation/scripts/db/cleanup-staging.ts`.
*   Imports types from `./seed/staged.database.types.ts`.
*   **Responsibility:** Remove **ALL** data created by the seeding process (both baseline and scenario) to ensure a clean state.
*   **Strategy: Identifier Pattern**
    *   Define a clear pattern for identifying test data (e.g., emails ending in `@e2etest.jam-auto.com`, names/notes prefixed with `[E2E_TEST]`). This pattern must be consistently applied in `baseline.ts` and all scenario scripts.
    *   The script connects to Staging Supabase.
    *   It deletes data matching the pattern from all relevant tables, respecting foreign key constraints (delete jobs, order_services, orders, van_equipment, technician_availability_exceptions, customer_vehicles FIRST, then users/auth.users, addresses, technicians, vans, potentially equipment/services if they were test-specific).
    *   **Include multiple, explicit confirmation prompts** (`inquirer`) before executing deletions.

### 4.5. Playwright UI E2E Test Structure (`tests/e2e/`)

*   Focuses on testing user interactions via the browser.
*   Use subdirectories within `tests/e2e/specs/` for different features (e.g., `auth`, `orders`, `jobs`).   
*   Consider Playwright's global setup/teardown or project dependencies for tasks like logging in a prerequisite test user before running order placement tests. (`playwright.config.ts`).
*   Store base URL (`E2E_BASE_URL`) in `.env.test` and use it in `playwright.config.ts`.

### 4.6. Registration Test (Playwright) (`tests/e2e/specs/registration.spec.ts`)

*   **Functionality (Updated - No Email Confirmation):**
    *   Navigate to registration page.
    *   Use `faker` to generate unique email matching the test pattern (e.g., `e2e_user_${Date.now()}@e2etest.jam-auto.com`), password, name, phone.
    *   Fill form.
    *   Submit.
    *   Assert success (redirect or message).
    *   *(Optional Bonus):* Immediately attempt login.
    *   *(Cleanup):* Rely on `db:clean:staging` script.

### 4.7. Order Placement Tests (Playwright) (`tests/e2e/specs/order-placement.spec.ts`)

*   **Prerequisite:** Requires a logged-in test user (non-admin). This should be handled via:
    *   Playwright's global setup to log in once.
    *   Or a `beforeEach` hook within the spec file to log in.
    *   Or potentially reusing the user created in the registration test if run sequentially.
*   **Static Scenario Test:**
    *   Navigate to the new order page (`/order/new`).
    *   Fill the form with predefined, static data (VIN/YMM, address, date/time, specific services).        
    *   Submit the order.
    *   Assert successful submission confirmation message.
    *   Navigate to the orders page (`/orders`) and assert the new order appears.
*   **Semi-Random Scenario Test:**
    *   Similar to the static test, but use `faker` or random selection for some inputs:
        *   Select a random subset of available services.
        *   Generate slightly varied notes.
        *   Potentially select a date slightly different from the default.
    *   Assert successful submission.

### 4.8. Prod-to-Staging Migration Script (`simulation/scripts/db/migrate-prod-to-staging.ts`)

*   Located at `simulation/scripts/db/migrate-prod-to-staging.ts`.
*   Imports types from `./seed/staged.database.types.ts`.
*   **Technology:** Node.js, TypeScript, `@supabase/supabase-js`, `@faker-js/faker`.
*   **Location:** `simulation/scripts/db/migrate-prod-to-staging.ts`.
*   **Security:** (As before) **NEVER commit Prod creds**, use separate `.env.prod` or prompt, multiple confirmations.
*   **Functionality:**
    1.  Prompt for/load Production credentials securely.
    2.  Connect to both Production and Staging Supabase instances.
    3.  Fetch data from Production tables (e.g., `users`, `addresses`, `orders`, `jobs`, `services`, `equipment`, etc.) - potentially in batches.
    4.  **Anonymize/Mask PII:** Before inserting into Staging, process fetched data:
        *   Replace `users.full_name`, `users.email`, `users.phone` with realistic fake data (using `faker`). Store a mapping if relationships need preserving (e.g., original user ID -> fake user ID).
        *   Consider if `addresses.street_address` needs masking/generalization. Lat/Lng might be less sensitive but should be reviewed.
        *   Review other potentially sensitive fields (`notes`).
    5.  **(Optional) Clear Target Staging Tables:** Prompt user if they want to delete existing data in relevant Staging tables before insertion (use logic similar to `cleanup-staging.ts`).
    6.  Insert processed/anonymized data into Staging tables using batch inserts (`insert([...])`). Handle potential conflicts (`onConflict`) if necessary. Ensure insertion order respects foreign keys.
*   **`package.json` Script:**
    ```json
    // In root package.json
    "scripts": {
      // ... other scripts ...
      "db:migrate:prod-staging": "ts-node simulation/scripts/db/migrate-prod-to-staging.ts"
    }
    ```

### 4.9. Backend Scheduling Scenario Tests (Jest) (`tests/integration/scheduler/`)

*   **Technology:** Jest, TypeScript, `@supabase/supabase-js`, `axios` (or Node Fetch).
*   **Location:** `tests/integration/scheduler/` (or similar).
*   **Purpose:** Validate core scheduler logic under specific data conditions without UI interaction.
*   **Workflow per Test File (e.g., `equipment_conflict.test.ts`):**
    1.  **Setup (`beforeAll` or `beforeEach`):**
        *   Ensure necessary Docker containers (`scheduler`, `optimiser`) are running (or start them via script if not managed by CLI runner).
        *   Call the appropriate seeding script (`db:seed:staging` with relevant scenario args, e.g., `--scenario=equipment_conflict`).
        *   Initialize Supabase client (with service role key).
    2.  **Test Execution (`test` or `it` block):**
        *   Make an HTTP POST request to the scheduler's `/run-replan` API endpoint using `axios` or `fetch`.
        *   Wait for the replan process to likely complete (add a reasonable delay or implement a polling mechanism if the API is asynchronous).
    3.  **Verification:**
        *   Query the Staging Supabase DB using the Supabase client.
        *   Fetch the specific jobs/orders related to the seeded scenario.
        *   Use Jest's `expect` assertions to validate the final state (e.g., `expect(job.status).toBe('pending_review');`).
    4.  **Cleanup:** **No automatic cleanup.** Cleanup is handled manually via the `db:clean:staging` script invoked from the CLI menu, allowing for post-test inspection.

## 5. Workflow Integration

1.  **Setup:** Developer ensures Docker is running, installs deps (`pnpm i`), configures `.env.test` (Staging Supabase keys, `E2E_BASE_URL`, identifier pattern details).
2.  **Run Menu:** Developer runs `pnpm test:e2e:menu`.
3.  **Start Services:** Select "Start Docker Services".
4.  **(Optional) View Logs:** Use "View Docker Logs (Instructions)".
5.  **Run Backend Test:**
    *   Select "Seed Staging Database", choose tech count. Initial seed data populates DB.
    *   Select a Scenario (e.g., `equipment_conflict`). The test is run, populating the DB further and determining the results.
    *   Observe Jest output.
    *   *(Optional)* Manually inspect Staging DB state.
6.  **Run UI Test:**
    *   Select "Seed Staging Database" (potentially with a different baseline/scenario suitable for UI testing, or rely on prerequisite test steps).
    *   Select "Run All UI E2E Tests" or a specific suite.
    *   Observe Playwright output.
7.  **(Manual) Cleanup:** Select "Clean Staging Database" when testing is complete.
8.  **Stop Services:** Select "Stop Docker Services".

## 6. Security & Considerations

*   **Staging DB Credentials:** `.env.test` holds Staging keys.
*   **Production DB Credentials:** Handle securely for migration script.
*   **Data Cleanup:** Crucial to implement the identifier pattern consistently in all seeds and the cleanup script. Regularly verify it only removes test data.
*   **Resource Usage:** Acknowledge demands.
*   **Test Data Overlap:** Cleanup before seeding is key.

## 7. Future Enhancements

*   Integrate test runs into CI/CD pipeline (requires secure credential handling for Staging DB).
*   Add more complex seeding scenarios.
*   Develop more comprehensive Playwright tests covering admin/technician views and other job actions.      
*   Implement visual regression testing with Playwright.
*   Refine the log aggregation view.
```

Relevant Files:
*   `docs/proposals/test-scripts-plan.md` (Generated Plan)
*   `docker-compose.test.yml` (Input: Defines local services)
*   `.env.test` (Input: Configuration source)
*   `tests/e2e/playwright.config.ts` (Referenced: E2E test config)
*   `apps/web/src/app/api/` (Referenced: API endpoints potentially hit by tests)
*   `apps/scheduler/src/scheduler/orchestrator.ts` (Referenced: Core logic tested)
*   `apps/optimiser/main.py` (Referenced: Optimizer service tested)
*   `package.json` (Referenced: Script definitions)