This test aims to validate multiple scheduling scenarios within a single execution of `runFullReplan`.

**Assumptions:**

1.  **Baseline Seed:** The test environment starts with data seeded by the `base_schedule` scenario (filler jobs, initial technicians/vans/equipment, etc.).
2.  **Technicians:** The test requires **four** technicians (Tech 1, Tech 2, Tech 3, Tech 4). We'll define their specific configurations (van assignments, equipment) as part of the test setup additions, assuming the baseline might provide fewer or differently configured techs.
3.  **Single Replan:** The test triggers `runFullReplan` once.
4.  **Verification:** Assertions are made against the final state of the database (primarily the `jobs` table) after the replan completes.

**Objective:** Verify the scheduler and optimizer correctly handle a mix of standard jobs, equipment conflicts, fixed times, unavailability, and bundling logic within a single planning cycle (Today + Tomorrow overflow).

**Prerequisite:** The test environment's database (Staging Supabase) must be seeded with:
1.  Standard baseline data (addresses, equipment, services, ymm_refs, customer vehicles, etc.).
2.  **Four** technicians (Tech 1-4) with associated auth users, public users, vans, and default availability (Mon-Fri, 09:00-18:30 UTC). Their home addresses (e.g., potentially Address IDs 1-4 if following a convention from `base_schedule`) must be established and treated as distinct from addresses used for job locations.
3.  A baseline set of ~5-10 simple, geographically dispersed 'queued' jobs eligible for today/tomorrow ("filler jobs").

---

**Technician Configuration Required for this Test:**

(This data needs to be ensured during the seeding phase specific to this comprehensive test, potentially modifying or adding to the baseline).

*   **Tech 1:**
    *   Assigned to Van 1.
    *   Van 1 `van_equipment`: MUST contain `equipment` record with `model = 'prog'`. MUST *NOT* contain `equipment` record with `model = 'immo'`. (For Scenario B).
    *   `technician_availability_exceptions`: Add a record for **Today** marking them unavailable from 14:00 UTC to 16:00 UTC. (For Scenario I & J).   
    *   `technician_default_hours`: Standard (e.g., Mon-Fri 09:00-18:30 UTC).
*   **Tech 2:**
    *   Assigned to Van 2.
    *   Van 2 `van_equipment`: MUST contain `equipment` record with `model = 'immo'`. MUST *NOT* contain `equipment` record with `model = 'prog'`. (For Scenario B).
    *   `technician_default_hours`: Standard.
*   **Tech 3:**
    *   Assigned to Van 3.
    *   Van 3 `van_equipment`: MUST contain `equipment` record with `model = 'prog'`. (For Scenario G). Can contain other common tools ('diag', 'immo', 'airbag').
    *   `technician_default_hours`: Standard.
*   **Tech 4:**
    *   Assigned to Van 4.
    *   Van 4 `van_equipment`: Must contain common tools ('diag', 'prog', 'immo', 'airbag'). MUST *NOT* contain 'rare_tool'. (For Scenario C).
    *   `technician_availability_exceptions`: Add a record for **Today** setting `is_available = false` for the whole day (`exception_type = 'time_off'`). (For Scenario H).
    *   `technician_default_hours`: Standard.

---

**CLI Integration and Automated Seeding Workflow**

To ensure this comprehensive test runs with the precise setup required, the following workflow will be implemented:

1.  **CLI Menu Option:**
    *   A new option, for example, "**Run Comprehensive Scheduler Integration Test**", will be added to the main menu of the CLI interface script runner.

