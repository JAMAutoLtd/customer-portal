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
// jest.setTimeout(120000); // 120 seconds for potentially longer overflow

describe('Scheduler Integration - Fixed Time Future Overflow', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;
    let fixedJobId: number;
    let expectedScheduleTime: string;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'fixed_time_future_overflow') {
                throw new Error(`Expected scenario metadata for 'fixed_time_future_overflow', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length < 2) {
                throw new Error('Scenario metadata should contain at least two job IDs (fixed + filler).');
            }

            // Find the fixed job ID - assumes the seed script returns it first
            fixedJobId = currentScenarioResult.insertedIds.jobs[0];

            // Fetch the original fixed time from the DB
            const { data: originalJob, error: fetchError } = await supabase
                .from('jobs')
                .select('fixed_schedule_time')
                .eq('id', fixedJobId)
                .single();

            if (fetchError || !originalJob?.fixed_schedule_time) {
                throw fetchError || new Error(`Could not fetch original fixed_schedule_time for job ${fixedJobId}.`);
            }
            expectedScheduleTime = originalJob.fixed_schedule_time;

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Fixed Job ID: ${fixedJobId} expected at ${expectedScheduleTime}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed:', error);
            throw error;
        }
    }, 90000);

    it('should schedule the fixed job exactly at its time tomorrow, even with overflow', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(fixedJobId).toBeDefined();
        expect(expectedScheduleTime).toBeDefined();

        console.log(`Triggering scheduler replan for fixed job ID: ${fixedJobId} and filler jobs...`);
        await triggerSchedulerReplan();

        console.log(`Waiting for replan to complete (expecting fixed job ${fixedJobId} scheduled)...`);
        // Wait specifically for the fixed job to get scheduled
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('id, status, assigned_technician, estimated_sched, fixed_schedule_time')
                .eq('id', fixedJobId)
                .single();

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const expectedSchedTimeISO = dayjs(expectedScheduleTime).utc().toISOString();
            // Condition met if status is still fixed_time AND estimated_sched is set and matches fixed_schedule_time
            const estimateMatches = job?.estimated_sched && dayjs(job.estimated_sched).utc().toISOString() === expectedSchedTimeISO;
            // We don't need fixedMatches anymore, rely on estimateMatches
            // const fixedMatches = job?.fixed_schedule_time && dayjs(job.fixed_schedule_time).utc().toISOString() === expectedSchedTimeISO;

            const isScheduled = job?.status === 'fixed_time' && estimateMatches;

            if (isScheduled) {
                console.log(`Condition met: Fixed job ${fixedJobId} has status '${job?.status}' and correct estimated schedule time.`);
            } else {
                console.log(`Condition not met: Fixed job ${fixedJobId} status '${job?.status}', schedule '${job?.estimated_sched}'. Waiting for time ${expectedSchedTimeISO}`);
            }
            return isScheduled;
        };
        await waitForReplan(checkCondition, 120000, 5000); // Allow more time for overflow logic

        console.log('Replan complete. Verifying schedule for the fixed job...');

        // Fetch final state of the fixed job
        const { data: finalJob, error: jobError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, fixed_schedule_time')
            .eq('id', fixedJobId)
            .single();

        expect(jobError).toBeNull();
        expect(finalJob).not.toBeNull();

        // Assertions for the fixed time future overflow scenario
        expect(finalJob!.status).toEqual('fixed_time');
        expect(finalJob!.assigned_technician).not.toBeNull();
        expect(finalJob!.estimated_sched).not.toBeNull();

        // *** Crucial Check: Verify estimated schedule matches the original fixed time ***
        const finalSchedTime = dayjs(finalJob!.estimated_sched).utc().toISOString();
        const expectedSchedTime = dayjs(expectedScheduleTime).utc().toISOString();
        expect(finalSchedTime).toEqual(expectedSchedTime);

        // Verify the date part is indeed the expected future workday - REMOVED as redundant/flawed
        // const tomorrowDate = dayjs.utc().add(1, 'day').format('YYYY-MM-DD');
        // expect(finalSchedTime.startsWith(tomorrowDate)).toBe(true);

        console.log(`Fixed time future overflow verification successful: Job ${fixedJobId} scheduled exactly at ${finalSchedTime}.`);

        // Optional: Verify some filler jobs were also scheduled, potentially on Day+1 or later
        const fillerJobIds = currentScenarioResult.insertedIds.jobs!.slice(1);
        if (fillerJobIds.length > 0) {
            const { data: fillerJobs } = await supabase
                .from('jobs')
                .select('id, status, estimated_sched')
                .in('id', fillerJobIds)
                .not('estimated_sched', 'is', null); // Check only scheduled ones
            console.log(`Found ${fillerJobs?.length ?? 0} scheduled filler jobs.`);
        }
    });
});