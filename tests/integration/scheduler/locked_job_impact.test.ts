import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
    cleanupScenarioData
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';
import type { Tables } from '../../../apps/scheduler/src/types/database.types'; // Import Job type
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

    // Cleanup after tests
    afterAll(async () => {
        console.log('--- Test Teardown: Cleaning Up Scenario Data (Locked Job Impact) --- ');
        if (currentScenarioResult?.insertedIds) {
            await cleanupScenarioData(currentScenarioResult.insertedIds);
        } else {
            console.log('Skipping cleanup: No scenario metadata available.');
        }
        console.log('--- Test Teardown Complete ---');
    }, 45000);

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

        // 3. Wait for the *queued* jobs to be scheduled
        console.log(`Waiting for replan to complete (expecting queued jobs [${queuedJobIds.join(', ')}] to be scheduled)...`);
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
                console.log(`Waiting for all queued jobs to appear in query results...`);
                return false;
            }

            // Check if ALL queued jobs have been assigned a schedule
            const allScheduled = jobs.every(job => job.estimated_sched !== null && job.status === 'queued');
            if (allScheduled) {
                console.log(`Condition met: All queued jobs [${queuedJobIds.join(', ')}] have estimated schedules.`);
            } else {
                const statuses = jobs.map(j => `Job ${j.id}: ${j.status} (${j.estimated_sched ? 'scheduled' : 'unscheduled'})`).join(', ');
                console.log(`Condition not met: ${statuses}. Waiting...`);
            }
            return allScheduled;
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

            // Check for overlap: Neither start nor end time of the scheduled job should be strictly between the locked job's times.
            // Also, the locked job times shouldn't be between the scheduled job's times.
            const startsDuringLock = jobStartTime.isAfter(lockedStartTime) && jobStartTime.isBefore(lockedEndTime);
            const endsDuringLock = jobEndTime.isAfter(lockedStartTime) && jobEndTime.isBefore(lockedEndTime);
            const envelopsLock = jobStartTime.isBefore(lockedStartTime) && jobEndTime.isAfter(lockedEndTime);
            const sameStartAsLock = jobStartTime.isSame(lockedStartTime);

            expect(startsDuringLock).toBe(false);
            expect(endsDuringLock).toBe(false);
            expect(envelopsLock).toBe(false);
            expect(sameStartAsLock).toBe(false); // Should not start at the exact same time

            console.log(`  Job ${job.id} schedule verified: No overlap with locked job ${lockedJobId}.`);
        }

        console.log('Locked job impact verification successful: Queued jobs scheduled around locked time block.');
    });
}); 