2.  **Automated Technician and Scenario Seeding:**
    *   Selecting this option from the CLI will trigger a dedicated seeding script specifically designed for this comprehensive test.
    *   This script will **bypass any general user prompts** for the number of technicians.
    *   It will automatically:
        *   Ensure the precise configuration of exactly **four technicians** (Tech 1, Tech 2, Tech 3, Tech 4) by performing the following sequence:
            1.  Create the base technicians (Auth user, Public user profile linked to home address 1-4, Technician record) potentially using the `seedScenarioTechnicians(4)` utility and assign them to baseline Vans 1-4.
            2.  **Clear Default Equipment:** Remove any default `van_equipment` entries associated with Vans 1, 2, 3, and 4 that might have been added by `seedBaseline`.
            3.  **Insert Specific Equipment:** Insert the specific `van_equipment` records detailed in the "**Technician Configuration Required for this Test**" section (e.g., Van 1 gets 'prog', Van 2 gets 'immo'). (Note: The implementation will need to map equipment names like 'prog'/'immo'/'rare_tool' to their corresponding baseline `equipment.id` values).
            4.  **Insert Specific Exceptions:** Insert the `technician_availability_exceptions` detailed in the "**Technician Configuration Required for this Test**" section (e.g., Tech 1 window, Tech 4 day off).
        *   Subsequently, seed all other specific data required for scenarios A-J and M (e.g., jobs, orders, unique equipment requirements) as detailed in the "**Scenario Breakdown**".
    *   This two-step targeted seeding (technicians first, then scenario-specific items) guarantees the precise environmental conditions needed for the test's validity.

3.  **Test Execution and Verification:**
    *   Once all prerequisite data (including the specialized technician setups and scenario-specific data) is successfully seeded, the script will automatically trigger the `runFullReplan` function.
    *   **Log Capture:** The script executing `runFullReplan` **must capture all standard output and standard error streams** from this process. These logs should be saved to a designated file (e.g., timestamped in a `debug/` directory) for diagnostic purposes.
    *   Following the replan, the Jest test suite (`tests/integration/scheduler/comprehensive_schedule.test.ts`) will execute, performing all assertions outlined in the "**Scenario Breakdown**" to verify the outcomes. Test reports may reference the captured log file in case of failures.

This approach ensures that the comprehensive test is self-contained regarding its complex data prerequisites once initiated from the CLI, providing a reliable and repeatable testing process.

---

### Test Implementation Outline (tests/integration/scheduler/comprehensive_schedule.test.ts)

