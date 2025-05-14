Here's a detailed implementation plan for the comprehensive scheduler integration test:

**Phase 1: Dedicated Seeding Script (`simulation/scripts/db/seed/scenarios/comprehensive_scheduler_test.ts`)**

1.  **File Creation and Structure:**
    *   Create a new file: `simulation/scripts/db/seed/scenarios/comprehensive_scheduler_test.ts`.
    *   This script will export an async function, similar to other scenario seeders, e.g., `export async function seedComprehensiveSchedulerTest(supabaseAdmin: SupabaseClient<Database>, baselineRefs: BaselineRefs): Promise<ScenarioSeedResult>`.
    *   Initialize `insertedIds` structure to track created records, mirroring `testDataIds` from the proposal's Jest example.

2.  **Technician Seeding (Automated & Specific):**
    *   **Utilize `seedScenarioTechnicians`:** Call `seedScenarioTechnicians(supabaseAdmin, 4)` to create/verify the 4 base technicians (Auth user, Public user, Technician record, default hours). This utility already assigns them to vans (Tech 1 to Van 1, etc., based on `technician-data.ts`).
        *   Store the returned `seededTechnicians` info (dbId, authId, assignedVanId) in local variables. These will be `tech1DbId`, `tech2DbId`, etc. and their corresponding van IDs.
    *   **Clear Default Van Equipment:**
        *   For Vans 1-4 (IDs obtained from `seededTechnicians` mapping or `baselineRefs.vanIds` if they are consistently the first four), delete existing entries from `van_equipment`.
        ```typescript
        // In seedComprehensiveSchedulerTest.ts
        const techVanIds = seededTechnicians.map(t => t.assignedVanId);
        await supabaseAdmin.from('van_equipment').delete().in('van_id', techVanIds);
        ```
    *   **Insert Specific Van Equipment:**
        *   Query `equipment` table to get IDs for models 'prog', 'immo', 'diag', 'airbag', 'rare_tool'. (Note: 'rare_tool' needs to be seeded by `seedBaseline` or this script if it's unique to this test). For this plan, assume 'rare_tool' is seeded as part of Scenario C below.
        *   Prepare `TablesInsert<'van_equipment'>[]` data based on "Technician Configuration Required for this Test" in the proposal:
            *   Tech 1 (Van 1): 'prog'
            *   Tech 2 (Van 2): 'immo'
            *   Tech 3 (Van 3): 'prog' (and others like 'diag', 'immo', 'airbag' if desired and available)
            *   Tech 4 (Van 4): 'diag', 'prog', 'immo', 'airbag'
        *   Use `insertData` to add these specific `van_equipment` records.
    *   **Insert Specific Availability Exceptions:**
        *   Prepare `TablesInsert<'technician_availability_exceptions'>[]` data:
            *   Tech 1: Today, unavailable 14:00-16:00 UTC. Store created ID in `insertedIds.technician_availability_exceptions` (and proposal's `exceptionI`).
            *   Tech 4: Today, `is_available = false` (full day). Store created ID in `insertedIds.technician_availability_exceptions` (and proposal's `exceptionH`).
        *   Use `insertData` to add these exceptions.
        *   Store technician DB IDs and Auth IDs in `insertedIds.technicianDbIds` and `insertedIds.technicianAuthIds`.

3.  **Address ID 1-4 Reservation and Job Address Handling:**
    *   The `seedScenarioTechnicians` utility uses `home_address_id` from `technician-data.ts`. Ensure these are set to Address IDs 1-4 for Tech 1-4 respectively in `technician-data.ts` if not already.
    *   When seeding jobs for scenarios, ensure `address_id` for jobs is selected from `baselineRefs.addressIds` *excluding* IDs 1, 2, 3, and 4.
    ```typescript
    // Example logic in seedComprehensiveSchedulerTest.ts
    const jobAddressPool = baselineRefs.addressIds?.filter(id => id > 4) ?? [];
    if (jobAddressPool.length === 0) throw new Error("Not enough non-technician addresses for jobs.");
    // Use jobAddressPool[0], jobAddressPool[1], etc. for job locations.
    ```

4.  **Scenario-Specific Data Seeding (Jobs A-M):**
    *   For each scenario (A-M) defined in "Scenario Breakdown":
        *   Implement data creation logic as specified in "Seed Data Additions".
        *   Use `insertData` helper for database insertions (`orders`, `jobs`, `equipment` if new, etc.).
        *   Store the IDs of created records in the `insertedIds` object (e.g., `insertedIds.jobs?.push(jobZ1.id)`). This object will be the return value `ScenarioSeedResult`.
        *   **Scenario A (Baseline Schedule):** If `baselineRefs` doesn't guarantee enough "filler jobs", seed 5-10 simple 'queued' jobs. Store their IDs in `insertedIds.fillerJobIds`.
        *   **Scenario C (Equipment Conflict - Single Job):**
            *   Insert 'rare_tool' into `equipment` table. Store its ID.
            *   Insert corresponding `services` and `diag_equipment_requirements`.
            *   Ensure *no* van has 'rare_tool'.
        *   **Job Dates/Times:** Use `dayjs().utc()` to calculate "Today" and "Tomorrow" dates and specific times as required by scenarios (e.g., D, E, H, I, J, M).
    *   Return the populated `ScenarioSeedResult` object containing all `insertedIds`.

**Phase 2: Jest Test File (`tests/integration/scheduler/comprehensive_schedule.test.ts`)**

1.  **File Setup:**
    *   Create the file `tests/integration/scheduler/comprehensive_schedule.test.ts` based on the proposal's outline.
    *   Import necessary utilities: `getSupabaseClient`, `triggerSchedulerReplan`, `waitForReplan` (from `./utils`), `dayjs`, `utc`.
    *   Import `readCurrentScenarioMetadata` from `./utils` to load IDs seeded by `comprehensive_scheduler_test.ts`.

2.  **`beforeAll` and `afterAll`:**
    *   `beforeAll`:
        *   Initialize `supabase = getSupabaseClient()`.
        *   Call `const testDataIds = await readCurrentScenarioMetadata()` to load the IDs. This `testDataIds` will correspond to the `ScenarioSeedResult.insertedIds` structure.
        *   The `console.log` messages for seeding can be removed/adjusted as seeding is now external.
        *   Set a longer timeout if needed (e.g., `jest.setTimeout(200000)`).
    *   `afterAll`:
        *   Optional: Implement cleanup logic if necessary, perhaps by calling a generic `cleanupScenarioData(testDataIds.insertedIds)` using the loaded IDs.

3.  **Main `it` Block (`should correctly schedule and handle various scenarios...`):**
    *   The `triggerSchedulerReplan()` and `waitForReplan()` calls as outlined in the proposal are correct *if the Jest test itself is responsible for triggering the replan after the CLI has seeded data*.
        *   However, the proposal's CLI integration section implies the CLI script triggers replan *then* runs Jest.
        *   **Decision for this plan:** Assume the CLI runner handles seeding AND `runFullReplan` trigger + log capture. The Jest test will *only* perform assertions on the DB state *after* the replan has completed.
        *   Thus, remove `triggerSchedulerReplan()` from the Jest test.
        *   The `waitForReplan` might still be useful if there's a slight delay for DB updates to fully settle, or it can be simplified/removed if the CLI ensures replan is fully done before Jest starts. For robustness, keep a simplified `waitForReplan` or a small delay.
        *   The `waitForReplan` condition should check if a representative set of jobs (e.g., some filler jobs, some scenario-specific jobs) have moved from their initial seeded state (e.g., 'queued', 'fixed_time') to a final state (e.g., 'queued' with `estimated_sched`, 'pending_review', 'fixed_time' with `estimated_sched`).

4.  **Assertion Logic (Scenarios A-M):**
    *   For each scenario:
        *   Fetch the relevant job(s), technician(s), or exception(s) from the database using Supabase client and IDs from `testDataIds`.
        *   Implement assertions based on the "Test Assertions/Verifications" section for that scenario in `docs/proposals/unified-test.md`.
        *   Example for Scenario B:
            ```typescript
            // --- Scenario B: Bundle Equipment Conflict Verification ---
            const jobZ1 = finalJobsMap.get(testDataIds.insertedIds.jobs.find(id => /* logic to identify jobZ1 based on seed output */)!)!;
            const jobZ2 = finalJobsMap.get(testDataIds.insertedIds.jobs.find(id => /* logic to identify jobZ2 */)!)!;
            // ... (assertions for Z1 and Z2 status, assigned_technician, etc.)
            ```
        *   Ensure to correctly map `testDataIds` (from `readCurrentScenarioMetadata`) to the specific job/order IDs mentioned in the proposal (e.g., `jobZ1`, `jobE`, etc.). The seeding script must ensure these specific items are identifiable in its output metadata, perhaps by adding custom keys to `insertedIds` or by order. A clear mapping is crucial. The proposal's `testDataIds` struct in the Jest example is a good target for the metadata file's structure.

**Phase 3: CLI Runner Integration (`simulation/scripts/e2e-runner.ts`)**

1.  **Add New Menu Option:**
    *   In `MainMenuChoice` enum, add:
        ```typescript
        RUN_COMPREHENSIVE_TEST = 'Run Comprehensive Scheduler Integration Test',
        ```
    *   Add this choice to the `choices` array in the main menu prompt.

2.  **Implement Action for New Menu Option:**
    *   Add a `case MainMenuChoice.RUN_COMPREHENSIVE_TEST:` block.
    *   Inside this case:
        *   **Log Start:** `console.log(chalk.blue('Starting Comprehensive Scheduler Integration Test...'));`
        *   **Record Start Time:** `const testStartTime = new Date();` (for log capture).
        *   **Execute Dedicated Seeding Script:**
            *   Use `executeCommand` to run the seeding script. This assumes the seeding script is made executable or called via `ts-node` or a `pnpm` script. Example: `pnpm ts-node simulation/scripts/db/seed/index.ts -- --action comprehensive_scheduler_test --output-metadata path/to/comprehensive_metadata.json`. (Note: `index.ts` in `seed/` would need to be updated to handle this new action and call `seedComprehensiveSchedulerTest`).
            *   The `CURRENT_SCENARIO_METADATA_PATH` can be reused for the output metadata file.
            ```typescript
            // In e2e-runner.ts, RUN_COMPREHENSIVE_TEST case
            const seedSuccess = await executeCommand('pnpm', [
                'db:seed:staging', // Assuming this pnpm script calls the main seeder (index.ts)
                '--',
                '--action', 'comprehensive_scheduler_test', // New action name
                '--baseline-metadata', BASELINE_METADATA_PATH, // If baseline is a prerequisite
                '--output-metadata', CURRENT_SCENARIO_METADATA_PATH, // Output for Jest to read
                // No --techs needed, as it's fixed at 4
            ]);
            if (!seedSuccess) { /* handle error, return */ }
            ```
        *   **Trigger `runFullReplan`:**
            *   Call the `triggerSchedulerReplan` utility. This can be done by creating a small helper script that `e2e-runner.ts` executes, or by importing and calling it directly if dependencies allow. For simplicity, let's assume `triggerSchedulerReplan` from `tests/integration/scheduler/utils.ts` is callable or wrapped.
            *   A simple way is to make an HTTP POST request directly using `fetch` within `e2e-runner.ts`, similar to `triggerSchedulerReplan`'s implementation.
            ```typescript
            // In e2e-runner.ts, after successful seed
            console.log(chalk.blue('Triggering scheduler replan...'));
            const SCHEDULER_HOST_URL = 'http://localhost:3001'; // As in utils.ts
            try {
                const replanResponse = await fetch(`${SCHEDULER_HOST_URL}/run-replan`, { method: 'POST' });
                if (!replanResponse.ok) {
                    throw new Error(`Scheduler replan trigger failed: ${replanResponse.status}`);
                }
                console.log(chalk.green('Scheduler replan triggered successfully. Waiting for completion (simulated by log capture duration)...'));
            } catch (replanError) {
                console.error(chalk.red('Failed to trigger scheduler replan:'), replanError);
                success = false;
                // break or return, depending on flow
            }
            ```
        *   **Log Capture (During/After Replan):**
            *   Adapt the existing Docker log capture logic from `RUN_SCENARIO_TEST`.
            *   `const testEndTime = new Date();` (after replan is assumed complete or after a suitable wait).
            *   `const schedulerLogPath = path.join('debug', 'comprehensive_scheduler_scheduler.log');` (timestamping can be added).
            *   `const optimiserLogPath = path.join('debug', 'comprehensive_scheduler_optimiser.log');`
            *   Use `executeCommand` with `docker logs --since ${testStartTime.toISOString()} --until ${testEndTime.toISOString()} ...`.
            *   **Wait for Replan:** The proposal mentions `waitForReplan`. The CLI runner needs a way to know the replan (triggered by HTTP) is finished before capturing logs and running Jest. This is tricky.
                *   Option A: Fixed delay (e.g., 2-3 minutes). Simple but not robust.
                *   Option B: Poll an endpoint or DB state (like `waitForReplan` in Jest). `e2e-runner.ts` would need Supabase client access.
                *   **Chosen for this plan:** Since `waitForReplan` exists, the Jest test itself can use it. The CLI runner will trigger replan, then *immediately* run Jest. The Jest test's `beforeAll` or the start of the `it` block will contain the `waitForReplan`. The log capture in CLI will capture logs for a fixed duration or until Jest finishes.
                *   Revised log capture in `e2e-runner.ts`:
                    *   Start time: `testStartTime` (before triggering replan).
                    *   End time: `testEndTime` (capture *after* Jest test execution finishes). This ensures logs cover the entire test period.

        *   **Execute Jest Test:**
            *   Use `executeCommand` to run the specific Jest test file.
            ```typescript
            // In e2e-runner.ts, after triggering replan and before final log capture step
            const jestTestPath = path.relative(process.cwd(), path.join(INTEGRATION_TESTS_DIR, 'comprehensive_schedule.test.ts')).replace(/\\/g, '/');
            const jestSuccess = await executeCommand('jest', [jestTestPath]);
            if (!jestSuccess) { /* handle test failure */ }
            ```
        *   **Final Log Capture Call (after Jest):** Place the Docker log capture calls here, using `testStartTime` and `new Date()` as `testEndTime`.

**Phase 4: Log Capture (Refined)**

1.  **In `e2e-runner.ts` for `RUN_COMPREHENSIVE_TEST` case:**
    *   Capture `testStartTime = new Date()` before triggering `runFullReplan`.
    *   After the `executeCommand` for Jest finishes, capture `testEndTime = new Date()`.
    *   Use these `testStartTime` and `testEndTime` to fetch logs from `test_scheduler` and `test_optimiser` Docker containers:
        ```typescript
        // In e2e-runner.ts, after Jest execution
        console.log(chalk.blue('\nCapturing logs for Comprehensive Scheduler Test...'));
        const schedulerLogFilename = `comprehensive_test_scheduler_${testStartTime.toISOString().replace(/:/g, '-')}.log`;
        const optimiserLogFilename = `comprehensive_test_optimiser_${testStartTime.toISOString().replace(/:/g, '-')}.log`;
        const schedulerLogPath = path.join('debug', schedulerLogFilename);
        const optimiserLogPath = path.join('debug', optimiserLogFilename);
        await fs.mkdir('debug', { recursive: true }); // Ensure debug directory exists

        const schedulerLogCmd = `docker logs --since ${testStartTime.toISOString()} --until ${testEndTime.toISOString()} test_scheduler > "${schedulerLogPath}"`;
        const optimiserLogCmd = `docker logs --since ${testStartTime.toISOString()} --until ${testEndTime.toISOString()} test_optimiser > "${optimiserLogPath}"`;

        await executeCommand(schedulerLogCmd, []); // Errors handled by executeCommand
        await executeCommand(optimiserLogCmd, []);
        console.log(chalk.gray(`  Logs saved to debug/${schedulerLogFilename} and debug/${optimiserLogFilename}`));
        ```

**Summary of Changes and New Components:**

*   **New Files:**
    *   `simulation/scripts/db/seed/scenarios/comprehensive_scheduler_test.ts` (dedicated seeder)
    *   `tests/integration/scheduler/comprehensive_schedule.test.ts` (Jest test file)
*   **Modified Files:**
    *   `simulation/scripts/e2e-runner.ts` (new menu option and orchestration logic)
    *   `simulation/scripts/db/seed/index.ts` (to add a case for `"comprehensive_scheduler_test"` action to call the new seeder).
    *   Possibly `technician-data.ts` to ensure Address IDs 1-4 are technician home addresses.
    *   Possibly `baseline-data.ts` or `seedBaseline` if 'rare_tool' needs to be added to baseline equipment.
*   **Key Logic Points:**
    *   Dedicated seeder handles all specific data setup, including technicians and scenarios A-M.
    *   Seeder outputs metadata (`ScenarioSeedResult`) that Jest reads.
    *   CLI runner orchestrates: seed -> trigger replan (HTTP) -> run Jest -> capture Docker logs.
    *   Jest test uses `readCurrentScenarioMetadata` and `waitForReplan` (if kept), then asserts DB state.

This plan provides a step-by-step approach to implementing the comprehensive scheduler integration test as per the user's request and the provided documentation.