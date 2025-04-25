Using file provider: gemini
Using file model: gemini-2.5-pro-preview-03-25
Using thinking provider: gemini
Using thinking model: gemini-2.5-pro-preview-03-25
Finding relevant files...
Running repomix to get file listing...
Found 81 files, approx 210480 tokens.
Asking gemini to identify relevant files using model: gemini-2.5-pro-preview-03-25 with max tokens: 8000...
Found 6 relevant files:
SIMULATION/generate-dynamic-seed.js
SIMULATION/run-e2e-tests.js
SIMULATION/seed-metadata.json
tests/e2e/e2e.test.ts
SIMULATION/init-scripts/07-generated-seed-data.sql
src/types/database.types.ts

Extracting content from relevant files...
Generating implementation plan using gemini with max tokens: 8000...
Okay, here is a step-by-step implementation plan to modify `SIMULATION/generate-dynamic-seed.js` to produce the `SIMULATION/seed-metadata.json` file, **and** to add command-line arguments to control scenario generation for E2E testing.

**Goal:**

1.  Generate a `seed-metadata.json` file containing details about the dynamically generated orders and jobs (job IDs, fixed times, earliest times) for validation in `tests/e2e/e2e.test.ts`.
2.  Enable the main E2E test runner (`SIMULATION/run-e2e-tests.js`) to accept arguments specifying test scenarios (e.g., equipment scarcity, weekend schedules).
3.  Modify the dynamic seed generator (`SIMULATION/generate-dynamic-seed.js`) to accept these scenario arguments and adjust its data generation accordingly.

**Assumptions:**

1.  The structure of the existing `SIMULATION/seed-metadata.json` is the desired target format for metadata.
2.  The main E2E test runner script is `SIMULATION/run-e2e-tests.js`.
3.  Scenario arguments will be passed via a single flag like `--scenario <scenario_name>`.
4.  Date/time strings generated (`YYYY-MM-DD HH:MM:SS`) are parsable, but ISO 8601 format is preferred for metadata.
5.  A "weekend" is Saturday (day 6) or Sunday (day 0).
6.  The `potentiallyUnschedulableJobIds` logic is currently complex; we'll add the structure but leave the array empty unless a specific scenario explicitly requires generating potentially unschedulable jobs.

**Implementation Plan:**

**Phase 1: Modify Test Runner (`SIMULATION/run-e2e-tests.js`)**

*   **Step 1.1: Parse Scenario Argument**
    *   At the beginning of `run-e2e-tests.js`, parse command-line arguments to extract the value of a `--scenario` flag. A simple approach using `process.argv` is shown, but a library like `yargs` could be used for more complex argument handling.

    ```javascript
    // run-e2e-tests.js
    const path = require('path');
    // ... other requires ...

    // --- Argument Parsing ---
    const args = process.argv.slice(2); // Skip node executable and script path
    const scenarioArgIndex = args.findIndex(arg => arg.startsWith('--scenario='));
    let scenario = 'default'; // Default scenario if flag is not provided
    if (scenarioArgIndex !== -1) {
        scenario = args[scenarioArgIndex].split('=')[1] || 'default';
    }
    console.log(`Running E2E tests with scenario: ${scenario}`);
    // --- End Argument Parsing ---

    // ... rest of the script ...
    ```

*   **Step 1.2: Pass Scenario to Seed Generator**
    *   Locate the `runSeedGenerator` function (or the inline code that executes the seed generator).
    *   Modify the command that runs `generate-dynamic-seed.js` to include the parsed `scenario` as an argument.

    ```javascript
    // Example within run-e2e-tests.js
    async function runSeedGenerator() {
      console.log('Running dynamic seed generator...');
      const command = `node ${path.join(__dirname, 'generate-dynamic-seed.js')} --scenario=${scenario}`; // Pass scenario
      await execAsync(command, { stdio: 'inherit' });
      console.log('Dynamic seed generator finished.');
    }
    // Or if called directly:
    // await execAsync(`node ${path.join(__dirname, 'generate-dynamic-seed.js')} --scenario=${scenario}`, { stdio: 'inherit' });
    ```

**Phase 2: Modify Dynamic Seed Generator (`SIMULATION/generate-dynamic-seed.js`)**

