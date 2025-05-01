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
import isBetween from 'dayjs/plugin/isBetween'; // Import isBetween plugin if needed for overlap check

dayjs.extend(utc);
dayjs.extend(isBetween); // Extend dayjs with the isBetween plugin

// Increase Jest timeout
// jest.setTimeout(90000);

describe('Scheduler Integration - Technician Unavailable Today', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;
    let unavailableTechId: number;
    let timeOffStartUTC: string;
    let timeOffEndUTC: string;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files & Exception --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'technician_unavailable_today') {
                throw new Error(`Expected scenario metadata for 'technician_unavailable_today', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length === 0) {
                throw new Error('Scenario metadata is missing job IDs.');
            }
            if (!currentScenarioResult.insertedIds?.technician_availability_exceptions || currentScenarioResult.insertedIds.technician_availability_exceptions.length !== 1) {
                throw new Error('Scenario metadata should contain exactly one exception ID.');
            }

            const exceptionId = currentScenarioResult.insertedIds.technician_availability_exceptions[0];

            // Fetch the exception details to get the affected tech and the intended time range
            const { data: exception, error: fetchError } = await supabase
                .from('technician_availability_exceptions')
                .select('technician_id, date, reason') // Assuming reason contains time info or we hardcode based on seed
                .eq('id', exceptionId)
                .single();

            if (fetchError || !exception) {
                throw fetchError || new Error(`Could not fetch exception details for ID ${exceptionId}.`);
            }
            unavailableTechId = exception.technician_id;

            // Reconstruct the intended unavailable time window based on seed script logic
            // Seed script uses 13:00-15:00 UTC today
            const today = dayjs.utc().format('YYYY-MM-DD');
            timeOffStartUTC = dayjs.utc(`${today}T13:00:00Z`).toISOString();
            timeOffEndUTC = dayjs.utc(`${today}T15:00:00Z`).toISOString();

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Tech ID ${unavailableTechId} unavailable ${timeOffStartUTC} - ${timeOffEndUTC}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed:', error);
            throw error;
        }
    }, 45000);

    it('should not schedule jobs for the technician during their time off', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(unavailableTechId).toBeDefined();
        expect(timeOffStartUTC).toBeDefined();
        expect(timeOffEndUTC).toBeDefined();

        const jobIds = currentScenarioResult.insertedIds.jobs!;

        console.log(`Triggering scheduler replan... Tech ${unavailableTechId} has time off.`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (expecting jobs scheduled)...');
        // Wait for most jobs to be scheduled (some might remain unscheduled if capacity is tight)
        const checkCondition = async (): Promise<boolean> => {
            const { count, error } = await supabase
                .from('jobs')
                .select('id', { count: 'exact', head: true })
                .in('id', jobIds)
                .not('estimated_sched', 'is', null); // Check if scheduled

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            // Consider replan complete if at least *some* jobs are scheduled
            const someJobsScheduled = count !== null && count > 0;
            if (someJobsScheduled) {
                 console.log(`Condition met: Found ${count} scheduled jobs.`);
            } else {
                console.log(`Condition not met: No jobs scheduled yet.`);
            }
            // We don't wait for *all* jobs, just for the process to likely finish
            return someJobsScheduled;
        };
        await waitForReplan(checkCondition, 90000, 5000);

        console.log('Replan complete. Verifying schedule...');

        // Fetch final state of ALL jobs in the scenario
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, job_duration')
            .in('id', jobIds)
            .order('estimated_sched', { ascending: true, nullsFirst: true });

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();

        // Assertions for the technician unavailable scenario
        let scheduledDuringTimeOff = false;
        for (const job of finalJobs!) {
            // Check ONLY jobs assigned to the technician who had time off
            if (job.assigned_technician === unavailableTechId) {
                expect(job.estimated_sched).not.toBeNull(); // Should be scheduled if assigned
                expect(job.job_duration).not.toBeNull();

                const jobStart = dayjs(job.estimated_sched).utc();
                // Ensure job_duration is not null before adding
                const jobEnd = job.job_duration ? jobStart.add(job.job_duration, 'minute') : jobStart;

                // Check if the job interval [jobStart, jobEnd) overlaps with [timeOffStart, timeOffEnd)
                // Using simple comparison as dayjs.isBetween might have issues with exact boundaries
                const overlaps = jobStart.isBefore(timeOffEndUTC) && jobEnd.isAfter(timeOffStartUTC);


                if (overlaps) {
                    console.error(`Job ${job.id} assigned to Tech ${unavailableTechId} (${jobStart.toISOString()} - ${jobEnd.toISOString()}) overlaps with time off (${timeOffStartUTC} - ${timeOffEndUTC})`);
                    scheduledDuringTimeOff = true;
                }
            }
        }

        expect(scheduledDuringTimeOff).toBe(false);

        console.log(`Technician unavailable verification successful: No jobs assigned to Tech ${unavailableTechId} during their intended time off.`);
    });
});