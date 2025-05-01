import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Increase Jest timeout
// jest.setTimeout(90000); // 90 seconds

describe('Scheduler Integration - Fixed Time Today', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'fixed_time_today') {
                throw new Error(`Expected scenario metadata for 'fixed_time_today', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length !== 1) {
                throw new Error('Scenario metadata should contain exactly one job ID for fixed_time_today.');
            }
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Job ID: ${currentScenarioResult.insertedIds.jobs[0]}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should schedule the job exactly at its fixed_schedule_time', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs!.length).toEqual(1);

        const fixedJobId = currentScenarioResult.insertedIds.jobs![0];

        // Fetch the original fixed time from the DB before replan
        const { data: originalJob, error: fetchError } = await supabase
            .from('jobs')
            .select('fixed_schedule_time, assigned_technician')
            .eq('id', fixedJobId)
            .single();

        expect(fetchError).toBeNull();
        expect(originalJob).not.toBeNull();
        expect(originalJob!.fixed_schedule_time).not.toBeNull();
        const expectedScheduleTime = originalJob!.fixed_schedule_time!;
        // Technician might be null if eligibility check fails later, but seed assigns one
        // const expectedTechnician = originalJob!.assigned_technician!;

        console.log(`Triggering scheduler replan for fixed job ID: ${fixedJobId}...`);
        await triggerSchedulerReplan();

        console.log(`Waiting for replan to complete (expecting job ${fixedJobId} scheduled)...`);
        // Wait for the job to have an estimated schedule
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('id, estimated_sched, status')
                .eq('id', fixedJobId)
                .single();

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const isScheduled = job?.estimated_sched !== null && job?.status === 'queued'; // Should become queued
            if (isScheduled) {
                console.log(`Condition met: Job ${fixedJobId} has estimated schedule and status 'queued'.`);
            } else {
                console.log(`Condition not met: Job ${fixedJobId} status '${job?.status}', schedule '${job?.estimated_sched}'.`);
            }
            return isScheduled;
        };
        // Fixed time jobs might take longer if complex interactions
        await waitForReplan(checkCondition, 90000, 4000);

        console.log('Replan complete. Verifying schedule...');

        // Fetch final state of the job
        const { data: finalJob, error: jobError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, fixed_schedule_time')
            .eq('id', fixedJobId)
            .single();

        expect(jobError).toBeNull();
        expect(finalJob).not.toBeNull();

        // Assertions for the fixed time today scenario
        expect(finalJob!.status).toEqual('queued');
        expect(finalJob!.assigned_technician).not.toBeNull(); // Should be assigned
        expect(finalJob!.estimated_sched).not.toBeNull();

        // *** Crucial Check: Verify estimated schedule matches the original fixed time ***
        expect(dayjs(finalJob!.estimated_sched).utc().toISOString()).toEqual(dayjs(expectedScheduleTime).utc().toISOString());
        // Optional: Check against the fixed_schedule_time column as well, though it shouldn't change
        expect(dayjs(finalJob!.fixed_schedule_time).utc().toISOString()).toEqual(dayjs(expectedScheduleTime).utc().toISOString());

        console.log('Fixed time today verification successful: Job scheduled exactly at fixed time.');
    });
});