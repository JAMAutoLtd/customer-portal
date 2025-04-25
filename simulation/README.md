# Local Test Environment for Scheduler Application

**Note:** For the primary guide on running end-to-end tests, please refer to [Testing Guide](../../docs/guides/TESTING.md#end-to-end-e2e-tests). This README focuses on the manual setup and details of the simulation environment itself.

This directory contains configuration files and scripts for setting up a local test environment that simulates our Supabase backend.

## Requirements

- Docker and Docker Compose installed and running
- Node.js 16+ with npm

## Components

1. **PostgreSQL**: Local database running on port 5432
2. **PostgREST**: REST API layer that provides a Supabase-like interface on port 3000
3. **Optimize Service**: Local instance of the Python optimization service on port 8080

## Directory Structure

- `docker-compose.yml`: Configuration for PostgreSQL, PostgREST, and Optimize Service containers
- `init-scripts/`: SQL scripts for initializing the database
  - `01-schema.sql`: Creates database schema (tables, relationships)
  - `02-seed-data.sql`: Populates database with test data (Note: This is often superseded by generated data)
  - `07-generated-seed-data.sql`: Dynamically generated data based on test scenarios.
- `pg-api-config.js`: Configuration for PostgREST
- `run-e2e-tests.js`: Script to run end-to-end tests with the local environment (See [Testing Guide](../../docs/guides/TESTING.md) for usage)
- `generate-dynamic-seed.js`: Script used by `run-e2e-tests.js` to generate scenario-specific data.

## Running the Tests

1.  Ensure Docker and Docker Compose are installed and running.
2.  Run the tests from the main project root using the E2E test runner script:
    ```bash
    # Base command (runs default scenario)
    node SIMULATION/run-e2e-tests.js --generate

    # Run a specific scenario
    node SIMULATION/run-e2e-tests.js --generate --scenario=<scenario_name>
    ```
    Replace `<scenario_name>` with one of the implemented scenarios (see `SIMULATION/PLAN.md` for details).

    This command handles:
    *   Generating new seed data (SQL + `seed-metadata.json`) based on the specified (or default) scenario.
    *   Stopping/removing old Docker containers/volumes.
    *   Starting fresh Docker containers (Postgres, PostgREST, Optimize Service).
    *   Waiting for services to be ready.
    *   Running the Jest E2E test suite (`tests/e2e/e2e.test.ts`).
    *   Stopping/removing containers afterwards.

## Argument-Driven Seed Data Generation

The E2E test runner (`run-e2e-tests.js`, documented in the main [Testing Guide](../../docs/guides/TESTING.md)) uses this script (`generate-dynamic-seed.js`) to generate seed data for specific, deterministic scenarios. It creates `init-scripts/07-generated-seed-data.sql` and `seed-metadata.json`, which are used by the tests to verify specific outcomes. Refer to the [Testing Guide](../../docs/guides/TESTING.md#argument-driven-seed-data-generation) for more details on how scenarios are used.

**Purpose:**
Each run of `node SIMULATION/run-e2e-tests.js --generate [--scenario=<name>]` executes the `SIMULATION/generate-dynamic-seed.js` script first.
*   The script uses the `--scenario` argument (or defaults if none provided) to force specific conditions into the generated data (e.g., creating jobs requiring missing equipment, splitting equipment for bundles across vans).
*   It creates `SIMULATION/init-scripts/07-generated-seed-data.sql` with the SQL data for the scenario.
*   It creates `SIMULATION/seed-metadata.json`: A JSON file detailing the specific IDs (jobs, orders, etc.) relevant to verifying the outcome of the forced scenario. This file is read by the Jest tests (`tests/e2e/e2e.test.ts`) to perform dynamic, robust assertions without hardcoded values.

This ensures specific scheduler behaviors and edge cases can be tested reliably and predictably.

**Configuration:**
The core logic for each scenario is within `SIMULATION/generate-dynamic-seed.js`. Constants for general generation (min/max orders etc.) are at the top of that file.

**Running the Generator (Standalone - Generally Not Needed):**
If you only want to generate new seed data for a specific scenario without running the full E2E test suite, you can run the generator script directly (from the project root):
```bash
node SIMULATION/generate-dynamic-seed.js --scenario=<scenario_name>
```
**Important:** This command **overwrites** `init-scripts/07-generated-seed-data.sql` and `seed-metadata.json`. To use this newly generated data for testing, you would typically run the main test command afterwards: `node SIMULATION/run-e2e-tests.js --generate --scenario=<scenario_name>`.

## Manual Setup

If you want to run the local environment manually (e.g., for debugging or direct interaction):

1. Start the containers:
   ```bash
   # Ensure you are in the root directory of the project
   pnpm run sim:up
   # Or manually:
   # cd simulation
   # docker-compose up -d
   ```

2. Access the database:
   ```bash
   # Connect to PostgreSQL
   docker-compose exec postgres psql -U postgres -d scheduler_test_db
   
   # Or use your preferred PostgreSQL client with:
   # Host: localhost
   # Port: 5432
   # User: postgres
   # Password: postgres
   # Database: scheduler_test_db
   ```

3. Access the REST API:
   The PostgREST API is available at http://localhost:3000/

4. Access the Optimize Service:
   The optimization service API is available at http://localhost:8080/
   - Health check: http://localhost:8080/health
   - API documentation: http://localhost:8080/docs
   - Optimization endpoint: http://localhost:8080/optimize-schedule

5. To stop the environment:
   ```bash
   # From the project root:
   pnpm run sim:down
   # Or manually:
   # cd simulation
   # docker-compose down
   ```

## Customizing Test Data

To modify the test data:

1. Edit `init-scripts/02-seed-data.sql`
2. Restart the containers:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## Integration with Application

The application is configured to use this local environment when:

1. The `.env.test` file is loaded
2. Environment variables point to:
   - `SUPABASE_URL=http://localhost:3000`
   - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scheduler_test_db`
   - `OPTIMIZATION_SERVICE_URL=http://localhost:8080/optimize-schedule`

## Writing E2E Tests

When creating new end-to-end tests:

1. Place test files in `tests/e2e/`
2. Use the Supabase client initialized with the test environment URLs
3. Choose whether to use mocks or the real optimization service:
   ```typescript
   // Check the environment variable to conditionally set up mocks
   const useRealOptimizationService = process.env.RUN_REAL_OPTIMIZE === 'true';
   
   if (!useRealOptimizationService) {
     // Set up mocks
     jest.mock('axios');
     // ...
   }
   ```
4. Ensure proper cleanup after tests

### Running E2E Tests

The primary script to run the E2E tests is defined in `package.json`:

```bash
npm run test:e2e
```

This script automates the following steps:

1.  **Generates Seed Data:** Runs `node SIMULATION/generate-seed.js` to create:
    *   `SIMULATION/init-scripts/02-seed-data.sql`: Randomized SQL data for the database.
    *   `SIMULATION/seed-metadata.json`: A JSON file containing metadata about the generated scenario (e.g., job IDs with fixed times, potentially unschedulable jobs due to equipment).
2.  **Restarts Docker Environment:** Uses `docker-compose` to stop, remove volumes (`down -v`), and restart the `postgres`, `postgrest`, and `optimize-service` containers (`up --build -d --wait`). This ensures a clean state with the newly generated seed data applied by the `init-scripts`.
3.  **Runs Jest Tests:** Executes `jest --config ./jest.e2e.config.js --detectOpenHandles tests/e2e/e2e.test.ts`.

The `e2e.test.ts` file reads the `seed-metadata.json` and uses it to perform dynamic assertions based on the specific data generated for that test run.

**Note on Potential Flakiness:** The E2E tests rely on reading the database state after the `runFullReplan` function completes. Due to the asynchronous nature of database updates, there's a small chance the test might read the database *before* the final updates are fully consistent, potentially leading to flaky test results. If this occurs frequently, reintroducing a brief, targeted retry mechanism or wait strategy within the test assertions might be necessary.

**Note on Handling Missing Jobs:** If the test logs warnings like "... job X from metadata not found in final results", it means a job expected based on the seed metadata wasn't present after the replan. This could indicate an error during the replanning process or potentially expected behavior (e.g., if the system could delete jobs). Currently, the test only warns; investigate these warnings if they appear, as they might signal underlying issues.

### Real Optimization Service

To run E2E tests against a non-Dockerized instance of the `optimize-service`, refer to the instructions in the [Testing Guide](../../docs/guides/TESTING.md#running-against-a-real-optimization-service). 