*   **Step 2.1: Add Metadata Output Path**
    *   Add a constant for the metadata file path near the other path definitions.

    ```javascript
    // generate-dynamic-seed.js
    // --- Configuration ---
    // ... (other constants) ...
    const OUTPUT_SEED_FILE = path.join(OUTPUT_DIR, '07-generated-seed-data.sql');
    const METADATA_OUTPUT_FILE = path.join(__dirname, 'seed-metadata.json'); // <--- ADD THIS
    // ... (rest of the config) ...
    ```

*   **Step 2.2: Parse Incoming Scenario Argument**
    *   At the beginning of the script, parse the arguments passed from the test runner.

    ```javascript
    // generate-dynamic-seed.js
    const fs = require('fs');
    const path = require('path');

    // --- Argument Parsing ---
    const args = process.argv.slice(2);
    const scenarioArgIndex = args.findIndex(arg => arg.startsWith('--scenario='));
    let scenario = 'default'; // Default scenario
    if (scenarioArgIndex !== -1) {
        scenario = args[scenarioArgIndex].split('=')[1] || 'default';
    }
    console.log(`[Seed Generator] Generating data for scenario: ${scenario}`);
    // --- End Argument Parsing ---

    // --- Configuration ---
    // ...
    ```

*   **Step 2.3: Add Weekend Check Helper Function**
    *   Add the `isWeekend` helper function (as defined in the original plan).

    ```javascript
    // --- Helper Functions ---
    // ... (getRandomElement, getRandomInt, getRandomFutureDateTime) ...

    /**
     * Checks if a given SQL-like datetime string falls on a weekend (Saturday or Sunday).
     * @param {string | null} dateTimeString - The datetime string (e.g., 'YYYY-MM-DD HH:MM:SS') or null.
     * @returns {boolean} True if the date is a Saturday or Sunday, false otherwise or if input is null/invalid.
     */
    function isWeekend(dateTimeString) {
        if (!dateTimeString) {
            return false;
        }
        try {
            // Replace space with 'T' and add 'Z' to parse as UTC for consistency
            // Alternatively, parse without Z if times are meant to be local. Choose based on system design.
            // Assuming UTC for safety as ISOString conversion implies UTC.
            const isoString = dateTimeString.replace(' ', 'T') + 'Z';
            const date = new Date(isoString);
            if (isNaN(date.getTime())) { // Check for invalid date
                 console.warn(`[isWeekend Warning] Could not parse date: ${dateTimeString}`);
                 return false;
            }
            const day = date.getUTCDay(); // Use getUTCDay() if parsing as UTC
            return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
        } catch (e) {
            console.warn(`[isWeekend Error] Error processing date: ${dateTimeString}`, e);
            return false;
        }
    }

    // --- Data Loading and Processing ---
    // ...
    ```

