# Technical Reference: Dynamic Job Scheduler Backend

This document provides detailed technical documentation for the components of the Dynamic Job Scheduler backend.

## 1. Package Documentation: Node.js Scheduler (`src/`)

### 1.1 Package Summary

This package contains the primary Node.js/TypeScript application responsible for orchestrating the job scheduling workflow. It interacts with the Supabase database, prepares data for optimization, calls the external Python optimization service, processes the results, and updates the job statuses in the database.

### 1.2 Detailed Documentation of Public Features / API / Interface

The primary public interface is the entry point that executes `runFullReplan`.

**`src/index.ts`**

*   **Purpose:** Main entry point for the Node.js scheduler application.
*   **Functionality:**
    *   Initializes the Supabase client using environment variables (`src/supabase/client.ts`).
    *   Calls `runFullReplan` from `src/scheduler/orchestrator.ts` to start the scheduling process.
    *   Handles top-level success and error logging, and exits the process with appropriate status codes.

**`src/scheduler/orchestrator.ts`**

*   `runFullReplan(dbClient: SupabaseClient<any>): Promise<void>`
    *   **Purpose:** Orchestrates the entire job replanning process, including multi-day overflow handling.
    *   **Parameters:**
        *   `dbClient`: An initialized Supabase client instance.
    *   **Returns:** `Promise<void>` - Resolves when the process completes successfully, rejects on critical failure.
    *   **Workflow:**
        1.  Fetches initial data (technicians, relevant jobs).
        2.  Separates locked/fixed jobs from `queued` jobs (`jobsToPlan`).
        3.  **Pass 1 (Today):** Calculates availability based on current locations and locked jobs, bundles, checks eligibility, prepares payload, calls optimizer, processes results, updates internal state (`finalAssignments` Map, `jobsToPlan` Set).
        4.  **Overflow Loop (Pass 2+):** Iterates for subsequent days (up to `MAX_OVERFLOW_ATTEMPTS`) for jobs remaining in `jobsToPlan`. Skips weekends. Calculates availability using *home locations*, bundles, checks eligibility, prepares payload, calls optimizer, processes results, updates internal state.
        5.  **Final Update:** Performs a single batch database update (`updateJobs`): sets successfully assigned jobs to `queued`, sets unschedulable jobs to `pending_review`.

**`src/supabase/client.ts`**

