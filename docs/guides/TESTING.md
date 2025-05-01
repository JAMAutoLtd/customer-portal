# Testing Guide

This guide details the End-to-End (E2E) and Integration testing framework for the JAM Auto application suite. It allows developers to validate application functionality against a Staging database using locally run services.

## 1. Overview

The testing framework leverages Docker Compose (`docker-compose.test.yml`) to run local instances of the `web`, `scheduler`, and `optimiser` services, configured via `.env.test` to connect to the designated **Staging Supabase instance**.

A Command-Line Interface (CLI) script (`simulation/scripts/e2e-runner.ts`) provides a user-friendly way to manage the test environment, including:
*   Starting/Stopping Docker services.
*   Seeding the Staging database with baseline data and specific test scenarios.
*   Cleaning test data from the Staging database.
*   Running UI E2E tests (Playwright).
*   Running Backend Integration tests (Jest).

## 2. Setup

1.  **Prerequisites:** Ensure Docker Desktop is installed and running.
2.  **Dependencies:** Run `pnpm install` from the project root.
3.  **Environment Configuration:**
    *   Copy `.env.example` to `.env.test` in the project root if it doesn't exist.
    *   Fill in the required variables in `.env.test`, especially:
        *   `SUPABASE_URL`: URL of the **Staging** Supabase instance.
        *   `SUPABASE_ANON_KEY`: Anon key for the **Staging** instance.
        *   `SUPABASE_SERVICE_ROLE_KEY`: Service Role key for the **Staging** instance.
        *   `SCHEDULER_HOST_URL=http://localhost:3001` (or the port mapped in `docker-compose.test.yml`)
        *   `E2E_BASE_URL=http://localhost:3000` (or the port mapped for the web app)
        *   Potentially `ONESTEP_GPS_API_KEY` and `GOOGLE_MAPS_API_KEY` if needed for specific test scenarios hitting those APIs.
        *   Database connection details for the local simulation DB if different from Supabase staging (review `docker-compose.test.yml`).

## 3. CLI Runner (`e2e-runner.ts`)

The primary interface for interacting with the testing framework is the CLI runner script.

*   **Location:** `simulation/scripts/e2e-runner.ts`
*   **Run Command (from project root):**
    ```bash
    pnpm test:e2e:menu
    ```
*   **Features:** Provides an interactive menu (`inquirer`) to perform various testing tasks.

### CLI Menu Options:

*   **Start Docker Services (Test Env):** Runs `docker-compose -f docker-compose.test.yml --env-file .env.test up -d --build`. Starts the `web`, `scheduler`, and `optimiser` containers locally.
*   **Stop Docker Services (Test Env):** Runs `docker-compose -f docker-compose.test.yml --env-file .env.test down -v --remove-orphans`. Stops and removes the test containers.
*   **View Docker Logs (Instructions):** Provides instructions to view logs in a separate terminal: `docker-compose -f docker-compose.test.yml logs -f --tail=50`.
*   **Seed Staging Database (Baseline + Scenario):**
    1.  Prompts for the number of baseline technicians (1-4).
    2.  Runs the baseline seeding script (`simulation/scripts/db/seed/baseline.ts` via `index.ts`). This cleans previous test data and creates baseline records (addresses, services, specified technicians, vans, etc.). Outputs `.baseline-metadata.json`.
    3.  Prompts to select a specific test scenario (`simulation/scripts/db/seed/scenarios/*.ts`) or 'None'.
    4.  If a scenario is selected, runs the corresponding scenario seeding script, layering data on top of the baseline. Outputs `.current-scenario-metadata.json`.
*   **Clean Staging Database (ALL Test Data):** Runs the cleanup script (`simulation/scripts/db/cleanup-staging.ts`), which removes data identified by specific test patterns (e.g., email domains, name prefixes) and **requires explicit confirmation** before proceeding.
*   **Run ALL UI E2E Tests (Playwright):** Executes `pnpm test:e2e:run`, which runs all Playwright tests defined in `tests/e2e/specs/`.
*   **Run Specific UI E2E Suite (Playwright):** (If implemented in runner) Prompts for a specific Playwright test file and runs it.
*   **Run Backend Scenario Test (Jest - Select Scenario):**
    1.  Prompts to select a scenario (e.g., `locked_job_impact`).
    2.  Executes the corresponding Jest integration test file (e.g., `pnpm jest tests/integration/scheduler/locked_job_impact.test.ts`). **Note:** This option *only* runs the test; seeding must be done separately via the "Seed Staging Database" option first.
*   **Run Full Scenario Test (Clean -> Seed -> Jest -> Playwright):** (Conceptual - may require implementation in runner) Automates the typical flow for testing a specific scenario end-to-end.
*   **Migrate Production Data to Staging:** Runs the migration script (`simulation/scripts/db/migrate-prod-to-staging.ts`). **Use with extreme caution.** Requires secure handling of Production credentials and multiple confirmations. Anonymizes PII before inserting into Staging.
*   **Exit:** Closes the CLI runner.

