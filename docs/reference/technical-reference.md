# Technical Reference: Dynamic Job Scheduler Backend

This document provides detailed technical documentation for the components of the Dynamic Job Scheduler backend.

## 1. Package Documentation: Node.js Scheduler (`apps/scheduler/src/`)

### 1.1 Package Summary

This package contains the primary Node.js/TypeScript application responsible for orchestrating the job scheduling workflow. It interacts with the Supabase database, fetches real-time locations via One Step GPS, prepares data for optimization, calls the external Python optimization service, processes the results, and updates the job statuses in the database.

### 1.2 Detailed Documentation of Public Features / API / Interface

The primary public interface is the entry point that executes `runFullReplan` or the `/run-replan` HTTP endpoint if run as a server.

**`apps/scheduler/src/index.ts` / `apps/scheduler/src/server.ts`**

*   **Purpose:** Main entry point(s) for the Node.js scheduler application.
*   **Functionality (`index.ts` - Direct Run):**
    *   Initializes the Supabase client using environment variables (`apps/scheduler/src/supabase/client.ts`).
    *   Calls `runFullReplan` from `apps/scheduler/src/scheduler/orchestrator.ts` to start the scheduling process.
    *   Handles top-level success and error logging, and exits the process with appropriate status codes.
*   **Functionality (`server.ts` - HTTP Server):**
    *   Sets up an Express server.
    *   Defines a `/run-replan` endpoint (POST) that triggers `runFullReplan`.
    *   Defines a `/health` endpoint (GET).
    *   Listens on a port (e.g., 8080).

**`apps/scheduler/src/scheduler/orchestrator.ts`**

*   `runFullReplan(dbClient: SupabaseClient<any>): Promise<void>`
    *   **Purpose:** Orchestrates the entire job replanning process, including multi-day overflow handling and real-time location fetching.
    *   **Parameters:**
        *   `dbClient`: An initialized Supabase client instance.
    *   **Returns:** `Promise<void>` - Resolves when the process completes successfully, rejects on critical failure.
    *   **Workflow:** (High-Level)
        1.  **Init:** Initialize internal state (`finalAssignments` Map, `jobsToPlan` Set).
        2.  **Fetch Initial Data:** Get active technicians (including van/home location and `onestepgps_device_id`), relevant jobs (`queued`, `locked`, `fixed_time`). Populate `jobsToPlan` with `queued` job IDs.
        3.  **Fetch Real-time Locations:** Calls `fetchDeviceLocations` (`apps/scheduler/src/onestepgps/client.ts`). If successful, updates the `current_location` of technicians *in memory* based on their van's `onestepgps_device_id`.
        4.  **Separate Jobs:** Identify `lockedJobs` and `fixedTimeJobs` for constraint handling.
        5.  **Pass 1 (Today):**
            *   If `jobsToPlan` is empty, skip to Final Update.
            *   Calculate today's availability using *updated `current_location`* and `lockedJobs`.
            *   Fetch job details for IDs in `jobsToPlan`.
            *   Bundle (`bundleQueuedJobs`), check eligibility (`determineTechnicianEligibility`), prepare payload (`prepareOptimizationPayload`) for jobs in `jobsToPlan`.
            *   Call optimization service (`callOptimizationService`).
            *   Process results (`processOptimizationResults`): Update `finalAssignments` Map for scheduled jobs, remove scheduled job IDs from `jobsToPlan` Set.
        6.  **Overflow Loop (Pass 2+):**
            *   Iterates for subsequent days (up to `MAX_OVERFLOW_ATTEMPTS`) if `jobsToPlan` is not empty. Skips weekends.
            *   Fetches technicians (with *home locations*) and details for jobs still in `jobsToPlan`.
            *   Calculates availability for the *future* date (using *home locations*).
            *   If no availability, skips day.
            *   Bundle, check eligibility, prepare payload for jobs in `jobsToPlan` using future availability.
            *   Call optimization service.
            *   Process results: Update `finalAssignments`, remove scheduled job IDs from `jobsToPlan`.
        7.  **Final Update:** Performs a single batch database update via `updateJobs`:
            *   For jobs in `finalAssignments`: Set `status = 'queued'`, `assigned_technician`, `estimated_sched`.
            *   For jobs remaining in `jobsToPlan`: Set `status = 'pending_review'`, clear assignment/schedule.
        8. **Log Summary:** Generate and log technician schedules.

