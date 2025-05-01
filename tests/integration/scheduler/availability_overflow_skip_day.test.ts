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
// jest.setTimeout(180000); // Allow more time for multi-day overflow

describe('Scheduler Integration - Availability Overflow Skip Day', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;
    let tomorrowDateString: string;
    let dayAfterTomorrowDateString: string;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files & Dates --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'availability_overflow_skip_day') {
                throw new Error(`Expected scenario metadata for 'availability_overflow_skip_day', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length === 0) {
                throw new Error('Scenario metadata is missing job IDs.');
            }
            if (!currentScenarioResult.insertedIds?.technician_availability_exceptions || currentScenarioResult.insertedIds.technician_availability_exceptions.length === 0) {
                throw new Error('Scenario metadata is missing exception IDs.');
            }

            // Calculate date strings for verification
            const today = dayjs.utc();
            tomorrowDateString = today.add(1, 'day').format('YYYY-MM-DD');
            dayAfterTomorrowDateString = today.add(2, 'day').format('YYYY-MM-DD');

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Jobs: ${currentScenarioResult.insertedIds.jobs.length}. Expecting skip of ${tomorrowDateString}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed:', error);
            throw error;
        }
    }, 45000);

    it('should schedule overflow jobs on Day+2 or later, skipping the unavailable Day+1', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(tomorrowDateString).toBeDefined();
        expect(dayAfterTomorrowDateString).toBeDefined();

        const jobIds = currentScenarioResult.insertedIds.jobs!;

        console.log(`Triggering scheduler replan... All techs unavailable on ${tomorrowDateString}.`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (expecting jobs scheduled)...');
        // Wait for at least some jobs to be scheduled. Due to the large number of jobs,
        // not all might get scheduled within reasonable overflow limits.
        const checkCondition = async (): Promise<boolean> => {
            const { count, error } = await supabase
                .from('jobs')
                .select('id', { count: 'exact', head: true })
                .in('id', jobIds)
                .not('estimated_sched', 'is', null);

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const someJobsScheduled = count !== null && count > 0;
            if (someJobsScheduled) {
                 console.log(`Condition met: Found ${count} scheduled jobs.`);
            } else {
                console.log(`Condition not met: No jobs scheduled yet.`);
            }
            return someJobsScheduled;
        };
        await waitForReplan(checkCondition, 180000, 6000); // Allow ample time

        console.log('Replan complete. Verifying schedule dates...');

        // Fetch final state of ALL jobs in the scenario
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, estimated_sched')
            .in('id', jobIds)
            .order('estimated_sched', { ascending: true, nullsFirst: true });

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();

        // Assertions for the skip day scenario
        let foundJobOnSkippedDay = false;
        let foundJobOnExpectedDay = false;

        for (const job of finalJobs!) {
            if (job.estimated_sched) {
                const scheduleDate = dayjs(job.estimated_sched).utc().format('YYYY-MM-DD');
                // *** Crucial Check: Ensure NO jobs are scheduled for tomorrow (Day+1) ***
                if (scheduleDate === tomorrowDateString) {
                    console.error(`Error: Job ${job.id} was scheduled on the supposedly unavailable day: ${scheduleDate}`);
                    foundJobOnSkippedDay = true;
                }
                // Check if at least some jobs landed on Day+2 or later
                if (scheduleDate >= dayAfterTomorrowDateString) {
                    foundJobOnExpectedDay = true;
                }
            }
        }

        expect(foundJobOnSkippedDay).toBe(false);
        expect(foundJobOnExpectedDay).toBe(true); // Ensure the overflow actually happened past the skipped day

        console.log(`Availability skip day verification successful: No jobs on ${tomorrowDateString}, some jobs on/after ${dayAfterTomorrowDateString}.`);
    });
});