## 4. Database Seeding

*   **Location:** `simulation/scripts/db/seed/`
*   **Entry Point:** `index.ts` (executed by `pnpm db:seed:staging`)
*   **Baseline (`baseline.ts`):** Creates foundational data required for most tests (addresses, services, equipment, technicians, users, vans). Parameterized by the number of technicians. Outputs `.baseline-metadata.json`.
*   **Scenarios (`scenarios/*.ts`):** Create specific data conditions on top of the baseline to test particular scheduler behaviors or UI flows. See individual scenario files for details. Outputs `.current-scenario-metadata.json`.
*   **Types (`staged.database.types.ts`):** Contains generated Supabase types used by the seeding scripts.

### Available Scenarios (for Integration Tests):

See `simulation/scripts/db/seed/scenarios/` directory and descriptions within each file. Key scenarios include:
*   `base_schedule`: Standard flow.
*   `equipment_conflict`: Job needs unavailable equipment.
*   `bundle_equipment_conflict`: Bundle needs equipment split across techs.
*   `fixed_time_today`: Job fixed for today.
*   `fixed_time_future_overflow`: Job fixed for tomorrow.
*   `technician_unavailable_today`: Tech has a time-off exception today.
*   `availability_overflow_skip_day`: All techs unavailable tomorrow.
*   `priority_conflict`: High vs. low priority job contention.
*   `same_location_jobs`: Multiple jobs at the same address.
*   `long_duration_job`: A single very long job.
*   `unschedulable_fixed_time`: Fixed time conflicts with unavailability exception.
*   `locked_job_impact`: Queued jobs scheduled around an `en_route`/`in_progress` job.

## 5. Backend Integration Tests (Jest)

*   **Location:** `tests/integration/scheduler/`
*   **Configuration:** `tests/integration/jest.config.integration.js` (or root `jest.config.js`), `tests/integration/setupEnv.ts` (loads `.env.test`).
*   **Purpose:** Validate scheduler logic against specific database states prepared by scenario seeding.
*   **Workflow:**
    1.  **Setup (`beforeAll`):** Use utils (`tests/integration/scheduler/utils.ts`) to get a Supabase client and read metadata from the `.current-scenario-metadata.json` file generated during seeding.
    2.  **Execution (`it` block):**
        *   Fetch initial state of relevant jobs/techs from the DB.
        *   Trigger the scheduler replan via the API (`triggerSchedulerReplan` util -> POST `/run-replan`).
        *   Wait for completion (`waitForReplan` util - polls DB for expected state changes).
        *   Fetch the final state of relevant jobs/techs from the DB.
    3.  **Verification:** Use Jest `expect` assertions to validate job statuses, assignments, estimated schedules, etc., against the expected outcome for the scenario.
    4.  **Cleanup (`afterAll`):** Use the `cleanupScenarioData` util to remove data created *specifically* by the current scenario run (using IDs from metadata). Does **not** typically clean baseline data between scenario tests.

## 6. UI End-to-End Tests (Playwright)

*   **Location:** `tests/e2e/`
*   **Configuration:** `tests/e2e/playwright.config.ts` (uses `E2E_BASE_URL` from `.env.test`).
*   **Purpose:** Simulate user interactions with the `web` application running locally.
*   **Specs (`specs/*.spec.ts`):** Contain the actual test logic (navigation, interaction, assertions).
    *   `registration.spec.ts`: Tests user registration flow.
    *   `order-placement.spec.ts`: Tests placing an order as a logged-in user.
*   **Workflow:**
    1.  Ensure the `web` service (and potentially backend services/DB) are running via Docker Compose.
    2.  Run tests via the CLI runner or `pnpm test:e2e:run`.
    3.  Playwright launches browser(s), navigates to the `E2E_BASE_URL`, performs actions defined in specs (filling forms, clicking buttons), and asserts expected UI changes or results.

## 7. Database Cleanup

*   **Script:** `simulation/scripts/db/cleanup-staging.ts` (executed by `pnpm db:clean:staging`)
*   **Purpose:** Removes **all** data potentially created by testing (baseline technicians/users, scenario jobs/orders/exceptions, etc.) based on identifier patterns.
*   **Requires multiple confirmations** before execution. Use this when you want to reset the Staging DB to a clean state (before initial baseline seeding or after extensive testing).

## 8. Production to Staging Migration

*   **Script:** `simulation/scripts/db/migrate-prod-to-staging.ts` (executed by `pnpm db:migrate:prod-staging`)
*   **Purpose:** Copies data from Production to Staging, **anonymizing PII** in the process.
*   **Use with extreme caution.** Requires secure handling of Production credentials.
*   Useful for populating Staging with realistic (but anonymized) data volumes and structures for testing. 