**`apps/scheduler/src/supabase/client.ts`**

*   `supabase: SupabaseClient`: Exported initialized Supabase client instance configured using `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables (Service Role Key is required for backend operations like batch updates).

**`apps/scheduler/src/supabase/jobs.ts`**

*   `getRelevantJobs(): Promise<Job[]>`: Fetches jobs with statuses likely needing scheduling ('queued', 'pending_review', 'en_route', 'in_progress', or 'fixed_time'). Includes joined `addresses`, `services`, and `orders` (for `earliest_available_time`, `created_at`).
*   `getJobsByStatus(statuses: JobStatus[]): Promise<Job[]>`: Fetches jobs matching the provided list of statuses. Includes the same joins as `getRelevantJobs`.

**`apps/scheduler/src/supabase/technicians.ts`**

*   `getActiveTechnicians(): Promise<Technician[]>`: Fetches technicians, performing inner joins on `users` and `users.addresses` (for home location), and an outer join on `vans` (for `current_location` and `onestepgps_device_id`). Returns technicians with `home_location` and potentially `current_location` derived from the van.

**`apps/scheduler/src/supabase/equipment.ts`**

*   `getEquipmentForVans(vanIds: number[]): Promise<Map<number, VanEquipment[]>>`: Fetches equipment assigned to the specified van IDs, joining `equipment` details. Returns a map where keys are `van_id` and values are arrays of `VanEquipment`.
*   `getRequiredEquipmentForJob(job: Job): Promise<string[]>`: Determines the required equipment model names for a given job. It fetches the `ymm_id` for the job's order (using `getYmmIdForOrder`) and queries the appropriate `*_equipment_requirements` table based on the job's service category.

**`apps/scheduler/src/supabase/orders.ts`**

*   `getYmmIdForOrder(orderId: number): Promise<number | null>`: Fetches the `ymm_id` (Year-Make-Model ID) associated with a specific `order_id` by querying through the `orders` and `customer_vehicles` tables to match against the `ymm_ref` table.

**`apps/scheduler/src/google/maps.ts`**

*   `getTravelTime(origin: LatLngLiteral, destination: LatLngLiteral): Promise<number | null>`: Calculates driving travel time in seconds between two points using the Google Maps Distance Matrix API. Uses `GOOGLE_MAPS_API_KEY`. Includes an in-memory cache with a 1-hour TTL to reduce API calls. Returns `null` on API error.

**`apps/scheduler/src/onestepgps/client.ts`**

*   `fetchDeviceLocations(): Promise<Map<string, { lat: number; lng: number; timestamp: string }>>`: Fetches real-time locations for devices from the One Step GPS API `/device-info` endpoint.
    *   Uses the `ONESTEP_GPS_API_KEY` environment variable.
    *   Parses the response into a Map where the key is the `device_id` (string) and the value contains `lat`, `lng`, and `timestamp`.
    *   Returns the Map on success, throws an error on failure.

**`apps/scheduler/src/scheduler/availability.ts`**

*   `calculateTechnicianAvailability(technicians: Technician[], lockedJobs: Job[]): void`: Calculates availability for the *current day* (based on the current date and 09:00-18:30 UTC work window). It considers `lockedJobs` to determine the earliest available time and updates `current_location` based on the last locked job's address. Updates technician objects *in place*. *(Note: This uses a fixed window; integration with `technician_default_hours` / `technician_availability_exceptions` tables is not yet implemented).*
*   `calculateAvailabilityForDay(technicians: Technician[], targetDate: Date): TechnicianAvailability[]`: Calculates availability for a *specific future day* based on the 09:00-18:30 UTC work window (Mon-Fri only). Uses technician *home locations* as the start location. Returns an array of `TechnicianAvailability` objects. *(Note: Also uses fixed window).*

**`apps/scheduler/src/scheduler/bundling.ts`**

*   `bundleQueuedJobs(queuedJobs: Job[]): SchedulableItem[]`: Groups jobs with the same `order_id` into `JobBundle` objects or leaves them as `SchedulableJob` objects if they are the only job for an order. Calculates `total_duration` and `priority` for bundles.

**`apps/scheduler/src/scheduler/eligibility.ts`**

*   `determineTechnicianEligibility(initialItems: SchedulableItem[], technicians: Technician[]): Promise<SchedulableItem[]>`: Checks if technicians have the required equipment (determined via `getRequiredEquipmentForJob`) based on their van's inventory (`getEquipmentForVans`). Updates `eligibleTechnicians` (for `SchedulableJob`) or `eligible_technician_ids` (for `JobBundle`). If no single technician is eligible for a `JobBundle`, it breaks the bundle into individual `SchedulableJob` items and recalculates eligibility for them.

**`apps/scheduler/src/scheduler/payload.ts`**

*   `prepareOptimizationPayload(technicians: Technician[], items: SchedulableItem[], fixedTimeJobs: Job[], technicianAvailability?: TechnicianAvailability[]): Promise<OptimizationRequestPayload>`: Constructs the JSON payload for the optimization service. It indexes locations, calculates the travel time matrix (using `getTravelTime`), formats technician data (using current or future availability from `technicianAvailability`), formats items (including earliest start time constraints from `orders.earliest_available_time`), and adds fixed time constraints. Handles potential clashes between technician start locations and item locations by slightly perturbing technician start coordinates if necessary.

**`apps/scheduler/src/scheduler/optimize.ts`**

*   `callOptimizationService(payload: OptimizationRequestPayload): Promise<OptimizationResponsePayload>`: Sends the prepared payload via HTTP POST to the `OPTIMIZER_URL` environment variable using `axios`. Handles responses and throws errors on failure or if the service returns a status of `'error'`.

**`apps/scheduler/src/scheduler/results.ts`**

*   `processOptimizationResults(response: OptimizationResponsePayload, eligibleItemMap: Map<string, SchedulableItem>): ProcessedSchedule`: Parses the response from the optimization service. It requires a map (`eligibleItemMap`) linking the item IDs sent to the optimizer (e.g., `job_123`, `bundle_45`) back to the original `SchedulableItem` objects to correctly map bundle results back to constituent job IDs. Returns a `ProcessedSchedule` object containing an array of `ScheduledJobUpdate` for successfully scheduled jobs and an array of unassigned item IDs.

**`apps/scheduler/src/db/update.ts`**

*   `updateJobs(supabase: SupabaseClient<any>, updates: JobUpdateOperation[]): Promise<void>`: Performs batch updates on the `jobs` table. It groups updates by the fields being changed to minimize the number of requests to Supabase. Updates `status`, `assigned_technician`, and `estimated_sched`.

**`apps/scheduler/src/types/`**

*   **`database.types.ts`**: Contains TypeScript interfaces generated from the Supabase schema, representing tables (e.g., `Job`, `Technician`, `Address`, `Service`, `Van`, `Equipment`, `YmmRef`, `Order`, `User`) and derived types used in scheduling (`JobBundle`, `SchedulableJob`, `SchedulableItem`, `TechnicianAvailability`).
*   **`optimization.types.ts`**: Contains TypeScript interfaces defining the structure of the request (`OptimizationRequestPayload`) and response (`OptimizationResponsePayload`) payloads exchanged with the Python optimization microservice.

### 1.3 Dependencies and Requirements

*   **Node.js:** v18 or higher recommended (check `Dockerfile`).
*   **pnpm:** Used for package management in the monorepo.
*   **Major Dependencies (`apps/scheduler/package.json`):**
    *   `@supabase/supabase-js`: Client library for Supabase interaction.
    *   `@googlemaps/google-maps-services-js`: Client library for Google Maps Distance Matrix API.
    *   `axios`: For making HTTP requests to the optimization service.
    *   `express`: Web framework (used in `server.ts`).
    *   `typescript`: Language used.
    *   `dotenv`: For loading environment variables.
    *   `pino`, `pino-pretty`: For logging.
*   **Environment:** Requires environment variables for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_API_KEY`, `OPTIMIZER_URL`, and `ONESTEP_GPS_API_KEY`.

