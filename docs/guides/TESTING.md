## Testing Guide

This guide outlines the different types of tests available in the repository (Unit, Integration, End-to-End) and provides instructions on how to run them.

### Prerequisites

*   **Node.js & pnpm:** Ensure you have Node.js (v18+) and pnpm installed.
*   **Docker & Docker Compose:** Required for running the E2E simulation environment. Ensure Docker Desktop or Docker Engine is running.
*   **Python & pip:** Required for running the `optimiser` service unit tests (specifically `pytest`). Ensure Python 3.10+ is installed and dependencies from `apps/optimiser/requirements.txt` are installed in your Python environment (e.g., `pip install -r apps/optimiser/requirements.txt`).

**Important:** All commands listed below should generally be executed from the **root directory** of the monorepo unless otherwise specified. The root `package.json` contains scripts designed to manage the execution context for each application.

### Unit Tests

Unit tests focus on testing individual modules or functions in isolation.

1.  **Scheduler Service (`apps/scheduler`)**
    *   **Framework:** Jest (configured via `jest.config.base.js` and `ts-jest`).
    *   **Location:** `apps/scheduler/tests/` (excluding the `e2e` subdirectory).
    *   **Command:**
        ```bash
        pnpm run test:scheduler
        ```
    *   **Notes:** This command executes Jest using the configuration defined in the root `jest.config.base.js` specifically for the `scheduler` project. It requires environment variables defined in `.env.test` (loaded via `dotenv/config` in Jest setup). External dependencies like Supabase client, Google Maps client, and `axios` are typically mocked within these tests.

2.  **Optimiser Service (`apps/optimiser`)**
    *   **Framework:** Pytest.
    *   **Location:** `apps/optimiser/tests/`.
    *   **Command:**
        ```bash
        pnpm run test:optimiser
        ```
    *   **Notes:** This command changes the directory to `apps/optimiser` and runs `pytest`. Requires a Python environment with `pytest` and other dependencies from `apps/optimiser/requirements.txt` installed.

3.  **Web Application (`apps/web`)**
    *   **Status:** Based on the provided `jest.config.base.js`, there is no active Jest unit test configuration specifically set up for the `apps/web` frontend application.
    *   **Linting:** You can run lint checks using the root lint command:
        ```bash
        pnpm run lint
        ```

### Integration Tests

There isn't a separate, distinct suite explicitly labeled "Integration Tests". The **End-to-End (E2E) tests** serve as the primary integration tests, verifying the interaction between the scheduler service, the (simulated) database, and the (simulated or real) optimization service.

### End-to-End (E2E) Tests

E2E tests validate the entire scheduling workflow within a simulated environment.

1.  **Purpose:**
    *   To verify the `runFullReplan` orchestration logic in `apps/scheduler`.
    *   To test the interaction between the scheduler, the database (via PostgREST), and the optimizer service under various scenarios.
    *   To ensure jobs are correctly scheduled, marked for review, or overflowed based on constraints like time, equipment, and availability exceptions.

2.  **Simulation Environment (`simulation/`)**
    *   **Role:** Provides a local, isolated environment mimicking the production backend dependencies using Docker Compose.
    *   **Components:**
        *   `postgres`: PostgreSQL database initialized with the project schema (`01-schema.sql`) and test data (`05-merged-custom-test-data.sql`, `06-equipment-requirements-test-data.sql`, `07-generated-seed-data.sql`).
        *   `postgrest`: Provides a Supabase-like REST API layer over the PostgreSQL database.
        *   `nginx`: Acts as a reverse proxy for PostgREST to simulate the Supabase API gateway structure (e.g., requests go to `/rest/v1/...`).
        *   `optimize-service`: A container running the Python optimization service (`apps/optimiser`).
    *   **Data Generation:** The environment uses a dynamic seed generator (`simulation/generate-dynamic-seed.js`) to create randomized but scenario-specific test data (`07-generated-seed-data.sql`) and corresponding metadata (`simulation/seed-metadata.json`). This metadata is crucial for the tests to perform targeted assertions.
    *   **Setup:** Managed automatically by the `simulation/run-e2e-tests.js` script. Ensure Docker is running before executing the tests.

3.  **Running the E2E Test Suite:**
    *   **Main Command:** Use the script defined in the root `package.json`:
        ```bash
        pnpm run test:e2e
        ```
    *   **Execution Flow:** This command triggers `node simulation/run-e2e-tests.js`, which orchestrates the following:
        *   **(Optional `--generate` / `-g`):** Runs `simulation/generate-dynamic-seed.js` to create fresh SQL data (`07-...sql`) and metadata (`seed-metadata.json`). **Using `--generate` is highly recommended for most runs to ensure tests run against fresh, predictable data.**
        *   **(Optional `--scenario <name>`):** Specifies a scenario for the data generator (e.g., `missing-equipment`, `weekend-fixed`). If omitted, a default scenario is used.
        *   **Docker Management:** Stops/removes existing simulation containers and volumes (`docker-compose down -v --remove-orphans`).
        *   **Service Startup:** Starts the simulation environment services (`docker-compose up -d --build`).
        *   **Initialization:** Executes initialization scripts (`init-scripts/*.sql`) inside the `postgres` container.
        *   **Wait:** Waits for the database, PostgREST, and optimizer services to become ready.
        *   **Jest Execution:** Runs the E2E tests located in `apps/scheduler/tests/e2e/` using `jest --config jest.e2e.config.js`. The tests use the environment variables defined in `.env.test` (pointing to the simulation services) and read `simulation/seed-metadata.json` for scenario-specific assertions.
        *   **Build-time Variables:** The script ensures the correct environment variables (from `.env.test`) are available *during* the `docker-compose build` phase (especially for the `web` service) by using the `--env-file ../.env.test` flag when invoking `docker-compose`.
        *   **Cleanup:** Stops and removes the simulation containers (`docker-compose down -v --remove-orphans`), unless tests fail *and* the `--keep-containers-on-fail` flag is used.
    *   **Examples:**
        ```bash
        # Run E2E tests with newly generated default data
        pnpm run test:e2e --generate

        # Generate data for a specific scenario and run tests
        pnpm run test:e2e --generate --scenario=missing-equipment

        # Run tests against existing data (if present and valid)
        pnpm run test:e2e

        # Run tests, but keep containers running if tests fail
        pnpm run test:e2e --generate --keep-containers-on-fail
        ```

4.  **Understanding E2E Output:**
    *   The `run-e2e-tests.js` script logs setup steps (Docker, seeding).
    *   Jest outputs the results of the tests defined in `apps/scheduler/tests/e2e/e2e.test.ts`.
    *   The tests themselves (and the `orchestrator.ts` function being tested) log detailed information about the scheduling process, including a final summary of technician assignments and any jobs left in `pending_review`.
    *   The `simulation/seed-metadata.json` file contains details about the specific jobs, orders, and constraints generated for the test run, which helps in interpreting the results and debugging failures.

---

**Relevant Files Used:**

*   `README.md`
*   `package.json`
*   `apps/scheduler/package.json`
*   `apps/optimiser/requirements.txt`
*   `simulation/README.md`
*   `simulation/LOGIC.md`
*   `simulation/INVESTIGATIONS.md`
*   `simulation/run-e2e-tests.js`
*   `simulation/generate-dynamic-seed.js`
*   `simulation/seed-metadata.json`
*   `jest.config.base.js`
*   `jest.e2e.config.js`
*   `apps/scheduler/tests/e2e/e2e.test.ts` 