# E2E Framework Task: Stage 5 - Database Seeding (Scenarios)

**Goal:** Implement individual scripts for each defined E2E test scenario, adding dynamic data on top of the baseline.
                            
**Dependencies:** Stage 3 (Baseline Seeding Logic & Data), Stage 4 (Cleanup - called by baseline).

**Tasks:**

-   [ ] **Create Scenario Directory:**
    -   Ensure `simulation/scripts/db/seed/scenarios/` exists.
-   [ ] **Implement Scenario Files (`*.ts`):**
    -   For **each** scenario defined in `docs/proposals/test-scripts-plan.md` (Section 4.3, points 1-10+), create a corresponding `.ts` file (e.g., `equipment_conflict.ts`, `fixed_time_today.ts`).                       *   **Structure:**
        *   Each file should export an `async function seedScenario_<scenario_name>(supabase: SupabaseClient<Database>, baselineData: BaselineRefs): Promise<ScenarioMetadataUpdate>`.
                                    *   `baselineData`: An object passed from the main seed script containing relevant IDs created during the baseline run (e.g., technician IDs/van IDs, existing address IDs, service IDs, ymm IDs). This avoids hardcoding IDs.
                                                                *   `ScenarioMetadataUpdate`: An object containing the specific IDs created/used in *this* scenario (e.g., `{ missingEquipmentJobId: 123 }`) to be merged into the final `seed-metadata.json`.                      *   **Functionality:**
        1.  Import dependencies (`SupabaseClient`, types, `faker`, helper `insertData`).
        2.  Use `faker` to generate realistic but controlled data (e.g., specific dates for fixed times, notes indicating the scenario).
                                    3.  Reference IDs from the `baselineData` object.
        4.  Create necessary records (`orders`, `order_services`, `jobs`, `van_equipment`, `technician_availability_exceptions` etc.) specific to the scenario's requirements using the `insertData` helper.                    5.  Return an object containing the IDs relevant for verifying this scenario in the tests.
    *   **Example (`equipment_conflict.ts`):**
        ```typescript
        // simulation/scripts/db/seed/scenarios/equipment_conflict.ts
        import { SupabaseClient } from '@supabase/supabase-js';
        import { Database } from '../staged.database.types.ts';
        import { BaselineRefs, ScenarioMetadataUpdate } from '../types'; // Define these types
        import { insertData } from '../../utils/index.ts'; // Assuming helper moved

        export async function seedScenario_equipment_conflict(
            supabase: SupabaseClient<Database>,
            baselineData: BaselineRefs
        ): Promise<ScenarioMetadataUpdate> {
            console.log('Seeding scenario: equipment_conflict...');
            const conflictingServiceId = baselineData.serviceIds.find(s => s.name === 'ECM'); // Example    
            const testYmmId = baselineData.ymmIds[0]; // Use an existing YMM
            const testAddressId = baselineData.addressIds[5]; // Use an existing address
            const testUserId = baselineData.customerUserIds[0]; // Use an existing customer

            // 1. Create Order
            const order = await insertData(supabase, 'orders', [{
                user_id: testUserId,
                vehicle_id: baselineData.vehicleIds[0], // Use an existing vehicle
                address_id: testAddressId,
                notes: '[E2E_TEST] Order for equipment_conflict scenario',
                earliest_available_time: new Date().toISOString(),
            }]);
            const orderId = order[0].id;

            // 2. Link Service
            await insertData(supabase, 'order_services', [{ order_id: orderId, service_id: conflictingServiceId }]);
                            
            // 3. Create Job (Status: queued, Priority: 5)
            const job = await insertData(supabase, 'jobs', [{
                order_id: orderId,
                address_id: testAddressId,
                service_id: conflictingServiceId,
                status: 'queued',
                priority: 5,
                job_duration: 60,
                notes: '[E2E_TEST] Job requiring missing equipment',
            }]);
            const jobId = job[0].id;

            // 4. (Crucially) Ensure NO van has the required equipment (handled by baseline setup)

            console.log(`Seeded equipment_conflict: Order ${orderId}, Job ${jobId}`);
            return { missingEquipmentJobId: jobId }; // Return relevant ID for metadata
        }
        ```
-   [ ] **Update Seeding Entry Point (`index.ts`):**
    -   Modify `simulation/scripts/db/seed/index.ts` to:
        -   Import all `seedScenario_*` functions.
        -   After calling `seedBaseline`, call the selected scenario function based on CLI arguments, passing the Supabase client and collected baseline IDs.
                                    -   Generate `simulation/seed-metadata.json` by combining baseline info (timestamp, counts) and the scenario-specific IDs returned by the scenario function.
                            