```typescript
import { getSupabaseClient, triggerSchedulerReplan, waitForReplan } from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

describe('Comprehensive Scheduler Integration Test', () => {
    let supabase: SupabaseClient;
    let testDataIds: { // Store IDs of specifically seeded records for verification
        orderZ: number;
        jobZ1: number;
        jobZ2: number;
        orderE: number;
        jobE: number;
        orderF: number;
        jobF: number;
        orderT: number;
        jobT: number;
        orderL: number;
        jobL: number;
        orderS: number;
        jobS1: number;
        jobS2: number;
        exceptionH: number; // For Tech 4 full day off
        exceptionI: number; // For Tech 1 window off
        orderU: number;
        jobU: number;
        jobLCKD: number; // For Scenario M
        jobQ1M: number;  // For Scenario M
        jobQ2M: number;  // For Scenario M
        fillerJobIds: number[]; // IDs from baseline seed
        tech1DbId: number;
        tech2DbId: number;
        tech3DbId: number;
        tech4DbId: number;
    };

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Comprehensive Test: Seeding Additions ---');
        // IMPORTANT: This beforeAll assumes baseline data ALREADY EXISTS.
        // It ONLY adds the specific records for scenarios B-J.
        // In a real setup, a dedicated seeding script would run BEFORE Jest.
        // This section is illustrative of the data needed.

        // Fetch baseline filler job IDs and technician IDs
        // const baselineJobs = await fetchBaselineJobs(); // Placeholder
        // const baselineTechs = await fetchBaselineTechs(); // Placeholder
        // testDataIds.fillerJobIds = baselineJobs.map(j => j.id);
        // testDataIds.tech1DbId = baselineTechs.find(t => t.name === 'Tech 1')?.id; // etc.

        // Seed Data Additions for Scenarios B-J (Illustrative - Use seeding scripts in practice)
        // testDataIds = await seedComprehensiveScenarioData(supabase);

        console.log('--- Comprehensive Test: Seeding Additions Complete ---');
    }, /* timeout */);

    it('should correctly schedule and handle various scenarios in one replan cycle', async () => {
        console.log('Triggering comprehensive scheduler replan...');
        await triggerSchedulerReplan();

        console.log('Waiting for comprehensive replan to complete...');
        const allRelevantJobIds = [ /* Collate all IDs from testDataIds */ ];
        await waitForReplan(
            async () => { /* Condition to check if all jobs have reached a final state */ },
            180000, // Longer timeout for complex run
            5000
        );

        console.log('Replan complete. Verifying all scenarios...');

        // Fetch final state of ALL relevant jobs and exceptions
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('*') // Select all needed fields
            .in('id', allRelevantJobIds);
        // Fetch final exception states if needed

        expect(jobsError).toBeNull();
        expect(finalJobs).toBeDefined();
        const finalJobsMap = new Map(finalJobs!.map(j => [j.id, j]));

        // --- Scenario A: Baseline Schedule Verification ---
        console.log('Verifying Scenario A: Baseline Schedule...');
        // Assertions for baseline filler jobs (e.g., >75% scheduled)

        // --- Scenario B: Bundle Equipment Conflict Verification ---
        console.log('Verifying Scenario B: Bundle Equipment Conflict...');
        // Assertions for Job Z1 and Job Z2 (assignments, status)

        // --- Scenario C: Equipment Conflict (Single Job) Verification ---
        console.log('Verifying Scenario C: Equipment Conflict...');
        // Assertions for Job E (status = pending_review)

        // --- Scenario D: Fixed Time Future Overflow Verification ---
        console.log('Verifying Scenario D: Fixed Time Future Overflow...');
        // Assertions for Job F (status, exact estimated_sched for tomorrow)

        // --- Scenario E: Fixed Time Today Verification ---
        console.log('Verifying Scenario E: Fixed Time Today...');
        // Assertions for Job T (status, exact estimated_sched for today)

        // --- Scenario F: Long Duration Job Verification ---
        console.log('Verifying Scenario F: Long Duration Job...');
        // Assertions for Job L (status = queued OR pending_review)

        // --- Scenario G: Same Location (Priority & Equipment) Verification ---
        console.log('Verifying Scenario G: Same Location...');
        // Assertions for Job S1 and S2 (assigned to Tech 3, sequence)

        // --- Scenario H: Technician Unavailable Day Verification ---
        console.log('Verifying Scenario H: Technician Unavailable Day...');
        // Assertions: Query jobs assigned to Tech 4 today (should be 0)

        // --- Scenario I: Technician Unavailable Window Verification ---
        console.log('Verifying Scenario I: Technician Unavailable Window...');
        // Assertions: Query jobs for Tech 1 today, check no overlap with 14:00-16:00 UTC

        // --- Scenario J: Unschedulable Fixed Verification ---
        console.log('Verifying Scenario J: Unschedulable Fixed...');
        // Assertions for Job U (status = pending_review)

        // --- Scenario M: Locked Job - In Progress Verification ---
        console.log('Verifying Scenario M: Locked Job - In Progress...');
        // Assertions for Job LCKD, Job Q1M, Job Q2M (status, assignment, timing)

        console.log('--- Comprehensive Verification Complete ---');
    });

    afterAll(async () => {
        // Optional: Cleanup specific seeded data if necessary
        // await cleanupComprehensiveScenarioData(supabase, testDataIds);
    });
});

```

---

**Scenario Breakdown:**