*   `supabase: SupabaseClient`: Exported initialized Supabase client instance configured using `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables.

**`src/supabase/jobs.ts`**

*   `getRelevantJobs(): Promise<Job[]>`: Fetches jobs with statuses 'queued', 'en_route', 'in_progress', or 'fixed_time'. Includes joined `addresses`, `services`, and `orders` (for `earliest_available_time`, `created_at`).
*   `getJobsByStatus(statuses: JobStatus[]): Promise<Job[]>`: Fetches jobs matching the provided list of statuses. Includes the same joins as `getRelevantJobs`.

**`src/supabase/technicians.ts`**

*   `getActiveTechnicians(): Promise<Technician[]>`: Fetches technicians, performing inner joins on `users` and `users.addresses` (for home location), and an outer join on `vans` (for current location). Returns technicians with `home_location` and potentially `current_location` derived from the van.

**`src/supabase/equipment.ts`**

*   `getEquipmentForVans(vanIds: number[]): Promise<Map<number, VanEquipment[]>>`: Fetches equipment assigned to the specified van IDs, joining `equipment` details. Returns a map where keys are `van_id` and values are arrays of `VanEquipment`.
*   `getRequiredEquipmentForJob(job: Job): Promise<string[]>`: Determines the required equipment model names for a given job. It fetches the `ymm_id` for the job's order (using `getYmmIdForOrder`) and queries the appropriate `*_equipment_requirements` table based on the job's service category.

**`src/supabase/orders.ts`**

*   `getYmmIdForOrder(orderId: number): Promise<number | null>`: Fetches the `ymm_id` (Year-Make-Model ID) associated with a specific `order_id` by querying through the `orders` and `customer_vehicles` tables to match against the `ymm_ref` table.

**`src/google/maps.ts`**

*   `getTravelTime(origin: LatLngLiteral, destination: LatLngLiteral): Promise<number | null>`: Calculates driving travel time in seconds between two points using the Google Maps Distance Matrix API. Uses `GOOGLE_MAPS_API_KEY`. Includes an in-memory cache with a 1-hour TTL to reduce API calls. Returns `null` on API error.

**`src/scheduler/availability.ts`**

*   `calculateTechnicianAvailability(technicians: Technician[], lockedJobs: Job[]): void`: Calculates availability for the *current day* (based on the current date and 09:00-18:30 UTC work window). It considers `lockedJobs` to determine the earliest available time and updates `current_location` based on the last locked job's address. Updates technician objects *in place*.
*   `calculateAvailabilityForDay(technicians: Technician[], targetDate: Date): TechnicianAvailability[]`: Calculates availability for a *specific future day* based on the 09:00-18:30 UTC work window (Mon-Fri only). Uses technician *home locations* as the start location. Returns an array of `TechnicianAvailability` objects.

**`src/scheduler/bundling.ts`**

*   `bundleQueuedJobs(queuedJobs: Job[]): SchedulableItem[]`: Groups jobs with the same `order_id` into `JobBundle` objects or leaves them as `SchedulableJob` objects if they are the only job for an order. Calculates `total_duration` and `priority` for bundles.

**`src/scheduler/eligibility.ts`**

*   `determineTechnicianEligibility(initialItems: SchedulableItem[], technicians: Technician[]): Promise<SchedulableItem[]>`: Checks if technicians have the required equipment (determined via `getRequiredEquipmentForJob`) based on their van's inventory (`getEquipmentForVans`). Updates `eligibleTechnicians` (for `SchedulableJob`) or `eligible_technician_ids` (for `JobBundle`). If no single technician is eligible for a `JobBundle`, it breaks the bundle into individual `SchedulableJob` items and recalculates eligibility for them.

**`src/scheduler/payload.ts`**

*   `prepareOptimizationPayload(technicians: Technician[], items: SchedulableItem[], fixedTimeJobs: Job[], technicianAvailability?: TechnicianAvailability[]): Promise<OptimizationRequestPayload>`: Constructs the JSON payload for the optimization service. It indexes locations, calculates the travel time matrix (using `getTravelTime`), formats technician data (using current or future availability from `technicianAvailability`), formats items (including earliest start time constraints from `orders.earliest_available_time`), and adds fixed time constraints. Handles potential clashes between technician start locations and item locations by slightly perturbing technician start coordinates if necessary.

**`src/scheduler/optimize.ts`**

*   `callOptimizationService(payload: OptimizationRequestPayload): Promise<OptimizationResponsePayload>`: Sends the prepared payload via HTTP POST to the `OPTIMIZATION_SERVICE_URL` using `axios`. Handles responses and throws errors on failure or if the service returns a status of `'error'`. 

**`src/scheduler/results.ts`**

*   `processOptimizationResults(response: OptimizationResponsePayload, eligibleItemMap: Map<string, SchedulableItem>): ProcessedSchedule`: Parses the response from the optimization service. It requires a map (`eligibleItemMap`) linking the item IDs sent to the optimizer (e.g., `job_123`, `bundle_45`) back to the original `SchedulableItem` objects to correctly map bundle results back to constituent job IDs. Returns a `ProcessedSchedule` object containing an array of `ScheduledJobUpdate` for successfully scheduled jobs and an array of unassigned item IDs.

**`src/db/update.ts`**

*   `updateJobs(supabase: SupabaseClient<any>, updates: JobUpdateOperation[]): Promise<void>`: Performs batch updates on the `jobs` table. It groups updates by the fields being changed to minimize the number of requests to Supabase. Updates `status`, `assigned_technician`, and `estimated_sched`.

**`src/types/`**

*   **`database.types.ts`**: Contains TypeScript interfaces representing the structure of database tables (e.g., `Job`, `Technician`, `Address`, `Service`, `Van`, `Equipment`, `YmmRef`, `Order`, `User`) and derived types used in scheduling (`JobBundle`, `SchedulableJob`, `SchedulableItem`, `TechnicianAvailability`).
*   **`optimization.types.ts`**: Contains TypeScript interfaces defining the structure of the request (`OptimizationRequestPayload`) and response (`OptimizationResponsePayload`) payloads exchanged with the Python optimization microservice.

### 1.3 Dependencies and Requirements

*   **Node.js:** v16 or higher recommended.
*   **npm:** Node Package Manager.
*   **Major Dependencies:**
    *   `@supabase/supabase-js`: Client library for Supabase interaction.
    *   `@googlemaps/google-maps-services-js`: Client library for Google Maps Distance Matrix API.
    *   `axios`: For making HTTP requests to the optimization service.
*   **Environment:** Requires environment variables for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_MAPS_API_KEY`, and `OPTIMIZATION_SERVICE_URL`.

### 1.4 Advanced Usage

*   **End-to-End Testing:** Utilize the Docker-based simulation environment in the `SIMULATION/` directory to run comprehensive integration tests against a local replica of the backend services.
    ```bash
    node SIMULATION/run-e2e-tests.js --generate
    ```
    See `SIMULATION/README.md` for details.
