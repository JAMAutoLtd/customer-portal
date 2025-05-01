import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';

// jest.setTimeout(90000);

describe('Scheduler Integration - Long Duration Job', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'long_duration_job') {
                throw new Error(`Expected scenario metadata for 'long_duration_job', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length !== 1) {
                throw new Error('Scenario metadata should contain exactly one job ID for long_duration_job.');
            }
            if (!currentScenarioResult.insertedIds?.technicianDbIds || currentScenarioResult.insertedIds.technicianDbIds.length === 0) {
                throw new Error('Scenario metadata is missing technician DB IDs.');
            }
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Job ID: ${currentScenarioResult.insertedIds.jobs[0]}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should schedule the long duration job correctly', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs!.length).toEqual(1);
        expect(currentScenarioResult.insertedIds.technicianDbIds).toBeDefined();

        const jobId = currentScenarioResult.insertedIds.jobs![0];
        const validTechnicianDbIds = currentScenarioResult.insertedIds.technicianDbIds!;

        console.log(`Triggering scheduler replan for long duration job: ${jobId}...`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (expecting job scheduled)...');
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('id, estimated_sched, status')
                .eq('id', jobId)
                .single();

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const isScheduled = job?.estimated_sched !== null && job?.status === 'queued';
            if (isScheduled) {
                console.log(`Condition met: Long duration job ${jobId} has estimated schedule and status 'queued'.`);
            } else {
                console.log(`Condition not met: Long duration job ${jobId} status '${job?.status}', schedule '${job?.estimated_sched}'.`);
            }
            return isScheduled;
        };
        await waitForReplan(checkCondition, 90000, 4000); // Standard wait time

        console.log('Replan complete. Verifying schedule...');

        // Fetch final state of the job
        const { data: finalJob, error: jobError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, job_duration')
            .eq('id', jobId)
            .single();

        expect(jobError).toBeNull();
        expect(finalJob).not.toBeNull();

        // Assertions for the long duration job scenario
        expect(finalJob!.status).toEqual('queued');
        expect(finalJob!.assigned_technician).not.toBeNull();
        expect(validTechnicianDbIds).toContain(finalJob!.assigned_technician); // Verify assigned tech is valid
        expect(finalJob!.estimated_sched).not.toBeNull();
        expect(finalJob!.job_duration).toBeGreaterThanOrEqual(360); // Verify it's still the long duration (6+ hours)

        // Optional: Could add checks to ensure this job doesn't cause overlaps if other jobs existed

        console.log('Long duration job verification successful: Job scheduled correctly.');
    });
}); 