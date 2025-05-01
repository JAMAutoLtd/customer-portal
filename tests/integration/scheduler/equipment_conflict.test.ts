import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';

// Increase Jest timeout for this potentially long-running test suite
// jest.setTimeout(90000); // 90 seconds - Alternatively set globally in jest.config.js

describe('Scheduler Integration - Equipment Conflict', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'equipment_conflict') {
                throw new Error(`Expected scenario metadata for 'equipment_conflict', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length !== 1) {
                throw new Error('Scenario metadata should contain exactly one job ID for equipment_conflict.');
            }
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Job ID: ${currentScenarioResult.insertedIds.jobs[0]}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should mark the job as pending_review due to equipment conflict', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs!.length).toEqual(1);

        const conflictedJobId = currentScenarioResult.insertedIds.jobs![0];

        console.log(`Triggering scheduler replan for job ID: ${conflictedJobId}...`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (expecting pending_review status)...');
        // Since the job is expected to fail quickly due to eligibility,
        // we wait for the status to become 'pending_review' instead of scheduled.
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('status')
                .eq('id', conflictedJobId)
                .single();

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const isPendingReview = job?.status === 'pending_review';
            if (isPendingReview) {
                console.log(`Condition met: Job ${conflictedJobId} status is 'pending_review'.`);
            } else {
                console.log(`Condition not met: Job ${conflictedJobId} status is '${job?.status}', expected 'pending_review'.`);
            }
            return isPendingReview;
        };
        // Use a shorter timeout as eligibility failure should be quick
        await waitForReplan(checkCondition, 45000, 3000);

        console.log('Replan complete. Verifying job status...');

        // Fetch final state of the conflicted job
        const { data: finalJob, error: jobError } = await supabase
            .from('jobs')
            .select('id, status, notes, assigned_technician, estimated_sched') // Include assigned_technician and estimated_sched
            .eq('id', conflictedJobId)
            .single();

        expect(jobError).toBeNull();
        expect(finalJob).not.toBeNull();

        // Assertions for the equipment conflict scenario
        expect(finalJob!.status).toEqual('pending_review');
        expect(finalJob!.assigned_technician).toBeNull();
        expect(finalJob!.estimated_sched).toBeNull();
        // Optionally, check notes if the scheduler adds conflict details there
        // expect(finalJob!.notes).toContain('equipment conflict');

        console.log('Equipment conflict verification successful: Job marked pending_review.');
    });
});