*Important Note on Job Addresses:* Address IDs 1 through 4 are reserved as technician home locations (as potentially established by `base_schedule` or the comprehensive test's specific technician seeding). **Under no circumstances should any test scenario generate or assign a job to be performed at Address IDs 1-4.** All job locations must utilize other baseline addresses or newly created addresses distinct from these four reserved technician home locations.

**A. Baseline Schedule:**

1.  **Seed Data Additions:**
    *   None needed beyond the assumed `base_schedule` seed. If that seed is minimal, **add 5-10 basic `queued` jobs** using baseline customers, addresses, vehicles, and generally available services (like 'diag' or 'prog'). Distribute these geographically and ensure they are eligible for scheduling today or tomorrow. Store their IDs in `testDataIds.fillerJobIds`.
2.  **Application Logic Involved:** Entire `runFullReplan` flow: `getActiveTechnicians`, `getRelevantJobs`, `fetchDeviceLocations`, `calculateWindowsForTechnician`, `applyLockedJobsToWindows`, `bundleQueuedJobs`, `determineTechnicianEligibility`, `prepareOptimizationPayload`, `callOptimizationService`, `processOptimizationResults`, `updateJobs`.
3.  **Test Assertions/Verifications:**
    *   Query the `jobs` table for all jobs in `testDataIds.fillerJobIds`.
    *   Calculate the percentage of these jobs where `status` is 'queued' and `estimated_sched` is not null.
    *   Assert this percentage is > 75%.
    *   Optionally, check logs for major errors during the run.

**B. Bundle Equipment Conflict:**

1.  **Seed Data Additions:**
    *   **Order Z:** Insert into `orders` using a baseline customer/vehicle/address. Store ID in `testDataIds.orderZ`.
    *   **Job Z1:** Insert into `jobs` (linked to Order Z), `service_id` corresponding to 'prog'. Status `queued`. Store ID in `testDataIds.jobZ1`.    
    *   **Job Z2:** Insert into `jobs` (linked to Order Z), `service_id` corresponding to 'immo'. Status `queued`. Store ID in `testDataIds.jobZ2`.    
    *   **Equipment:** Ensure 'prog' tool (e.g., equip ID 8) and 'immo' tool (e.g., equip ID 7) exist in `equipment`.
    *   **Van Equipment:** Ensure Van 1 (Tech 1) has *only* Equip ID 8 in `van_equipment`. Ensure Van 2 (Tech 2) has *only* Equip ID 7. Ensure Van 3/4 have Equip ID 8 *and* 7, or other combinations.
2.  **Application Logic Involved:** `bundling.ts` (`bundleQueuedJobs`), `supabase/equipment.ts` (`getRequiredEquipmentForJob`, `getEquipmentForVans`), `eligibility.ts` (`determineTechnicianEligibility` - should break the bundle), `orchestrator.ts`, `payload.ts`, `optimize.ts`, `results.ts`, `db/update.ts`.
3.  **Test Assertions/Verifications:**
    *   Fetch final state of Job Z1 and Job Z2 from the DB.
    *   Assert `jobZ1.status` is 'queued'.
    *   Assert `jobZ1.assigned_technician` is Tech 1, 3, or 4 (not Tech 2).
    *   Assert `jobZ2.status` is 'queued'.
    *   Assert `jobZ2.assigned_technician` is Tech 2, 3, or 4 (not Tech 1).
    *   Assert `jobZ1.assigned_technician !== jobZ2.assigned_technician` if assigned to Tech 1 or Tech 2 respectively.

**C. Equipment Conflict (Single Job):**

1.  **Seed Data Additions:**
    *   **Equipment:** Insert a unique `equipment` record (e.g., model 'rare_tool', type 'diag', get new equip ID X).
    *   **Service:** Insert a `services` record ('Rare Service', category 'diag', get new service ID Y).
    *   **Requirement:** Insert into `diag_equipment_requirements` linking a baseline YMM ID to `service_id = Y` and `equipment_model = 'rare_tool'`.  
    *   **Order E:** Insert into `orders` using a baseline customer and the vehicle corresponding to the chosen YMM ID. Store ID in `testDataIds.orderE`.
    *   **Job E:** Insert into `jobs` (linked to Order E), `service_id = Y`. Status `queued`. Store ID in `testDataIds.jobE`.
    *   **Van Equipment:** **CRITICAL:** Ensure *no* records in `van_equipment` link Equip ID X to *any* of the 4 vans.
2.  **Application Logic Involved:** `supabase/equipment.ts`, `eligibility.ts` (`determineTechnicianEligibility` finds no eligible techs), `orchestrator.ts` (updates state to `failed_persistent`), `db/update.ts` (sets final status).
3.  **Test Assertions/Verifications:**
    *   Fetch final state of Job E.
    *   Assert `jobE.status` is 'pending_review'.
    *   Assert `jobE.assigned_technician` is null.
    *   Assert `jobE.estimated_sched` is null.

**D. Fixed Time Future Overflow:**

1.  **Seed Data Additions:**
    *   **Order F:** Insert into `orders`. Store ID in `testDataIds.orderF`.
    *   **Job F:** Insert into `jobs` (linked to Order F). Set `status = 'fixed_time'`, `fixed_assignment = true`, `assigned_technician = 1` (Tech 1). Calculate `fixed_schedule_time` as **Tomorrow @ 10:00 UTC** string. Store ID in `testDataIds.jobF`.
    *   *(Ensure baseline filler jobs provide sufficient load for tomorrow).*
2.  **Application Logic Involved:** `orchestrator.ts` (detects fixed job in overflow pass), `payload.ts` (includes job and constraint in *tomorrow's* payload), `optimiser/main.py` (applies `SetRange` for fixed job).
3.  **Test Assertions/Verifications:**
    *   Fetch final state of Job F.
    *   Assert `jobF.status` is 'fixed_time'.
    *   Assert `jobF.assigned_technician` is 1.
    *   Assert `jobF.estimated_sched` is not null.
    *   Assert `dayjs(jobF.estimated_sched).utc().toISOString()` equals `dayjs(jobF.fixed_schedule_time).utc().toISOString()`.
    *   Fetch filler jobs scheduled for tomorrow for Tech 1. Verify their `estimated_sched` times do not overlap with Job F's duration (10:00-11:00 assuming 60min duration).

**E. Fixed Time Today:**

1.  **Seed Data Additions:**
    *   **Order T:** Insert into `orders`. Store ID in `testDataIds.orderT`.
    *   **Job T:** Insert into `jobs` (linked to Order T). Set `status = 'fixed_time'`, `fixed_assignment = true`, `assigned_technician = 2` (Tech 2). Calculate `fixed_schedule_time` as **Today @ 15:00 UTC** string. Store ID in `testDataIds.jobT`.
    *   *(Ensure baseline filler jobs provide sufficient load for today).*
2.  **Application Logic Involved:** `orchestrator.ts` (detects fixed job in today pass), `payload.ts` (includes job and constraint in *today's* payload), `optimiser/main.py` (applies `SetRange`).
3.  **Test Assertions/Verifications:**
    *   Fetch final state of Job T.
    *   Assert `jobT.status` is 'fixed_time'.
    *   Assert `jobT.assigned_technician` is 2.
    *   Assert `jobT.estimated_sched` is not null.
    *   Assert `dayjs(jobT.estimated_sched).utc().toISOString()` equals `dayjs(jobT.fixed_schedule_time).utc().toISOString()`.
    *   Fetch filler jobs scheduled for today for Tech 2. Verify their `estimated_sched` times do not overlap with Job T's duration (15:00-16:00). Verify they also avoid Tech 1's break window (Scenario I).

**F. Long Duration Job:**

1.  **Seed Data Additions:**
    *   **Order L:** Insert into `orders`. Store ID in `testDataIds.orderL`.
    *   **Job L:** Insert into `jobs` (linked to Order L). Set `job_duration = 600`. Status `queued`. Store ID in `testDataIds.jobL`.
2.  **Application Logic Involved:** `payload.ts` (sets `durationSeconds`), `optimiser/main.py` (handles the long duration within the `TimeDimension`). 
3.  **Test Assertions/Verifications:**
    *   Fetch final state of Job L.
    *   Assert `jobL.status` is either 'queued' or 'pending_review'.
    *   If 'queued', assert `assigned_technician` and `estimated_sched` are not null.
    *   If 'pending_review', assert `assigned_technician` and `estimated_sched` are null.
    *   *(The main goal is to ensure the process completes without crashing due to the long duration).*

**G. Same Location (Priority & Equipment):**

1.  **Seed Data Additions:**
    *   **Address S:** Use an existing baseline address ID.
    *   **Order S:** Insert into `orders` using Address S. Store ID in `testDataIds.orderS`.
    *   **Job S1:** Insert into `jobs` (linked to Order S), Address S, `service_id` for 'prog', `priority = 1`, status `queued`. Store ID in `testDataIds.jobS1`.
    *   **Job S2:** Insert into `jobs` (linked to Order S), Address S, `service_id` for 'prog', `priority = 2`, status `queued`. Store ID in `testDataIds.jobS2`.
    *   **Equipment:** Ensure 'prog' tool exists (Equip ID 8).
    *   **Van Equipment:** Ensure Van 3 (Tech 3) has Equip ID 8.
2.  **Application Logic Involved:** `bundling.ts` (may or may not bundle based on implementation), `payload.ts`, `eligibility.ts`, `optimiser/main.py`.
3.  **Test Assertions/Verifications:**
    *   Fetch final state of Job S1 and Job S2.
    *   Assert `jobS1.status` is 'queued' and `jobS2.status` is 'queued'.
    *   Assert `jobS1.assigned_technician` is Tech 3.
    *   Assert `jobS2.assigned_technician` is Tech 3.
    *   Assert `jobS1.estimated_sched` is not null.
    *   Assert `jobS2.estimated_sched` is not null.
    *   Optionally: Assert `jobS1.estimated_sched <= jobS2.estimated_sched` (reflecting priority, though optimizer might swap for efficiency).

**H. Technician Unavailable Day:**

1.  **Seed Data Additions:**
    *   **Exception H:** Insert into `technician_availability_exceptions`. `technician_id = 4` (Tech 4), `date =` **Today's Date** (YYYY-MM-DD), `is_available = false`, `exception_type = 'time_off'`, `start_time = NULL`, `end_time = NULL`. Store ID in `testDataIds.exceptionH`.
2.  **Application Logic Involved:** `availability.ts` (`calculateWindowsForTechnician`), `orchestrator.ts` (filters out unavailable techs for the day).
3.  **Test Assertions/Verifications:**
    *   Fetch all jobs from the DB where `assigned_technician = 4`.
    *   Filter these jobs to find any where `estimated_sched` falls within **today's** UTC date range (00:00:00 to 23:59:59).
    *   Assert the count of such jobs is 0.

**I. Technician Unavailable Window:**

1.  **Seed Data Additions:**
    *   **Exception I:** Insert into `technician_availability_exceptions`. `technician_id = 1` (Tech 1), `date =` **Today's Date** (YYYY-MM-DD), `exception_type = 'custom_hours'`, `is_available = false`, `start_time = '14:00:00'`, `end_time = '16:00:00'`, `reason`="Scheduled break". Store ID in `testDataIds.exceptionI`.
2.  **Application Logic Involved:** `availability.ts` (`calculateWindowsForTechnician`), `payload.ts` (`findAvailabilityGapsFromAvailability`, generation of `technicianUnavailabilities`), `optimiser/main.py` (application of `SetBreakIntervalsOfVehicle`).
3.  **Test Assertions/Verifications:**
    *   Fetch all jobs from the DB where `assigned_technician = 1` and `estimated_sched` is within **today's** UTC date range.
    *   For each fetched job, calculate its end time (`job_end_time = estimated_sched + interval '1 minute' * job_duration`).
    *   Define `break_start_time = Today @ 14:00:00 UTC`.
    *   Define `break_end_time = Today @ 16:00:00 UTC`.
    *   Assert that the interval `[job_start_time, job_end_time)` does NOT overlap with `[break_start_time, break_end_time)`. (Overlap check: `job_start_time < break_end_time AND job_end_time > break_start_time`).

**J. Unschedulable Fixed:**

1.  **Seed Data Additions:**
    *   Ensure the unavailability window for Tech 1 (14:00-16:00 UTC today) from scenario I is seeded.
    *   Create 1 new `jobs` record (Job U):
        *   `status`: 'fixed_time'
        *   `assigned_technician`: Tech 1 ID
        *   `fixed_assignment`: true
        *   `fixed_schedule_time`: Today @ 15:00:00 UTC ISO string (falls *inside* the unavailability window).
        *   Use baseline order/address/vehicle/service.
2.  **Application Logic Involved:**
    *   `payload.ts`: Includes Job U as an item and its constraint in `fixedConstraints`. Also generates the `TechnicianUnavailability` for the 14:00-16:00 window.
    *   `main.py`: Applies the `SetBreakIntervalsOfVehicle` constraint *first*. Then attempts to apply the mandatory `SetRange` constraint for Job U. This creates an infeasibility for Job U within the OR-Tools model.
    *   `results.ts`: Receives the optimizer result where Job U is likely in `unassignedItemIds`.
    *   `orchestrator.ts`: Marks Job U's state as `failed_transient` or potentially `failed_persistent` if the fixed time conflict is detected as unbreakable.
    *   `db/update.ts`: Updates Job U's status.
3.  **Test Assertions/Verifications:**
    *   Query Job U.
    *   Assert `status` is 'pending_review'.
    *   Assert `estimated_sched` is NULL.
    *   Assert `assigned_technician` is potentially NULL (or may remain Tech 1 depending on final update logic).

**M. Locked Job - In Progress**

1.  **Objective:** Verify that the scheduler correctly accounts for a technician's time already committed to an `in_progress` job at the start of the planning day, and schedules new jobs around it.
2.  **Technician Configuration:**
    *   Utilize Tech 1 from the standard setup.
3.  **Specific Seed Data Additions:**
    *   Create 1 new `jobs` record (Job LCKD):
        *   `status`: 'in_progress'
        *   `assigned_technician`: Tech 1 ID (from `testDataIds.tech1DbId` or equivalent).
        *   `address_id`: A baseline address (ensure not a reserved technician home address).
        *   `service_id`: A common service ID (e.g., for 'prog' or 'diag').
        *   `estimated_sched`: Today's date at 09:00:00 UTC (or aligned with Tech 1's actual start time).
        *   `job_duration`: 90 (minutes).
        *   Link to a new or existing baseline `orders` record.
        *   Store its ID in `testDataIds.jobLCKD`.
    *   Create 1-2 new `queued` `jobs` (e.g., Job Q1M, Job Q2M):
        *   Eligible for Tech 1 (common service, suitable location).
        *   `job_duration`: 60 minutes each.
        *   `priority`: Standard (e.g., 3).
        *   `earliest_available_time`: Today.
        *   Store IDs in `testDataIds.jobQ1M`, `testDataIds.jobQ2M`.
4.  **Application Logic Involved:**
    *   `getRelevantJobs` (fetches Job LCKD).
    *   `getActiveTechnicians`, `calculateWindowsForTechnician`.
    *   `applyLockedJobsToWindows` (critical for blocking out Job LCKD's time).
    *   `determineTechnicianEligibility`, `bundleQueuedJobs`, `prepareOptimizationPayload`.
    *   `callOptimizationService`, `processOptimizationResults`, `updateJobs`.
5.  **Test Assertions/Verifications:**
    *   Query Job LCKD (using `testDataIds.jobLCKD`):
        *   Assert `status` is 'in_progress' (or its expected state if it naturally transitions; for the test, unchanged is fine).
        *   Assert `assigned_technician` is Tech 1 ID.
        *   Assert `estimated_sched` matches the seeded 09:00:00 UTC.
    *   Query Jobs Q1M, Q2M (using `testDataIds.jobQ1M`, etc.):
        *   If scheduled: Assert `assigned_technician` is Tech 1 ID.
        *   If scheduled: Assert their `estimated_sched` is >= today @ 10:30:00 UTC (i.e., after Job LCKD + its duration).
        *   Assert that their scheduled intervals `[estimated_sched, estimated_sched + duration)` do not overlap with Job LCKD's interval `[09:00:00, 10:30:00)` UTC today.
        *   If not scheduled (due to capacity or other reasons), assert `status` is 'pending_review'.