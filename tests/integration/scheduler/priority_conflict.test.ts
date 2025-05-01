import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';

// Increase Jest timeout
// jest.setTimeout(90000);

describe('Scheduler Integration - Priority Conflict', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;
    let highPriorityJobId: number;
    let lowPriorityJobId: number;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'priority_conflict') {
                throw new Error(`Expected scenario metadata for 'priority_conflict', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.highPriorityJobId || currentScenarioResult.insertedIds.highPriorityJobId.length !== 1) {
                throw new Error('Scenario metadata is missing highPriorityJobId.');
            }
            if (!currentScenarioResult.insertedIds?.lowPriorityJobId || currentScenarioResult.insertedIds.lowPriorityJobId.length !== 1) {
                throw new Error('Scenario metadata is missing lowPriorityJobId.');
            }

            highPriorityJobId = currentScenarioResult.insertedIds.highPriorityJobId[0] as number;
            lowPriorityJobId = currentScenarioResult.insertedIds.lowPriorityJobId[0] as number;

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. High Prio Job: ${highPriorityJobId}, Low Prio Job: ${lowPriorityJobId}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed:', error);
            throw error;
        }
    }, 45000);

    it('should schedule the high-priority job and leave the low-priority job unscheduled due to capacity', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(highPriorityJobId).toBeDefined();
        expect(lowPriorityJobId).toBeDefined();

        console.log(`Triggering scheduler replan for priority conflict jobs: ${highPriorityJobId} (P1), ${lowPriorityJobId} (P5)...`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (expecting P1 scheduled, P5 maybe not)...');
        // Wait for the HIGH priority job to definitely get scheduled
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('id, estimated_sched, status')
                .eq('id', highPriorityJobId)
                .single();

            if (error) {
                console.error('DB query error during wait for P1 job:', error);
                return false;
            }
            const isScheduled = job?.estimated_sched !== null && job?.status === 'queued';
            if (isScheduled) {
                 console.log(`Condition met: High priority job ${highPriorityJobId} has schedule and status 'queued'.`);
            } else {
                console.log(`Condition not met: High priority job ${highPriorityJobId} status '${job?.status}', schedule '${job?.estimated_sched}'.`);
            }
            return isScheduled;
        };
        await waitForReplan(checkCondition, 90000, 4000);

        // Give a little extra time for the low priority job's fate to be sealed (e.g., marked pending_review)
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('Replan complete. Verifying job statuses...');

        // Fetch final state of both jobs
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, priority')
            .in('id', [highPriorityJobId, lowPriorityJobId])
            .order('priority', { ascending: true }); // Order by priority

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();
        expect(finalJobs!.length).toEqual(2);

        // Assertions for the priority conflict scenario
        const finalHighPrioJob = finalJobs!.find(j => j.id === highPriorityJobId);
        const finalLowPrioJob = finalJobs!.find(j => j.id === lowPriorityJobId);

        expect(finalHighPrioJob).toBeDefined();
        expect(finalLowPrioJob).toBeDefined();

        // Verify High Priority Job is scheduled
        expect(finalHighPrioJob!.status).toEqual('queued');
        expect(finalHighPrioJob!.assigned_technician).not.toBeNull();
        expect(finalHighPrioJob!.estimated_sched).not.toBeNull();

        // Verify Low Priority Job is NOT scheduled (either still queued or pending_review)
        expect(finalLowPrioJob!.status).not.toEqual('queued'); // Should not be scheduled
        expect(['queued', 'pending_review']).toContain(finalLowPrioJob!.status); // Could be either
        expect(finalLowPrioJob!.assigned_technician).toBeNull();
        expect(finalLowPrioJob!.estimated_sched).toBeNull();

        console.log(`Priority conflict verification successful: P1 Job ${highPriorityJobId} scheduled, P5 Job ${lowPriorityJobId} has status ${finalLowPrioJob!.status}.`);
    });
});