import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';
// import type { Tables } from '../../../apps/scheduler/src/types/database.types'; // <-- Removed unused/incorrect import
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(utc);
dayjs.extend(isBetween);

// Increase Jest timeout
jest.setTimeout(90000); // 90 seconds

describe('Scheduler Integration - Locked Job Impact', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;
    let lockedJobId: number;
    let queuedJobIds: number[];

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files (Locked Job Impact) --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'locked_job_impact') {
                throw new Error(`Expected scenario metadata for 'locked_job_impact', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length < 3) {
                throw new Error('Scenario metadata should contain at least three job IDs (1 locked, 2+ queued).');
            }

            // Identify locked vs queued based on expected seeding logic (first is locked)
            lockedJobId = currentScenarioResult.insertedIds.jobs[0];
            queuedJobIds = currentScenarioResult.insertedIds.jobs.slice(1);

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Locked Job ID: ${lockedJobId}, Queued Job IDs: [${queuedJobIds.join(', ')}]`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should schedule queued jobs around the time blocked by the locked job', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(lockedJobId).toBeDefined();
        expect(queuedJobIds).toBeDefined();
        expect(queuedJobIds.length).toBeGreaterThanOrEqual(2);

        // 1. Fetch the original state of the locked job
        const { data: originalLockedJob, error: fetchLockedError } = await supabase
            .from('jobs')
            .select('status, estimated_sched, job_duration, assigned_technician')
            .eq('id', lockedJobId)
            .single();

        expect(fetchLockedError).toBeNull();
        expect(originalLockedJob).not.toBeNull();
        expect(['en_route', 'in_progress']).toContain(originalLockedJob!.status); // Verify initial locked status
        expect(originalLockedJob!.estimated_sched).not.toBeNull();
        expect(originalLockedJob!.job_duration).not.toBeNull();
        const lockedStartTime = dayjs(originalLockedJob!.estimated_sched).utc();
        const lockedEndTime = lockedStartTime.add(originalLockedJob!.job_duration!, 'minute');
        console.log(`Locked job ${lockedJobId} original time block: ${lockedStartTime.toISOString()} - ${lockedEndTime.toISOString()}`);

        // 2. Trigger replan
        console.log(`Triggering scheduler replan for locked job impact scenario...`);
        await triggerSchedulerReplan();

        // 3. Wait for the *queued* jobs to be scheduled or marked pending
        console.log(`Waiting for replan to complete (expecting queued jobs [${queuedJobIds.join(', ')}] to be processed)...`);
        const checkCondition = async (): Promise<boolean> => {
            const { data: jobs, error } = await supabase
                .from('jobs')
                .select('id, status, estimated_sched')
                .in('id', queuedJobIds);

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            if (!jobs || jobs.length !== queuedJobIds.length) {
                console.log(`Waiting for all queued jobs to appear in query results (${jobs?.length ?? 0}/${queuedJobIds.length})...`);
                return false;
            }

            // Check if ALL queued jobs have reached a final state (either scheduled or pending review)
            const allProcessed = jobs.every(job => 
                (job.status === 'queued' && job.estimated_sched !== null) || 
                job.status === 'pending_review'
            );
            
            if (allProcessed) {
                console.log(`Condition met: All queued jobs [${queuedJobIds.join(', ')}] have reached a final state (queued/scheduled or pending_review).`);
            } else {
                const statuses = jobs.map(j => `Job ${j.id}: ${j.status} (${j.estimated_sched ? 'scheduled' : 'unscheduled'})`).join(', ');
                console.log(`Condition not met: ${statuses}. Waiting...`);
            }
            return allProcessed;
        };
        await waitForReplan(checkCondition, 60000, 3000);

        // 4. Verify final states
        console.log('Replan complete. Verifying final job states...');

        // Fetch final state of the locked job - it should NOT have changed
        const { data: finalLockedJob, error: finalLockedError } = await supabase
            .from('jobs')
            .select('status, estimated_sched, job_duration, assigned_technician')
            .eq('id', lockedJobId)
            .single();

        expect(finalLockedError).toBeNull();
        expect(finalLockedJob).not.toBeNull();
        expect(finalLockedJob!.status).toEqual(originalLockedJob!.status);
        expect(dayjs(finalLockedJob!.estimated_sched).utc().toISOString()).toEqual(lockedStartTime.toISOString());
        expect(finalLockedJob!.assigned_technician).toEqual(originalLockedJob!.assigned_technician);
        console.log(`Locked job ${lockedJobId} status and schedule remain unchanged (as expected).`);

        // Fetch final states of the queued jobs
        const { data: finalQueuedJobs, error: finalQueuedError } = await supabase
            .from('jobs')
            .select('id, status, estimated_sched, job_duration, assigned_technician')
            .in('id', queuedJobIds);

        expect(finalQueuedError).toBeNull();
        expect(finalQueuedJobs).not.toBeNull();
        expect(finalQueuedJobs!.length).toEqual(queuedJobIds.length);

        // *** Crucial Check: Verify queued jobs are scheduled and do not overlap with the locked job ***
        for (const job of finalQueuedJobs!) {
            console.log(`Verifying scheduled queued job ${job.id}...`);
            expect(job.status).toEqual('queued');
            expect(job.estimated_sched).not.toBeNull();
            expect(job.job_duration).not.toBeNull();
            expect(job.assigned_technician).toEqual(originalLockedJob!.assigned_technician); // Should be same tech

            const jobStartTime = dayjs(job.estimated_sched!).utc();
            const jobEndTime = jobStartTime.add(job.job_duration!, 'minute');

            console.log(`  Job ${job.id} scheduled: ${jobStartTime.toISOString()} - ${jobEndTime.toISOString()}`);

            // Check if the job's time range overlaps the locked time range
            // Overlap occurs if the job starts before the lock ends AND the job ends after the lock starts.
            const overlaps = jobStartTime.isBefore(lockedEndTime) && jobEndTime.isAfter(lockedStartTime);

            // Assert that there is NO overlap
            expect(overlaps).toBe(false);

            console.log(`  Job ${job.id} schedule verified: No overlap with locked job ${lockedJobId}.`);
        }

        console.log('Locked job impact verification successful: Queued jobs scheduled around locked time block.');
    });
}); 