*   **Random Seed Data Generation:** Generate varied and randomized test data sets for the E2E environment to test different scenarios and edge cases. The main test command (`node SIMULATION/run-e2e-tests.js --generate`) handles this automatically. To generate *only* the data without running tests:
    ```bash
    # Generate new data (overwrites existing seed SQL and metadata JSON)
    node SIMULATION/generate-seed.js
    ```
    The generator (`SIMULATION/generate-seed.js`) also outputs `SIMULATION/seed-metadata.json`, which is used by the E2E tests for dynamic assertions.

## 2. Package Documentation: Python Optimization Microservice (`optimize-service/`)

### 2.1 Package Summary

This package provides a Python FastAPI microservice that encapsulates the core optimization logic using Google OR-Tools. It receives a scheduling problem definition via a REST API, solves the Vehicle Routing Problem with Time Windows (and other constraints like eligibility and fixed times), and returns the optimized routes.

### 2.2 Public Interfaces / API

The service exposes a REST API with the following main endpoint:

*   **`POST /optimize-schedule`**:
    *   **Summary**: Accepts the VRP definition (locations, technicians, items, constraints, travel matrix) and returns optimized routes or an error status.
    *   **Request Body**: `OptimizationRequestPayload` (JSON). Defined by Pydantic models in `optimize-service/models.py`. Key components include:
        *   `locations`: Array of `OptimizationLocation` (ID, solver index, lat/lng). Indexing includes depot(s), item locations, and unique technician start locations.
        *   `technicians`: Array of `OptimizationTechnician` (ID, start/end location indices, earliest/latest time window ISO strings).
        *   `items`: Array of `OptimizationItem` (ID like `job_X` or `bundle_Y`, location index, duration seconds, priority, eligible technician IDs, optional `earliestStartTimeISO`).
        *   `fixedConstraints`: Array of `OptimizationFixedConstraint` (item ID, fixed start time ISO string).
        *   `travelTimeMatrix`: Nested dictionary `[origin_index][destination_index] -> travel_time_seconds`.
    *   **Response Body**: `OptimizationResponsePayload` (JSON). Defined by Pydantic models in `optimize-service/models.py`. Key components include:
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

*   **Python:** v3.10 or higher recommended (based on Dockerfile).
*   **pip:** Python package installer.
*   **Major Dependencies (`requirements.txt`):**
    *   `ortools`: Google Optimization Tools library (contains the CP-SAT and Routing solvers).
    *   `fastapi`: Modern web framework for building APIs.
    *   `uvicorn[standard]`: ASGI server for running FastAPI applications.
    *   `pydantic`: Data validation and settings management library used by FastAPI.
    *   `pytest`: For running unit tests.

### 2.4 Advanced Usage

*   **Unit Testing:** Run unit tests using `pytest` from the `optimize-service` directory:
    ```bash
    pytest
    ```
    Tests cover helper functions (time conversions) and various optimization scenarios (simple cases, fixed constraints, unassignment due to time/eligibility, priority handling, travel time calculations). See `optimize-service/tests/test_main.py`.

## One Step GPS Integration (Scheduler)

To enhance scheduling accuracy, the system integrates with the One Step GPS API to fetch real-time locations for technician vans just before running the daily optimization pass (`runFullReplan` in `apps/scheduler/src/scheduler/orchestrator.ts`).

### Configuration

*   **Environment Variable:** The `ONESTEP_GPS_API_KEY` environment variable must be set with a valid API key obtained from One Step GPS.
*   **Database:** The `public.vans` table requires a nullable `onestepgps_device_id` column (VARCHAR) containing the corresponding device ID from One Step GPS for each tracked van.

### Process

1.  The `apps/scheduler/src/onestepgps/client.ts` module contains the `fetchDeviceLocations` function.
2.  This function reads the `ONESTEP_GPS_API_KEY` and makes a GET request to the One Step GPS `/device-info` endpoint using a Bearer token.
3.  It requests `lat_lng`, `device`, and `dt_tracker` information.
4.  The response (a JSON array of devices) is parsed into a map where keys are `device_id` and values contain `lat`, `lng`, and `timestamp`.
5.  In `orchestrator.ts`, after fetching initial technician data, `fetchDeviceLocations` is called.
6.  If successful, the orchestrator iterates through the technicians, finds the `onestepgps_device_id` associated with their assigned van (`tech.van?.onestepgps_device_id`).
7.  If a matching device ID is found in the API response map, the technician's `current_location` (used as the starting point for the day's schedule) is updated in memory with the real-time coordinates.
8.  If the API fetch fails or a specific device ID isn't found in the response, a warning is logged, and the scheduler proceeds using the last known location for that technician (typically their home location or the last known van location from the database).

This ensures the scheduler uses the most up-to-date location information available when planning the initial routes for the day.

--- End of Documentation --- 