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

        console.log(`Waiting for replan to complete (expecting both jobs scheduled individually)...`);

        // Wait for both jobs to be scheduled (have assignment and time)
        const checkCondition = async (): Promise<boolean> => {
            const { data: jobs, error } = await supabase
                .from('jobs')
                .select('id, status, assigned_technician, estimated_sched') // Select relevant fields
                .in('id', jobIds);

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            if (!jobs || jobs.length !== jobIds.length) {
                console.log(`Waiting for all jobs (${jobIds.join(', ')}) to appear in query results...`);
                return false;
            }

            // Check if ALL jobs are scheduled (queued with assignment and schedule time)
            const allScheduled = jobs.every(job => 
                job.status === 'queued' && 
                job.assigned_technician !== null && 
                job.estimated_sched !== null
            );
            if (allScheduled) {
                console.log(`Condition met: Both jobs ${jobIds.join(', ')} are scheduled.`);
            } else {
                const statuses = jobs.map(j => `Job ${j.id}: ${j.status} (Tech: ${j.assigned_technician ?? 'N/A'})`).join(', ');
                console.log(`Condition not met: ${statuses}. Waiting...`);
            }
            return allScheduled;
        };

        await waitForReplan(checkCondition, 90000, 4000); // Increased timeout slightly just in case

        console.log('Replan complete. Verifying schedule...');

        // Fetch final state of the jobs
        const { data: finalJobs, error: jobError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, service_id') // Include service_id to infer job type
            .in('id', jobIds)
            .order('id', { ascending: true }); // Order consistently

        expect(jobError).toBeNull();
        expect(finalJobs).not.toBeNull();
        expect(finalJobs!.length).toEqual(jobIds.length);

        // Assertions for the bundle equipment conflict scenario
        const job1 = finalJobs![0]; // Assuming job 1 is the first ID
        const job2 = finalJobs![1]; // Assuming job 2 is the second ID

        // Verify both jobs are scheduled (status: queued)
        expect(job1.status).toEqual('queued');
        expect(job1.assigned_technician).not.toBeNull();
        expect(job1.estimated_sched).not.toBeNull();
        expect(job2.status).toEqual('queued');
        expect(job2.assigned_technician).not.toBeNull();
        expect(job2.estimated_sched).not.toBeNull();

        // Verify they are assigned to DIFFERENT technicians
        expect(job1.assigned_technician).not.toEqual(job2.assigned_technician);

        // Verify they are assigned to the *correct* technicians based on equipment
        // This relies on the seed script assumptions: Tech 1 (DB ID techId1) gets Equip 1 (for Service 6) and Tech 2 (DB ID techId2) gets Equip 2 (for Service 7)
        // UPDATED: Seed now uses Service 1 (-> Equip 11 -> Tech 1) and Service 2 (-> Equip 12 -> Tech 2)
        const jobForTech1 = finalJobs!.find(j => j.service_id === 1); // UPDATED from 6
        const jobForTech2 = finalJobs!.find(j => j.service_id === 2); // UPDATED from 7

        expect(jobForTech1).toBeDefined();
        expect(jobForTech2).toBeDefined();
        expect(jobForTech1!.assigned_technician).toEqual(techId1); 
        expect(jobForTech2!.assigned_technician).toEqual(techId2);

        console.log('Bundle equipment conflict verification successful: Jobs scheduled individually to correct techs.');
    });
});