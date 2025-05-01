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
// jest.setTimeout(90000); // 90 seconds

describe('Scheduler Integration - Bundle Equipment Conflict', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'bundle_equipment_conflict') {
                throw new Error(`Expected scenario metadata for 'bundle_equipment_conflict', but found '${currentScenarioResult.scenarioName}'.`);
            }
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length !== 2) {
                throw new Error('Scenario metadata should contain exactly two job IDs for bundle_equipment_conflict.');
            }
            if (!currentScenarioResult.insertedIds?.technicianDbIds || currentScenarioResult.insertedIds.technicianDbIds.length < 2) {
                throw new Error('Scenario metadata is missing technician DB IDs (need at least 2).');
            }
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Job IDs: ${currentScenarioResult.insertedIds.jobs.join(', ')}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should break the bundle and schedule jobs individually due to equipment conflict', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs).toBeDefined();
        expect(currentScenarioResult.insertedIds.jobs!.length).toEqual(2);
        expect(currentScenarioResult.insertedIds.technicianDbIds).toBeDefined();

        const jobIds = currentScenarioResult.insertedIds.jobs!;
        const techIds = currentScenarioResult.insertedIds.technicianDbIds!;
        const techId1 = techIds[0];
        const techId2 = techIds[1];

        console.log(`Triggering scheduler replan for job IDs: ${jobIds.join(', ')}...`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (expecting both jobs scheduled individually)...');
        // Wait for both jobs to be scheduled (have assignment and time)
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
            const bothJobsScheduled = jobs?.length === 2;
            if (bothJobsScheduled) {
                console.log(`Condition met: Both jobs ${jobIds.join(', ')} have assignment and estimated schedule.`);
            } else {
                console.log(`Condition not met: Found ${jobs?.length ?? 0} jobs with assignment/schedule, expected 2.`);
            }
            return bothJobsScheduled;
        };
        await waitForReplan(checkCondition, 90000, 4000);

        console.log('Replan complete. Verifying schedule...');

        // Fetch final state of the jobs
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, service_id') // Include service_id to infer which job is which
            .in('id', jobIds)
            .order('id', { ascending: true }); // Order consistently

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();
        expect(finalJobs!.length).toEqual(2);

        // Assertions for the bundle equipment conflict scenario
        const job1 = finalJobs![0];
        const job2 = finalJobs![1];

        // Verify both jobs are scheduled
        expect(job1.status).toEqual('queued');
        expect(job1.assigned_technician).not.toBeNull();
        expect(job1.estimated_sched).not.toBeNull();
        expect(job2.status).toEqual('queued');
        expect(job2.assigned_technician).not.toBeNull();
        expect(job2.estimated_sched).not.toBeNull();

        // Verify they are assigned to DIFFERENT technicians
        expect(job1.assigned_technician).not.toEqual(job2.assigned_technician);

        // Verify they are assigned to the *correct* technicians based on equipment (requires knowing which service ID corresponds to which tech)
        // Assuming serviceId 6 requires Equip 1 (Tech 1) and serviceId 7 requires Equip 2 (Tech 2)
        const jobForTech1 = finalJobs!.find(j => j.service_id === 6); // Service ID 6 was assigned Equip 1 -> Tech 1
        const jobForTech2 = finalJobs!.find(j => j.service_id === 7); // Service ID 7 was assigned Equip 2 -> Tech 2

        expect(jobForTech1).toBeDefined();
        expect(jobForTech2).toBeDefined();
        // Ensure we check against the correct tech IDs extracted earlier
        expect(jobForTech1!.assigned_technician).toEqual(techId1);
        expect(jobForTech2!.assigned_technician).toEqual(techId2);

        // Optionally, verify bundle was broken (e.g., check bundle_id if implemented)

        console.log('Bundle equipment conflict verification successful: Jobs scheduled individually to correct techs.');
    });
});