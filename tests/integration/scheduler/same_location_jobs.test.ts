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

describe('Scheduler Integration - Same Location Jobs', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'same_location_jobs') {
                throw new Error(`Expected scenario metadata for 'same_location_jobs', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length < 3) {
                throw new Error('Scenario metadata should contain at least 3 job IDs for same_location_jobs.');
            }
             if (!currentScenarioResult.insertedIds?.technicianDbIds || currentScenarioResult.insertedIds.technicianDbIds.length === 0) {
                throw new Error('Scenario metadata is missing technician DB IDs.');
            }
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Job IDs: ${currentScenarioResult.insertedIds.jobs.join(', ')}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should schedule all jobs at the same location correctly', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs).toBeDefined();
        expect(currentScenarioResult.insertedIds.technicianDbIds).toBeDefined();

        const jobIds = currentScenarioResult.insertedIds.jobs!;
        const validTechnicianDbIds = currentScenarioResult.insertedIds.technicianDbIds!;

        console.log(`Triggering scheduler replan for same location jobs: ${jobIds.join(', ')}...`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (expecting all jobs scheduled)...');
        const checkCondition = async (): Promise<boolean> => {
            const { data: jobs, error } = await supabase
                .from('jobs')
                .select('id')
                .in('id', jobIds)
                .not('assigned_technician', 'is', null)
                .not('estimated_sched', 'is', null);

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const allJobsScheduled = jobs?.length === jobIds.length;
            if (allJobsScheduled) {
                console.log(`Condition met: All ${jobIds.length} same-location jobs have assignment and estimated schedule.`);
            } else {
                console.log(`Condition not met: Found ${jobs?.length ?? 0} scheduled jobs, expected ${jobIds.length}.`);
            }
            return allJobsScheduled;
        };
        await waitForReplan(checkCondition, 90000, 4000); // Standard wait time

        console.log('Replan complete. Verifying schedule...');

        // Fetch final state of the jobs
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, address_id')
            .in('id', jobIds)
            .order('estimated_sched', { ascending: true });

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();
        expect(finalJobs!.length).toEqual(jobIds.length);

        const firstAddressId = finalJobs![0].address_id; // Get address ID from the first job

        // Assertions for the same location jobs scenario
        for (const job of finalJobs!) {
            expect(job.status).toEqual('queued');
            expect(job.assigned_technician).not.toBeNull();
            expect(validTechnicianDbIds).toContain(job.assigned_technician); // Verify assigned tech is valid
            expect(job.estimated_sched).not.toBeNull();
            expect(job.address_id).toEqual(firstAddressId); // Verify all jobs share the same address ID
        }

        // Optional: Check if jobs assigned to the same tech are grouped closely in time
        // This requires more complex logic to group by technician and check time differences.

        console.log('Same location jobs verification successful: All jobs scheduled to valid techs.');
    });
}); 