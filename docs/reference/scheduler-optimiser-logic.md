This explanation synthesizes information from the `orchestrator.ts`, related scheduler modules, optimizer logic (`main.py`), and relevant documentation (`OVERVIEW.md`, `technical-reference.md`, etc.).

The core orchestration happens within `runFullReplan` in `apps/scheduler/src/scheduler/orchestrator.ts`.

**1. Initial Job Retrieval/Filtering:**

*   **Function:** `getRelevantJobs` in `apps/scheduler/src/supabase/jobs.ts`.
*   **Process:** At the start of `runFullReplan`, this function is called to fetch jobs that might need planning or affect the current day's schedule.   
*   **Filtering Criteria:** It specifically queries the database for jobs with statuses `queued`, `en_route`, `in_progress`, or `fixed_time`. Implicitly, it only considers jobs relevant to the current planning horizon (today + overflow days), although the function itself doesn't apply a date filter.      
*   **Data Fetched:** It retrieves core job details and joins related data like `addresses` (for location) and `services` (for category and equipment needs), and `orders` (for `earliest_available_time`).
*   **Initial State Tracking:** The orchestrator initializes an internal `jobStates` map to track the progress of jobs initially fetched with status `queued` (or potentially `pending_review` if retrying).

**2. Technician Availability & Eligibility:**

*   **Availability Determination:**
    *   **Data Fetching:** `getActiveTechnicians` (`apps/scheduler/src/supabase/technicians.ts`) fetches active technicians, their assigned vans (including `onestepgps_device_id`), home locations (from `users` -> `addresses`), and crucially, their default hours (`technician_default_hours`) and specific unavailability records (`technician_availability_exceptions`).
    *   **Real-time Location (Today):** `fetchDeviceLocations` (`apps/scheduler/src/onestepgps/client.ts`) is called. If successful, the `current_location` of technicians is updated in memory *for the initial "today" planning pass*. If it fails, the last known location from the van record or home location is used. For future/overflow days, the home location is used as the start point.
    *   **Window Calculation:** `calculateWindowsForTechnician` (`apps/scheduler/src/scheduler/availability.ts`) processes the fetched default hours and exceptions for a given technician and date range (initially just today) to determine their base availability windows (potentially multiple segments if exceptions create gaps).
    *   **Applying Locked Jobs:** For *today's* pass, `applyLockedJobsToWindows` (`apps/scheduler/src/scheduler/availability.ts`) further refines these windows by subtracting time blocked by jobs currently `en_route`, `in_progress`, or `fixed_time` for that technician on that specific day. This logic is invoked during payload preparation.
*   **Eligibility Determination:**
    *   **Function:** `determineTechnicianEligibility` (`apps/scheduler/src/scheduler/eligibility.ts`).
    *   **Process:** This runs *after* bundling. It takes the `SchedulableItem`s (bundles or single jobs) and the list of available technicians.
    *   It calls `getEquipmentForVans` (`apps/scheduler/src/supabase/equipment.ts`) to get the equipment currently on each technician's assigned van.    
    *   It calls `getRequiredEquipmentForJob` (`apps/scheduler/src/supabase/equipment.ts`) for each job within the `SchedulableItem`. This function looks up requirements based on the job's service and the vehicle's Year-Make-Model (YMM), querying the appropriate `*_equipment_requirements` table.
    *   It compares required equipment against the equipment available on each technician's van.
    *   **Output:** It annotates each `SchedulableItem` with a list of eligible technician IDs. If a `JobBundle` has no single technician eligible for *all* its constituent jobs, the bundle is broken down into individual `SchedulableJob`s, and eligibility is re-evaluated for each individual job. Items with *zero* eligible technicians are marked as persistent failures (`failed_persistent`) in the orchestrator's `jobStates`.

**3. Job Bundling:**

*   **Function:** `bundleQueuedJobs` (`apps/scheduler/src/scheduler/bundling.ts`).
*   **Process:** This function takes the list of jobs intended for the current planning pass (excluding locked jobs).
*   **Criteria:** It groups jobs that share the same `order_id`. Jobs with `status: 'fixed_time'` are *explicitly excluded* from bundling and are always treated as individual items.
*   **Output:**
    *   If multiple non-fixed jobs share an `order_id`, they become a `JobBundle`.
    *   If only one job exists for an `order_id` or if a job is `fixed_time`, it becomes a `SchedulableJob`.
    *   The result is an array of `SchedulableItem` (either `JobBundle` or `SchedulableJob`).
*   **Priority Influence:** The `priority` assigned to a `JobBundle` is the **maximum** priority value found among its constituent jobs.

**4. Priority Processing:**