*   **Step 2.4: Adjust Generation Logic Based on Scenario**
    *   Modify the core generation functions (`generateOrders`, `generateJobsAndServices`, `generateVanEquipment`) to check the `scenario` variable and adjust parameters or logic accordingly.

    ```javascript
    // --- Generation Functions ---

    function generateOrders(count, customerUsers /* REMOVED: addresses */) {
        // ... (existing setup) ...
        // Example Scenario Adjustment: Maybe generate fewer orders for a simple test
        if (scenario === 'minimal') {
             count = Math.min(count, 3); // Ensure only a few orders
             console.log(`[Seed Generator - Scenario: ${scenario}] Limiting orders to ${count}.`);
        }
        // ... (rest of order generation) ...
    }

    function generateJobsAndServices(orders, customerVehicles, services, vehicleYmmMap /* REMOVED: ymmServiceValidityMap */) {
        console.log(`Generating jobs for ${orders.length} orders (Scenario: ${scenario})...`);
        // ... (existing setup) ...

        let localFixedScheduleProb = FIXED_SCHEDULE_PROB;
        if (scenario === 'high-fixed') {
            localFixedScheduleProb = 0.8; // Increase probability for this scenario
            console.log(`[Seed Generator - Scenario: ${scenario}] Increased fixed schedule probability to ${localFixedScheduleProb}.`);
        }

        for (const order of orders) {
            // ... (existing vehicle selection) ...
            for (let i = 0; i < numJobs; i++) {
                // ... (existing service selection) ...

                // Adjust Fixed Time Generation based on Scenario
                let fixedTime = null;
                if (Math.random() < localFixedScheduleProb) { // Use adjusted probability
                    if (scenario === 'weekend-fixed') {
                        // Ensure generated time is a weekend
                        let attempt = 0;
                        do {
                            fixedTime = getRandomFutureDateTime(7);
                            attempt++;
                        } while (!isWeekend(fixedTime) && attempt < 10); // Try up to 10 times
                        if (!isWeekend(fixedTime)) {
                             console.warn(`[Seed Generator - Scenario: ${scenario}] Failed to generate a weekend fixed time after 10 attempts.`);
                             fixedTime = null; // Fallback to no fixed time
                        } else {
                             console.log(`[Seed Generator - Scenario: ${scenario}] Generated weekend fixed time: ${fixedTime}`);
                        }
                    } else {
                        // Default fixed time generation
                        fixedTime = getRandomFutureDateTime(7);
                    }
                }

                const job = {
                    // ... (other job properties) ...
                    fixed_schedule_time: fixedTime, // Assign potentially scenario-adjusted time
                    // ...
                };
                jobs.push(job);
                // ...
            }
        }
        return { generatedJobs: jobs, generatedOrderServices: orderServices };
    }

    function generateVanEquipment(vans, equipment) {
         console.log(`Generating van equipment links (Scenario: ${scenario})...`);
         // ... (existing setup) ...

         // Example Scenario Adjustment: Equipment Scarcity
         if (scenario === 'equipment-scarce') {
             console.log(`[Seed Generator - Scenario: ${scenario}] Applying equipment scarcity rules.`);
             // Modify the rules (Rule 1-5) or the distribution logic
             // e.g., only assign 'diag' to van 1, skip assigning 'prog', assign fewer ADAS tools

             // --- MODIFIED EXAMPLE RULES for scarcity ---
             // Rule 1: Only van 1 gets diag
             if (diagEquip && vanIds.length >= 1) { addLink(vanIds[0], diagEquip.id); }
             // Rule 2: No vans get prog
             if (progEquip) { console.warn(`[Seed Generator - Scenario: ${scenario}] Skipping prog equipment assignment.`); }
             // Rule 3 & 4: No change assumed here
             if (immoEquip && vanIds.length >= 3) { addLink(vanIds[2], immoEquip.id); }
             if (airbagEquip && vanIds.length >= 4) { addLink(vanIds[3], airbagEquip.id); }
             // Rule 5: Assign fewer random ADAS tools
             const scarceNumOtherAdasToSelect = Math.floor(otherAdasEquip.length / 4); // Assign fewer
             const scarceSelectedRandomAdas = otherAdasEquip.slice(0, scarceNumOtherAdasToSelect);
             const scarceAllSelectedAdas = [...mandatoryAdasEquip, ...scarceSelectedRandomAdas];
             console.log(`[Seed Generator - Scenario: ${scenario}] Selecting ${mandatoryAdasEquip.length} mandatory and ${scarceSelectedRandomAdas.length} random ADAS tools.`);
             if (vanIds.length > 0) {
                 scarceAllSelectedAdas.forEach(adasTool => { /* ... distribution logic ... */ });
             }
             // --- END MODIFIED EXAMPLE ---
         } else {
             // --- DEFAULT RULES ---
             // (Original logic for Rules 1-5)
             // ...
             // --- END DEFAULT RULES ---
         }

         console.log(`Generated ${vanEquipmentLinks.length} van_equipment links.`);
         return vanEquipmentLinks;
    }
    ```