### 1.4 Testing & Advanced Usage

*   **Unit Testing:** Run scheduler unit tests using the root command:
    ```bash
    pnpm run test:scheduler
    ```
*   **End-to-End Testing:** Utilize the Docker-based simulation environment in the `simulation/` directory to run comprehensive integration tests against a local replica of the backend services.
    ```bash
    # Run E2E tests (includes seed generation)
    pnpm run test:e2e
    ```
    See `simulation/README.md` for details.
*   **Seed Data Generation:** The E2E test script automatically generates varied and randomized test data. To generate *only* the data without running tests:
    ```bash
    # Generate new data (overwrites existing seed SQL and metadata JSON)
    node simulation/generate-dynamic-seed.js
    ```
    The generator (`simulation/generate-dynamic-seed.js`) also outputs `simulation/seed-metadata.json`, which is used by the E2E tests for dynamic assertions.

## 2. Package Documentation: Python Optimization Microservice (`apps/optimiser/`)

### 2.1 Package Summary

This package provides a Python FastAPI microservice that encapsulates the core optimization logic using Google OR-Tools. It receives a scheduling problem definition via a REST API, solves the Vehicle Routing Problem with Time Windows (and other constraints like eligibility and fixed times), and returns the optimized routes.

### 2.2 Public Interfaces / API

