import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';

// Increase Jest timeout if needed, or set globally
// jest.setTimeout(60000); // 60 seconds might be sufficient now

describe('Scheduler Integration - Unresolvable Equipment Conflict', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    // Hold IDs relevant to this scenario
    let conflictedJobId: number | undefined; // Expecting one job in this scenario

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup (Unresolvable Equipment Conflict): Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata(); // Still potentially useful for context
            currentScenarioResult = await readCurrentScenarioMetadata();

            // Validate scenario name
            if (currentScenarioResult.scenarioName !== 'equipment_conflict') {
                throw new Error(`Expected scenario metadata for 'equipment_conflict', but found '${currentScenarioResult.scenarioName}'.`);
            }

            // Extract the job ID expected to have the conflict
            const scenarioJobIds = currentScenarioResult.insertedIds?.jobs ?? [];
            if (scenarioJobIds.length !== 1) {
                 // This specific test expects the scenario to create exactly one job
                 // If the seeding script changes, this expectation needs an update.
                console.warn(`Expected exactly 1 job ID for 'equipment_conflict' scenario, but found ${scenarioJobIds.length}. Using the first one.`);
                 // throw new Error(`Expected exactly 1 job ID for 'equipment_conflict' scenario, but found ${scenarioJobIds.length}.`);
            }
             conflictedJobId = scenarioJobIds[0]; // Take the first job ID provided by the scenario
             if (!conflictedJobId) {
                 throw new Error('Scenario metadata is missing the job ID for equipment_conflict.');
             }


            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Conflicted Job ID: ${conflictedJobId}`);
            console.log('--- Test Setup (Unresolvable Equipment Conflict) Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error; // Fail fast if setup has issues
        }
    }, 30000); // Timeout for setup

    it('should leave the job as pending_review with no technician when required equipment is unavailable', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(conflictedJobId).toBeDefined();


        console.log(`Triggering scheduler replan for conflicted job ID: ${conflictedJobId}...`);
        await triggerSchedulerReplan();

        console.log('Waiting for scheduler to process (expecting job to remain unscheduled)...');

        // Wait condition: Check if the job status remains 'pending_review' after some time.
        // This assumes the scheduler tries and fails relatively quickly.
        // A simple fixed wait could also work but is less robust.
        let finalStatus = '';
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('status')
                .eq('id', conflictedJobId!)
                .single(); // Expecting exactly one job

            if (error) {
                console.error('DB query error during wait:', error);
                return false; // Don't resolve if DB query fails
            }
            if (!job) {
                console.error(`Job with ID ${conflictedJobId} not found during wait.`);
                return false; // Job missing, something is wrong
            }
            finalStatus = job.status;
             // We are waiting for the status to *not* be something like 'queued' or 'en_route'
             // Let's consider the condition met if the status settles on something non-scheduled
             // or if enough time passes. A simpler approach for now is to just wait a fixed time
             // and then check the status. Let's switch waitForReplan to a simpler fixed wait here.

             // Returning true immediately effectively turns waitForReplan into a single check delay.
             // Alternatively, remove waitForReplan and use a simple setTimeout.
             // For now, let's just check the status once after a delay.
             return true; // Let waitForReplan run its interval once
        };

        // Wait a shorter fixed period, assuming the scheduler attempts and fails quickly
        try {
            await waitForReplan(checkCondition, 20000, 15000); // Wait up to 20s, check once after 15s
        } catch (e) {
            // Ignore timeout here, we expect it might not "complete" in the traditional sense
            console.log("Wait potentially timed out (expected for unscheduled job), proceeding to check status.");
        }


        console.log('Replan attempt finished. Verifying job status...');

        // Fetch final state of the specific job
        const { data: finalJobState, error: jobError } = await supabase
            .from('jobs')
            .select('id, status, estimated_sched, assigned_technician')
            .eq('id', conflictedJobId!)
            .single(); // Expecting exactly one job

        expect(jobError).toBeNull();
        expect(finalJobState).not.toBeNull();

        // --- Assertions ---
        console.log(`Final status for job ${finalJobState!.id}: ${finalJobState!.status}`);
        // 1. Verify Status: Job should remain 'pending_review' or potentially 'cancelled'
        //    Adjust this expected status based on the scheduler's actual behavior for unresolvable conflicts.
        expect(finalJobState!.status).toEqual('pending_review'); // Or potentially .toMatch(/pending_review|cancelled/)

        // 2. Verify No Technician Assigned
        expect(finalJobState!.assigned_technician).toBeNull();

        // 3. Verify No Schedule Time
        expect(finalJobState!.estimated_sched).toBeNull();

        console.log('Unresolvable equipment conflict verification successful: Job remained unscheduled.');
    });

    // No complex cleanup needed for this specific test beyond what the runner might do
    // afterAll(async () => {
    //     // console.log('--- Test Teardown (Unresolvable Equipment Conflict) ---');
    //     // console.log('--- Test Teardown Complete ---');
    // });
});