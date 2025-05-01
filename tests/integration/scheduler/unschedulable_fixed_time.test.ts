import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
    cleanupScenarioData // Import cleanup utility
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Increase Jest timeout if needed for potentially longer replan due to conflicts
jest.setTimeout(90000); // 90 seconds

describe('Scheduler Integration - Unschedulable Fixed Time', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files (Unschedulable Fixed Time) --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'unschedulable_fixed_time') {
                throw new Error(`Expected scenario metadata for 'unschedulable_fixed_time', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length !== 1) {
                throw new Error('Scenario metadata should contain exactly one job ID for unschedulable_fixed_time.');
            }
            if (!currentScenarioResult.insertedIds?.technician_availability_exceptions || currentScenarioResult.insertedIds.technician_availability_exceptions.length !== 1) {
                throw new Error('Scenario metadata should contain exactly one availability exception ID.');
            }
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Job ID: ${currentScenarioResult.insertedIds.jobs[0]}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    // Cleanup after tests in this describe block
    afterAll(async () => {
        console.log('--- Test Teardown: Cleaning Up Scenario Data (Unschedulable Fixed Time) --- ');
        if (currentScenarioResult?.insertedIds) {
            await cleanupScenarioData(currentScenarioResult.insertedIds);
        } else {
            console.log('Skipping cleanup: No scenario metadata available.');
        }
        console.log('--- Test Teardown Complete ---');
    }, 45000); // Slightly longer timeout for cleanup

    it('should mark the job as pending_review when fixed time is impossible', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs!.length).toEqual(1);

        const unschedulableJobId = currentScenarioResult.insertedIds.jobs![0];

        // Fetch the original fixed time and status
        const { data: originalJob, error: fetchError } = await supabase
            .from('jobs')
            .select('status, fixed_schedule_time')
            .eq('id', unschedulableJobId)
            .single();

        expect(fetchError).toBeNull();
        expect(originalJob).not.toBeNull();
        expect(originalJob!.status).toEqual('fixed_time'); // Verify initial state
        expect(originalJob!.fixed_schedule_time).not.toBeNull();

        console.log(`Triggering scheduler replan for unschedulable fixed job ID: ${unschedulableJobId}...`);
        await triggerSchedulerReplan();

        console.log(`Waiting for replan to complete (expecting job ${unschedulableJobId} to become pending_review)...`);

        // Wait for the job status to change from 'fixed_time'
        // It might briefly become 'queued' if logic attempts it, but should settle on 'pending_review'
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('id, status, estimated_sched')
                .eq('id', unschedulableJobId)
                .single();

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const isPendingReview = job?.status === 'pending_review';
            if (isPendingReview) {
                console.log(`Condition met: Job ${unschedulableJobId} status is 'pending_review'.`);
            } else {
                console.log(`Condition not met: Job ${unschedulableJobId} status is '${job?.status}'. Waiting...`);
            }
            return isPendingReview;
        };

        await waitForReplan(checkCondition, 60000, 3000); // Wait up to 60s, check every 3s

        console.log('Replan complete. Verifying final job status...');

        // Fetch final state of the job
        const { data: finalJob, error: jobError } = await supabase
            .from('jobs')
            .select('id, status, estimated_sched, fixed_schedule_time')
            .eq('id', unschedulableJobId)
            .single();

        expect(jobError).toBeNull();
        expect(finalJob).not.toBeNull();

        // *** Crucial Check: Verify the final status is pending_review ***
        expect(finalJob!.status).toEqual('pending_review');

        // The estimated schedule should likely be null as it wasn't placed
        expect(finalJob!.estimated_sched).toBeNull();

        // The fixed_schedule_time should remain unchanged
        expect(dayjs(finalJob!.fixed_schedule_time).utc().toISOString()).toEqual(dayjs(originalJob!.fixed_schedule_time).utc().toISOString());

        console.log('Unschedulable fixed time verification successful: Job status is pending_review.');
    });
}); 