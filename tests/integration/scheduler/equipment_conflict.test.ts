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
// jest.setTimeout(90000);

describe('Scheduler Integration - Equipment Conflict', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files (Equipment Conflict) ---');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            // Validation specific to this test
            if (currentScenarioResult.scenarioName !== 'equipment_conflict') {
                throw new Error(`Expected scenario metadata for 'equipment_conflict', but found '${currentScenarioResult.scenarioName}'.`);
            }
            // Ensure we have jobs to check
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length === 0) {
                throw new Error('Scenario metadata is missing job IDs for equipment_conflict.');
            }
            // Equipment conflict scenario expects exactly one job
             if (currentScenarioResult.insertedIds.jobs.length !== 1) {
                 console.warn(`Expected 1 job for equipment_conflict, but metadata contains ${currentScenarioResult.insertedIds.jobs.length}. Test logic might need adjustment.`);
             }

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Scenario Jobs: ${currentScenarioResult.insertedIds.jobs?.length ?? 0}`);
            console.log('--- Test Setup Complete (Equipment Conflict) ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata (Equipment Conflict):', error);
            throw error; // Halt tests if setup fails
        }
    }, 30000);

    it('should leave the job unscheduled due to equipment conflict after replan', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs).toBeDefined();

        const scenarioJobIds = currentScenarioResult.insertedIds.jobs!;
        const theConflictedJobId = scenarioJobIds[0]; // Assuming the first ID is the one we care about

        console.log('Triggering scheduler replan (Equipment Conflict)...');
        await triggerSchedulerReplan();

        console.log('Waiting for replan process to settle (may not reach "scheduled" state)...');
        // We don't expect the conflicted job to become 'scheduled'.
        // Instead, we might wait for other potential jobs to finish scheduling,
        // or simply wait a fixed time, assuming the replan finishes reasonably quickly.
        // For this specific scenario (one job), let's check if the job *remains* in a non-scheduled state.
        // A simple timeout might suffice, assuming replan finishes within that time.
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds for replan attempt

        console.log('Checking status of the conflicted job...');

        const { data: jobData, error: jobError } = await supabase
            .from('jobs')
            .select('status, assigned_technician_id')
            .eq('id', theConflictedJobId)
            .maybeSingle(); // Expecting one or zero results if deleted/error

        expect(jobError).toBeNull();
        expect(jobData).not.toBeNull(); // The job should still exist

        // Core assertion: The job should NOT be scheduled and should have no technician assigned
        expect(jobData!.status).not.toEqual('scheduled');
        // It might be 'pending_review', 'queued', or potentially another status depending on exact logic
        console.log(`Conflicted job status: ${jobData!.status}`);
        expect(jobData!.assigned_technician_id).toBeNull();

        console.log('Equipment conflict verification successful: Job remained unscheduled.');
    });

    // afterAll(async () => {
    //     // Cleanup if necessary
    // });
}); 