*   **Step 2.5: Collect and Write Metadata**
    *   Implement metadata collection and writing within the `main()` function, ensuring it captures data generated according to the active `scenario`. This part remains largely the same as Step 3 in the original plan, but the collected data (`fixedTimeJobs`, `weekendFixedTimeJobs`, etc.) will reflect the scenario's output.

    ```javascript
    // --- Main Execution ---
    function main() {
        try {
            // ... (load data, get generation timestamp) ...

            // *** Call SCENARIO-AWARE generation functions ***
            const generatedOrders = generateOrders(numOrders, customerUsers);
            const { generatedJobs, generatedOrderServices } = generateJobsAndServices(/*...*/);
            const generatedVanEquipment = generateVanEquipment(/*...*/);

            // --- Metadata Collection ---
            console.log('Collecting metadata for output...');
            const queuedJobIds = [];
            const fixedTimeJobs = [];
            const weekendFixedTimeJobs = [];
            const earliestTimeOrders = [];
            // *** ADD potentiallyUnschedulableJobIds collection if needed based on scenario ***
            const potentiallyUnschedulableJobIds = { equipment: [] };
            // Example: If scenario was 'equipment-scarce', maybe identify jobs needing unassigned equipment
            // if (scenario === 'equipment-scarce') {
            //    potentiallyUnschedulableJobIds.equipment = findUnschedulableJobs(...); // Requires extra logic
            // }

            for (const job of generatedJobs) {
                queuedJobIds.push(job.id);
                if (job.fixed_schedule_time) {
                    // Use ISO strings for consistency in JSON
                    const fixedTimeISO = new Date(job.fixed_schedule_time.replace(' ', 'T') + 'Z').toISOString();
                    const jobMetadata = { jobId: job.id, fixedTimeISO: fixedTimeISO };
                    if (isWeekend(job.fixed_schedule_time)) {
                        weekendFixedTimeJobs.push(jobMetadata);
                    } else {
                        fixedTimeJobs.push(jobMetadata);
                    }
                }
            }
            // ... (collect earliestTimeOrders as in original plan) ...

            const metadata = {
                generationDate: generationTimestamp.toISOString(),
                scenario: scenario, // Include the scenario used in the metadata
                parameters: { /* ... */ },
                counts: { /* ... */ },
                queuedJobIds: queuedJobIds,
                fixedTimeJobs: fixedTimeJobs,
                weekendFixedTimeJobs: weekendFixedTimeJobs,
                earliestTimeOrders: earliestTimeOrders,
                potentiallyUnschedulableJobIds: potentiallyUnschedulableJobIds,
            };
            // --- End Metadata Collection ---

            // ... (Generate SQL output) ...
            // ... (Write SQL file) ...

            // --- Write Metadata to JSON File ---
            try {
                fs.writeFileSync(METADATA_OUTPUT_FILE, JSON.stringify(metadata, null, 2));
                console.log(`Successfully wrote seed metadata to ${METADATA_OUTPUT_FILE}`);
            } catch (writeError) {
                 console.error(`Error writing metadata file:`, writeError);
            }
            // --- End Write Metadata ---

        } catch (error) {
            console.error('Error generating dynamic seed data:', error);
            process.exit(1);
        }
    }

    // Run the main function
    main();
    ```

**Phase 3: Verify Test Compatibility (`tests/e2e/e2e.test.ts`)**

*   **Step 3.1: Update `ScenarioMetadata` Interface**
    *   Ensure the interface in `tests/e2e/e2e.test.ts` includes the new `scenario` field and any other fields added.

    ```typescript
    // tests/e2e/e2e.test.ts
    interface ScenarioMetadata {
      generationDate?: string;
      scenario?: string; // <-- ADDED
      parameters?: any;
      counts?: any;
      queuedJobIds: number[];
      fixedTimeJobs: { jobId: number; fixedTimeISO: string }[];
      weekendFixedTimeJobs: { jobId: number; fixedTimeISO: string }[];
      earliestTimeOrders: { orderId: number; earliestTimeISO: string }[];
      potentiallyUnschedulableJobIds?: {
        equipment: number[];
      };
    }
    ```

*   **Step 3.2: (Optional) Scenario-Specific Assertions**
    *   Consider adding `if (scenarioMetadata.scenario === '...')` blocks within the test (`it(...)` block) to perform assertions specific to the generated scenario. For example, if `scenario === 'weekend-fixed'`, assert that the `weekendFixedTimeJobs` array is not empty.

**Phase 4: Run and Test**

1.  Execute the modified generator *via the test runner* with different scenarios:
    ```bash
    node SIMULATION/run-e2e-tests.js --scenario=default
    node SIMULATION/run-e2e-tests.js --scenario=weekend-fixed
    node SIMULATION/run-e2e-tests.js --scenario=equipment-scarce
    # etc.
    ```
2.  Verify that the generated `seed-metadata.json` and `07-generated-seed-data.sql` reflect the requested scenario.
3.  Confirm that the E2E tests (`npm run test:e2e` or similar, triggered by the runner script) pass and correctly validate against the scenario-specific metadata.

This updated plan integrates scenario control via command-line arguments into the dynamic data generation and metadata output process.