The service exposes a REST API with the following main endpoint:

*   **`POST /optimize-schedule`**:
    *   **Summary**: Accepts the VRP definition (locations, technicians, items, constraints, travel matrix) and returns optimized routes or an error status.
    *   **Request Body**: `OptimizationRequestPayload` (JSON). Defined by Pydantic models in `apps/optimiser/models.py`. Key components include:
        *   `locations`: Array of `OptimizationLocation` (ID, solver index, lat/lng). Indexing includes depot(s), item locations, and unique technician start locations.
        *   `technicians`: Array of `OptimizationTechnician` (ID, start/end location indices, earliest/latest time window ISO strings).
        *   `items`: Array of `OptimizationItem` (ID like `job_X` or `bundle_Y`, location index, duration seconds, priority, `eligibleTechnicianIds`). Item-specific earliest start time constraints are handled via the `orders.earliest_available_time` field in the scheduler and applied as dimension constraints in the solver, not as a direct field on this payload item.
        *   `fixedConstraints`: Array of `OptimizationFixedConstraint` (item ID, fixed start time ISO string).
        *   `travelTimeMatrix`: Nested dictionary `[origin_index][destination_index] -> travel_time_seconds`.
    *   **Response Body**: `OptimizationResponsePayload` (JSON). Defined by Pydantic models in `apps/optimiser/models.py`. Key components include:
        *   `status`: String Literal - `'success'`, `'partial'`, or `'error'`.
        *   `message`: Optional string describing the outcome, especially on error or partial success.
        *   `routes`: Array of `TechnicianRoute` objects, each containing:
            *   `technicianId`: ID of the technician.
            *   `stops`: Array of `RouteStop` objects (`itemId`, `arrivalTimeISO`, `startTimeISO`, `endTimeISO`).
            *   `totalTravelTimeSeconds`: Calculated total travel time for the route in seconds.
            *   `totalDurationSeconds`: Calculated total duration including travel and service.
        *   `unassignedItemIds`: Optional array of item IDs (`job_X` or `bundle_Y`) that could not be scheduled.

*   **`GET /health`**:
    *   **Summary**: Simple health check endpoint.
    *   **Response Body**: `{"status": "healthy", "timestamp": "..."}` (JSON).

### 2.3 Dependencies and Requirements

*   **Python:** v3.10 or higher recommended (check `apps/optimiser/Dockerfile`).
*   **pip:** Python package installer.
*   **Major Dependencies (`apps/optimiser/requirements.txt`):**
    *   `ortools`: Google Optimization Tools library (contains the CP-SAT and Routing solvers).
    *   `fastapi`: Modern web framework for building APIs.
    *   `uvicorn[standard]`: ASGI server for running FastAPI applications.
    *   `pydantic`: Data validation and settings management library used by FastAPI.
    *   `pytest`: For running unit tests.

### 2.4 Testing

*   **Unit Testing:** Run unit tests using `pytest` via the root `package.json` script:
    ```bash
    pnpm run test:optimiser
    ```
    (This script likely runs `cd apps/optimiser && pytest`). Tests cover helper functions (time conversions) and various optimization scenarios. See `apps/optimiser/tests/test_main.py`.

--- End of Documentation ---