*   **Initial Fetch:** Priority is fetched along with other job details.
*   **Bundling:** As mentioned above, the highest priority within a set of bundled jobs becomes the priority for the `JobBundle`.
*   **Payload Preparation:** The `priority` value (either from the original job or the max from the bundle) is included in the `OptimizationItem` object within the payload sent to the optimizer.
*   **Optimizer Logic (Conceptual):** Priority is primarily used *by the optimizer* service. OR-Tools doesn't typically sort jobs by priority beforehand. Instead, it uses priority to calculate **penalties for dropping jobs**. Higher priority jobs are assigned a significantly higher penalty, making the solver much less likely to leave them unassigned if capacity is constrained. If the solver *must* drop jobs to satisfy constraints (time, capacity), it will preferentially drop lower-priority (lower penalty) jobs first.
*   **Explicit Pre-Sorting:** There is **no** distinct step in the current orchestrator logic where jobs are explicitly sorted by priority *before* being sent to the optimizer for a given day's planning pass. The determination of which jobs *can* be scheduled is based on eligibility and time/capacity constraints first, with priority influencing the optimizer's trade-offs when not all eligible jobs fit.

**5. Optimization Payload Preparation:**

*   **Function:** `prepareOptimizationPayload` (`apps/scheduler/src/scheduler/payload.ts`).
*   **Process:** This crucial step constructs the JSON payload (`OptimizationRequestPayload`) for the Python optimizer service for a *specific target date*.
    *   **Availability & Gaps:** Calculates detailed availability windows for the target date (using `calculateWindowsForTechnician` and `applyLockedJobsToWindows`). Identifies unavailability gaps (`findAvailabilityGapsFromAvailability`).
    *   **Unavailability Representation:** Creates `TechnicianUnavailability` objects for each gap (containing `technicianId`, `startTimeISO`, `durationSeconds`) and adds them to the `payload.technicianUnavailabilities` list.
    *   **Locations:** Defines unique `OptimizationLocation` entries for the depot, each job/bundle location, and each technician's start location (using real-time GPS for today, home location for future days). Handles potential location clashes by slightly perturbing technician start coordinates if necessary.
    *   **Travel Matrix:** Calls `getBulkTravelTimes` (`apps/scheduler/src/google/maps.ts`) to get the travel duration matrix between all defined locations, requesting real-time traffic for today or predictive traffic for future dates. Handles API errors by assigning a high penalty cost.
    *   **Technicians:** Formats `OptimizationTechnician` objects, including their calculated overall `earliestStartTimeISO` and `latestEndTimeISO` for the *target date*.
    *   **Items:** Formats eligible `SchedulableItem`s into `OptimizationItem` objects, including `id` (`job_X` or `bundle_Y`), `locationIndex`, `durationSeconds`, `priority`, `eligibleTechnicianIds`, and any `earliestStartTimeISO` derived from the order. If an item represents a `fixed_time` job for the target date, `isFixedTime: true` and `fixedTimeISO` are added.
    *   **Fixed Constraints:** Creates `OptimizationFixedConstraint` objects *only* for actual jobs that have `status: 'fixed_time'` and whose `fixed_schedule_time` falls on the `targetDate`. These include the `itemId`, `fixedTimeISO`, `assignedTechnicianId`, and `durationSeconds`. (Note: Dummy breaks are now handled via `technicianUnavailabilities`, not fixed constraints).
*   **Priority Passing:** Priority is passed as an integer field within each `OptimizationItem`.

**6. Optimization Logic (Conceptual):**

*   **Service:** `apps/optimiser/main.py` receives the `OptimizationRequestPayload`.
*   **Solver:** Uses Google OR-Tools `RoutingModel`.
*   **Objectives:** Primarily aims to **minimize total travel time** while maximizing the number of scheduled jobs (implicitly achieved by assigning high penalties for dropping jobs, especially high-priority ones).
*   **Constraints Applied:**
    *   Technician start/end times (`time_dimension.CumulVar(Start/End).SetRange`).
    *   Technician unavailability/breaks (`time_dimension.SetBreakIntervalsOfVehicle` using data from `payload.technicianUnavailabilities`).
    *   Fixed job times (`time_dimension.CumulVar(item_node).SetRange(t, t)` for items where `isFixedTime` is true). Fixed jobs are also made mandatory (`routing.AddDisjunction([node], 0)`).
    *   Job durations (as service time at nodes).
    *   Earliest start times for jobs (`time_dimension.CumulVar(item_node).SetMin`).
    *   Technician eligibility (enforced via arc costs or `VehicleVar().SetValues()` - the code uses arc costs).
    *   Disjunctions (`routing.AddDisjunction([node], penalty)`) allow the solver to potentially drop non-mandatory jobs if constraints cannot be met, incurring the priority-based penalty.
