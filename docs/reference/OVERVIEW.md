LOGICAL OVERVIEW TRACETHROUGH

**1. Starting Point: `apps/scheduler/src/scheduler/orchestrator.ts` (`runFullReplan`)**

This file orchestrates the main replan process. It imports and calls functions from several modules:

*   **Data Fetching (`apps/scheduler/src/supabase/`)**:
    *   `technicians.ts`: `getActiveTechnicians` (Gets active technicians and their locations).
    *   `jobs.ts`: `getRelevantJobs` (Gets jobs for today's plan) and `getJobsByStatus` (Gets overflow jobs).
    *   `client.ts`: Provides the Supabase client instance.
    *   `travel-time-cache.ts`: `TravelTimeCacheService` (Two-level cache for Google Maps API results).
*   **Scheduling Logic (`apps/scheduler/src/scheduler/`)**:
    *   `availability.ts`: `calculateWindowsForTechnician`, `applyLockedJobsToWindows` (Uses DB data & locked jobs to determine availability windows).
    *   `bundling.ts`: `bundleQueuedJobs`.
    *   `eligibility.ts`: `determineTechnicianEligibility`.
    *   `payload.ts`: `prepareOptimizationPayload`.
    *   `optimize.ts`: `callOptimizationService`.
    *   `results.ts`: `processOptimizationResults`.
*   **Database Update (`apps/scheduler/src/db/`)**:
    *   `update.ts`: `updateJobs`.
*   **Types (`apps/scheduler/src/types/`)**: Imports various type definitions (`database.types.ts` including `JobSchedulingState`).
*   **External Services (`apps/scheduler/src/google/`, `apps/scheduler/src/onestepgps/`)**:
    *   `maps.ts`: `getBulkTravelTimes` (calculates travel times, handles bulk calls).
    *   `client.ts`: `fetchDeviceLocations` (gets real-time GPS data).



**2. Tracing Dependencies:**

*   **`apps/scheduler/src/supabase/client.ts`**:
    *   Imports: `@supabase/supabase-js` (external library), `process.env` (Node.js standard).
    *   Purpose: Initializes and exports the Supabase client using environment variables.

*   **`apps/scheduler/src/supabase/technicians.ts` (`getActiveTechnicians`)**:
    *   Imports: `supabase` (from `client.ts`), `Technician`, `Address`, `User` (types).
    *   Purpose: Queries Supabase `technicians` table, joining `users`, `van_assignments`, `vans`, and `addresses` to get technician details, current van location, and home address coordinates.

*   **`apps/scheduler/src/supabase/jobs.ts` (`getRelevantJobs`, `getJobsByStatus`)**:
    *   Imports: `supabase` (from `client.ts`), `Job`, `JobStatus`, `Address`, `Service` (types).
    *   Purpose: Queries Supabase `jobs` table, joining `addresses` and `services`, filtering by specified statuses.

*   **`apps/scheduler/src/db/update.ts` (`updateJobs`)**:
    *   Imports: `supabase` (from `client.ts`), `SupabaseClient`, `JobUpdateOperation` (types).
    *   Purpose: Performs batch updates on the Supabase `jobs` table based on a list of operations.

*   **`apps/scheduler/src/scheduler/availability.ts` (`calculateWindowsForTechnician`, `applyLockedJobsToWindows`)**:
    *   Imports: `Technician`, `Job`, `TechnicianAvailabilityException`, `TechnicianDefaultHours`, `TimeWindow`, `DailyAvailabilityWindows` (types).
    *   Imports: `date-fns` helpers.
    *   Purpose: Calculates detailed technician availability windows based on DB default hours and exceptions. Applies time blocked by locked jobs (en_route, in_progress, fixed_time) for a specific date.

*   **`apps/scheduler/src/scheduler/bundling.ts` (`bundleQueuedJobs`)**:
    *   Imports: `Job`, `JobBundle`, `SchedulableJob`, `SchedulableItem` (types).
    *   Purpose: Groups jobs with the same `order_id` into `JobBundle` objects.

*   **`apps/scheduler/src/scheduler/eligibility.ts` (`determineTechnicianEligibility`)**:
    *   Imports: `SchedulableItem`, `Technician`, `JobBundle`, `SchedulableJob`, `EquipmentRequirement`, `VanEquipment` (types).
    *   Imports: `getRequiredEquipmentForJob`, `getEquipmentForVans` (from `apps/scheduler/src/supabase/equipment.ts`).
    *   Purpose: Compares equipment required for a job/bundle (fetched via `getRequiredEquipmentForJob`) with the equipment available in each technician's van (fetched via `getEquipmentForVans`) to determine eligibility. Breaks bundles if no single tech is eligible.

*   **`apps/scheduler/src/scheduler/payload.ts` (`prepareOptimizationPayload`)**:
    *   Imports: `Technician`, `SchedulableItem`, `Job`, `Address`, `OptimizationPayload`, `OptimizationTechnician`, `OptimizationItem`, `OptimizationLocation`, `TimeWindow`, `DailyAvailabilityWindows` (types).
    *   Imports: `getBulkTravelTimes` (from `maps.ts`), `calculateWindowsForTechnician`, `applyLockedJobsToWindows`, `findAvailabilityGaps` (from `availability.ts`).
    *   Purpose: Constructs the JSON payload for the external optimization service. This involves:
        *   Calculating detailed availability windows using `calculateWindowsForTechnician` and `applyLockedJobsToWindows`.
        *   Identifying and modeling internal availability gaps as dummy break items/constraints using `findAvailabilityGaps`.
        *   Indexing all unique locations (depot, technician start, job sites).
        *   Calculating the travel time matrix between all locations using `getBulkTravelTimes`.
        *   Formatting technician data (start/end times derived from calculated windows).
        *   Formatting schedulable items with constraints and eligible technician indices.
        *   Adding `fixedConstraints` for real fixed jobs and dummy breaks.

*   **`apps/scheduler/src/scheduler/optimize.ts` (`callOptimizationService`)**:
    *   Imports: `axios` (external library), `OptimizationPayload`, `OptimizationResponsePayload` (types).
    *   Purpose: Sends the prepared payload to the optimization microservice URL (from environment variables) via an HTTP POST request using `axios`. Handles response and errors.

*   **`apps/scheduler/src/scheduler/results.ts` (`processOptimizationResults`)**:
    *   Imports: `OptimizationResponsePayload`, `ScheduledJobUpdate`, `ItemRoute` (types).
    *   Purpose: Parses the JSON response from the optimization service, extracting the planned routes for each technician, calculated start times for scheduled jobs, and a list of unassigned items.

*   **`apps/scheduler/src/supabase/equipment.ts` (`getRequiredEquipmentForJob`, `getEquipmentForVans`)**:
    *   Imports: `supabase` (from `client.ts`), `EquipmentRequirement`, `VanEquipment`, `Service`, `VehicleYmm` (types).
    *   Imports: `getYmmIdForOrder` (from `apps/scheduler/src/supabase/orders.ts`).
    *   Purpose:
        *   `getEquipmentForVans`: Fetches equipment currently assigned to specified vans.
        *   `getRequiredEquipmentForJob`: Determines equipment requirements based on job service category, vehicle type (using `getYmmIdForOrder`), and service details by querying `service_equipment_requirements`.

*   **`apps/scheduler/src/google/maps.ts` (`getBulkTravelTimes`)**:
    *   Imports: `@googlemaps/google-maps-services-js` (external library), `LatLngLiteral` (type).
    *   Purpose: Calls the Google Maps Distance Matrix API in batches to get driving travel times between multiple locations. Includes an in-memory cache. Handles real-time and predictive traffic requests.

*   **`apps/scheduler/src/supabase/orders.ts` (`getYmmIdForOrder`)**:
    *   Imports: `supabase` (from `client.ts`), `Order` (type).
    *   Purpose: Fetches the `ymm_id` (Year-Make-Model identifier) associated with a specific `order_id` from the `orders` table.

**3. System Workflow Summary (Refactored Approach):**

1.  **Initialization:** Start the replan cycle. Initialize internal state: `jobStates = new Map()` to track status and attempts per job.
2.  **Fetch Initial Data:** Get active technicians (including DB availability data) and relevant jobs (initially `queued`, plus `locked`/`fixed_time`). Populate `jobStates` for `queued` jobs.
3.  **Fetch Real-Time Locations:** Use OneStepGPS to update technician `current_location` in memory for today.
4.  **Separate Jobs:** Identify `lockedJobs` and `allFixedTimeJobs`.
5.  **Pass 1 (Today):**
    *   If no pending jobs (`jobStates`), skip to Final Update.
    *   Bundle, check eligibility (mark persistent failures like equipment in `jobStates`).
    *   Prepare payload for eligible jobs: Calculate today's availability windows (DB data + locked jobs + GPS start location), model gaps, calculate bulk travel times (real-time), add fixed constraints for today.
    *   Call optimization service.
    *   Process results: Update `jobStates` (mark `scheduled` with assignment details or `failed_transient`).
6.  **Overflow Loop (Pass 2+):**
    *   Loop up to `MAX_OVERFLOW_ATTEMPTS` times as long as jobs remain pending/transiently failed in `jobStates`.
    *   Increment the planning date.
    *   Fetch technicians (use home locations).
    *   Bundle, check eligibility for remaining jobs (mark persistent failures).
    *   Prepare payload for remaining eligible jobs: Calculate future day's availability windows (DB data + locked jobs for that future date + home start location), model gaps, calculate bulk travel times (predictive), add fixed constraints for that future date.
    *   Call optimization service.
    *   Process results: Update `jobStates`.
7.  **Final Database Update:**
    *   Prepare a list of `JobUpdateOperation` based on the final `lastStatus` in `jobStates`.
    *   Jobs marked `scheduled` get `status = 'queued'`, assignment, and time.
    *   Jobs marked `failed_persistent` or `failed_transient` get `status = 'pending_review'`, assignment/time cleared.
    *   Execute `updateJobs` with the combined list of operations.
8.  **Log Summary & Completion/Error:** Log the final schedule, unscheduled jobs (with reasons from `jobStates`), generate direction links, and handle errors.

This trace provides a detailed view of how the modules interact to perform the full replan, incorporating database-driven availability, explicit gap modeling, improved state tracking, and the final update mechanism.
