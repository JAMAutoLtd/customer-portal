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

const EXPECTED_TOTAL_JOBS = 4; // 1 fixed + 3 queued

describe('Scheduler Integration - Fixed Time Today', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;
    let fixedJobId: number; // Store the ID of the specific fixed job
    let queuedJobIds: number[]; // Store IDs of the queued jobs

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'fixed_time_today') {
                throw new Error(`Expected scenario metadata for 'fixed_time_today', but found '${currentScenarioResult.scenarioName}'.`);
            }
            // Expect multiple jobs now (1 fixed + N queued)
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length !== EXPECTED_TOTAL_JOBS) {
                throw new Error(`Scenario metadata should contain exactly ${EXPECTED_TOTAL_JOBS} job IDs for fixed_time_today.`);
            }
            
            // Assume the *first* ID in the list is the fixed job (based on seed script order)
            fixedJobId = currentScenarioResult.insertedIds.jobs[0];
            queuedJobIds = currentScenarioResult.insertedIds.jobs.slice(1);
            
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Fixed Job ID: ${fixedJobId}, Queued Job IDs: [${queuedJobIds.join(', ')}]`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should schedule the fixed job exactly at its fixed time and schedule the queued jobs', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(fixedJobId).toBeDefined();
        expect(queuedJobIds).toBeDefined();
        expect(queuedJobIds.length).toEqual(EXPECTED_TOTAL_JOBS - 1);
        const allJobIds = [fixedJobId, ...queuedJobIds]; // Combine IDs

        // Fetch the original fixed time from the DB before replan
        const { data: originalFixedJob, error: fetchError } = await supabase
            .from('jobs')
            .select('fixed_schedule_time')
            .eq('id', fixedJobId)
            .single();

        expect(fetchError).toBeNull();
        expect(originalFixedJob).not.toBeNull();
        expect(originalFixedJob!.fixed_schedule_time).not.toBeNull();
        const expectedFixedScheduleTime = originalFixedJob!.fixed_schedule_time!;

        console.log(`Triggering scheduler replan for fixed job ID: ${fixedJobId} and queued IDs: [${queuedJobIds.join(', ')}]...`);
        await triggerSchedulerReplan();

        console.log(`Waiting for replan to complete (expecting all ${EXPECTED_TOTAL_JOBS} jobs scheduled)...`);
        // Wait for ALL jobs to have an estimated schedule
        const checkCondition = async (): Promise<boolean> => {
            const { data: jobs, error } = await supabase
                .from('jobs')
                .select('id, estimated_sched, status')
                .in('id', allJobIds) // Check all seeded jobs
                .not('estimated_sched', 'is', null);
                // Allow 'pending_review' as a potential final state for queued jobs if unassigned

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            
            const scheduledOrReviewedCount = jobs?.length ?? 0;
            const allJobsProcessed = scheduledOrReviewedCount === allJobIds.length;
            
            if (allJobsProcessed) {
                console.log(`Condition met: All ${allJobIds.length} expected jobs have an estimated schedule or are otherwise processed.`);
            } else {
                console.log(`Condition not met: Found ${scheduledOrReviewedCount} jobs processed, expected ${allJobIds.length}.`);
            }
            return allJobsProcessed;
        };
        // Give it potentially more time as we wait for more jobs
        await waitForReplan(checkCondition, 100000, 5000); // Increased timeout slightly

        console.log('Replan complete. Verifying schedules...');

        // Fetch final state of all jobs
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, fixed_schedule_time')
            .in('id', allJobIds)
            .order('id'); // Order by ID for consistency

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();
        expect(finalJobs!.length).toEqual(allJobIds.length);

        // *** Verify Fixed Job ***
        const finalFixedJob = finalJobs!.find(j => j.id === fixedJobId);
        expect(finalFixedJob).toBeDefined();
        console.log('Verifying fixed job:', finalFixedJob);
        // Fixed jobs should retain their 'fixed_time' status after scheduling
        expect(finalFixedJob!.status).toEqual('fixed_time'); 
        expect(finalFixedJob!.assigned_technician).not.toBeNull(); 
        expect(finalFixedJob!.estimated_sched).not.toBeNull();
        expect(dayjs(finalFixedJob!.estimated_sched).utc().toISOString()).toEqual(dayjs(expectedFixedScheduleTime).utc().toISOString());
        expect(dayjs(finalFixedJob!.fixed_schedule_time).utc().toISOString()).toEqual(dayjs(expectedFixedScheduleTime).utc().toISOString());
        console.log(`Fixed job ${fixedJobId} correctly scheduled at ${finalFixedJob!.estimated_sched}`);

        // *** Verify Queued Jobs ***
        for (const jobId of queuedJobIds) {
            const finalQueuedJob = finalJobs!.find(j => j.id === jobId);
            expect(finalQueuedJob).toBeDefined();
            console.log(`Verifying queued job ${jobId}:`, finalQueuedJob);
            // Queued jobs should either be 'queued' (if scheduled) or potentially 'pending_review' if they couldn't be
            expect(['queued', 'pending_review']).toContain(finalQueuedJob!.status);
            if (finalQueuedJob!.status === 'queued') {
                expect(finalQueuedJob!.assigned_technician).not.toBeNull();
                expect(finalQueuedJob!.estimated_sched).not.toBeNull();
                console.log(`Queued job ${jobId} scheduled for ${finalQueuedJob!.estimated_sched} with tech ${finalQueuedJob!.assigned_technician}`);
            } else {
                expect(finalQueuedJob!.assigned_technician).toBeNull();
                expect(finalQueuedJob!.estimated_sched).toBeNull();
                 console.log(`Queued job ${jobId} ended as ${finalQueuedJob!.status} (unscheduled).`);
            }
        }

        console.log('Fixed time today verification successful: Fixed job scheduled exactly, queued jobs processed.');
    });
});