*   **Trade-offs:** If time/capacity is insufficient, the solver drops jobs starting with the lowest priority (lowest penalty) to find a feasible solution that minimizes travel and total penalty.

**7. Results Processing & Assignment:**

*   **Function:** `processOptimizationResults` (`apps/scheduler/src/scheduler/results.ts`).
*   **Input:** `OptimizationResponsePayload` from the optimizer, `eligibleItemMap` (mapping optimizer item IDs back to original `SchedulableItem`s).     
*   **Process:**
    *   Checks `response.status`. Throws an error if 'error'.
    *   Iterates through the `routes` and `stops`.
    *   For each `stop`:
        *   Looks up the original `SchedulableItem` using `eligibleItemMap` and `stop.itemId`.
        *   If it's a `job_X` item, extracts the `jobId`.
        *   If it's a `bundle_Y` item, extracts the job IDs of *all constituent jobs* from the original `JobBundle`.
        *   Creates `ScheduledJobUpdate` records containing the `jobId`, assigned `technicianId`, and the calculated `startTimeISO` (this becomes the `estimated_sched`).
*   **Orchestrator Update:** `orchestrator.ts` receives the `ProcessedSchedule`. For each `ScheduledJobUpdate`:
    *   Updates the corresponding entry in the `jobStates` map, marking `lastStatus = 'scheduled'`.
    *   Stores the assignment details (`technicianId`, `estimatedSchedISO`) in the `finalAssignments` map.
*   **Final DB Update:** At the *very end* of `runFullReplan`, the orchestrator iterates through `jobStates`. Jobs marked 'scheduled' have corresponding entries created in the `finalUpdates` array (setting `status` to `'queued'`, plus `assigned_technician` and `estimated_sched` from `finalAssignments`). This array is then passed to `updateJobs` (`apps/scheduler/src/db/update.ts`) for a single batch database update.

**8. Handling of Unschedulable Jobs:**

*   **Persistent Eligibility Failures:** If `determineTechnicianEligibility` finds an item (job or bundle) has *zero* eligible technicians (e.g., due to equipment conflicts), it's marked `failed_persistent` in `jobStates` immediately. These jobs are not sent to the optimizer in subsequent passes.
*   **Optimizer Unassigned:** If the optimizer returns an `itemId` in `unassignedItemIds`, `processOptimizationResults` notes this. The orchestrator updates the corresponding job(s) in `jobStates` to `failed_transient`.
*   **Skipped Planning Day:** If a planning pass (today or overflow) is skipped entirely because no technicians have availability (`isAnyTechAvailable...` flags), jobs still in `pending` or `failed_transient` states have a failure attempt recorded for that day with reason `NO_TECHNICIAN_AVAILABILITY`, and their status remains `failed_transient`.
*   **Overflow Timeout:** If a job remains `failed_transient` after `MAX_OVERFLOW_ATTEMPTS`, the loop terminates.
*   **Final Status:** In the final database update (`updateJobs`), any job whose `lastStatus` in the `jobStates` map is `failed_persistent` or `failed_transient` (either because it failed persistently early on or because it remained transiently failed after all overflow attempts) is updated to `status: 'pending_review'`, with `assigned_technician` and `estimated_sched` set to `NULL`. This flags them for manual review.

In summary, priority primarily influences the optimizer's decision-making when capacity is limited, making high-priority jobs less likely to be dropped (unassigned). Eligibility and fixed constraints are treated as hard constraints that must be met *before* priority trade-offs are considered.

**Relevant Files:**

*   `apps/scheduler/src/scheduler/orchestrator.ts` (Primary)
*   `apps/scheduler/src/supabase/jobs.ts`
*   `apps/scheduler/src/supabase/technicians.ts`
*   `apps/scheduler/src/supabase/equipment.ts`
*   `apps/scheduler/src/supabase/orders.ts`
*   `apps/scheduler/src/onestepgps/client.ts`
*   `apps/scheduler/src/scheduler/availability.ts`
*   `apps/scheduler/src/scheduler/bundling.ts`
*   `apps/scheduler/src/scheduler/eligibility.ts`
*   `apps/scheduler/src/scheduler/payload.ts`
*   `apps/scheduler/src/google/maps.ts`
*   `apps/scheduler/src/scheduler/optimize.ts`
*   `apps/scheduler/src/scheduler/results.ts`
*   `apps/scheduler/src/db/update.ts`
*   `apps/optimiser/main.py`
*   `apps/scheduler/src/types/database.types.ts`
*   `apps/scheduler/src/types/optimization.types.ts`
*   `docs/reference/OVERVIEW.md`
*   `docs/reference/technical-reference.md`
*   `scripts/prd-opimiser.txt`