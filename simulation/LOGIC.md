### E2E Test Orchestration (`SIMULATION/run-e2e-tests.js`)

*   **Purpose**: Automates the execution of end-to-end tests within the simulated Docker environment.
*   **Key Steps**:
    *   Parses command-line arguments (`--generate`, `--skip-docker`, etc.).
    *   Optionally runs the `generate-seed.js` script to create fresh test data (`02-seed-data.sql`) and metadata (`seed-metadata.json`).
    *   Manages the Docker environment (stops/removes old containers, starts services defined in `docker-compose.yml`).
    *   Waits for the database, PostgREST, and optimization services to become available.
    *   Executes the Jest E2E test suite (`tests/e2e/e2e.test.ts`).
    *   Stops and removes the Docker containers after tests complete.
*   **Output**: Logs the setup process, Jest test results, and any errors encountered.

### E2E Test Suite (`tests/e2e/e2e.test.ts`)

*   **Purpose**: Contains the actual end-to-end test logic using Jest.
*   **Setup (`beforeAll`)**: Loads the `seed-metadata.json` file to understand the specific scenario generated (e.g., which jobs have fixed times, which might be unschedulable).
*   **Main Test Case (`should successfully process...`)**:
    *   Calls the main `runFullReplan` function from the orchestrator.
    *   **Handles unschedulable jobs**: Expects `runFullReplan` to complete successfully even if the optimizer cannot schedule all jobs. Jobs that cannot be scheduled due to constraints (time, equipment, etc.) are expected to be moved to the `pending_review` status by the orchestrator.
    *   Fetches the final state of all initially queued jobs (identified via `seed-metadata.json`) from the test database.
    *   Asserts that every fetched job has a final status of either `queued` (successfully scheduled) or `pending_review`.
    *   Performs specific assertions based on the loaded `seed-metadata.json`:
        *   Verifies `queued` jobs have an assigned technician and schedule time.
        *   Verifies `pending_review` jobs do *not* have an assigned technician or schedule time.
        *   Checks that non-weekend `fixedTimeJobs` were scheduled correctly (status is `queued`).
        *   Checks that `weekendFixedTimeJobs` were *not* scheduled (status is `pending_review`).
        *   Checks that jobs scheduled after an `earliest_available_time` constraint respect that time.
        *   Checks that jobs flagged as potentially unschedulable due to equipment end up as `pending_review`.
*   **Summary Output**: After `runFullReplan` completes (successfully or with handled errors like "no routes assigned"), a summary section is logged to the console detailing:
    *   Each technician's ID, name, van ID, home location, and assigned equipment.
    *   A list of jobs assigned to each technician, sorted by estimated schedule time.
    *   A list of job IDs that ended up in the `pending_review` status.
*   **Failure Test Case (`should handle optimization service request failure...`)**: Tests that if the code fails to *communicate* with the optimization service (e.g., invalid request payload causing a 4xx error), an error is thrown, and the initial job state remains unchanged.
