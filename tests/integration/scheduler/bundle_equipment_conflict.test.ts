import {
    getSupabaseClient,
    triggerSchedulerReplan,
    waitForReplan,
    readCurrentScenarioMetadata,
    readBaselineMetadata,
} from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { ScenarioSeedResult, BaselineRefs } from '../../../simulation/scripts/db/seed/scenarios/types';

// jest.setTimeout(120000); // 120 seconds for potentially complex scheduling

describe('Scheduler Integration - Bundle Equipment Conflict', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    // Hold IDs relevant to this scenario
    let bundledJobIds: number[] = [];
    let orderId: number | undefined;
    let scenarioTechnicianDbIds: number[] = [];

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup (Bundle Equipment Conflict): Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            // Validate scenario name
            if (currentScenarioResult.scenarioName !== 'bundle_equipment_conflict') {
                throw new Error(`Expected scenario metadata for 'bundle_equipment_conflict', but found '${currentScenarioResult.scenarioName}'.`);
            }

            // Extract relevant IDs
            bundledJobIds = currentScenarioResult.insertedIds?.jobs ?? [];
            orderId = currentScenarioResult.insertedIds?.orders?.[0];
            scenarioTechnicianDbIds = currentScenarioResult.insertedIds?.technicianDbIds ?? []; // Get techs seeded for this run

            if (!orderId) {
                 throw new Error('Scenario metadata is missing the order ID.');
            }
            if (bundledJobIds.length !== 2) {
                // This test expects exactly two jobs for the bundle conflict
                throw new Error(`Expected 2 job IDs for 'bundle_equipment_conflict', but found ${bundledJobIds.length}.`);
            }
            if (scenarioTechnicianDbIds.length === 0) {
                throw new Error('Scenario metadata is missing technician DB IDs.');
            }

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Order: ${orderId}. Jobs: ${bundledJobIds.join(', ')}. Techs: ${scenarioTechnicianDbIds.length}`);
            console.log('--- Test Setup (Bundle Equipment Conflict) Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should break the bundle and assign jobs to different technicians based on equipment availability', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(orderId).toBeDefined();
        expect(bundledJobIds.length).toEqual(2);
        expect(scenarioTechnicianDbIds.length).toBeGreaterThan(0);

        console.log(`Triggering scheduler replan for bundled order ID: ${orderId}...`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (bundle equipment conflict)...');
        // Wait until both jobs are processed (likely 'queued')
        const checkCondition = async (): Promise<boolean> => {
            const { data: jobs, error } = await supabase
                .from('jobs')
                .select('id, status')
                .in('id', bundledJobIds);

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            // Expect both jobs to be scheduled ('queued')
            const allScheduled = jobs !== null && jobs.length === bundledJobIds.length && jobs.every(j => j.status === 'queued');
            if (allScheduled) {
                console.log(`Condition met: All ${bundledJobIds.length} bundled jobs have status 'queued'.`);
            } else {
                const statuses = jobs?.map(j => `${j.id}:${j.status}`) ?? [];
                 console.log(`Condition not met: Found ${jobs?.length ?? 0} jobs. Statuses: [${statuses.join(', ')}]. Expected ${bundledJobIds.length} jobs with status 'queued'.`);
            }
            return allScheduled;
        };

        await waitForReplan(checkCondition, 120000, 5000); // Longer timeout may be needed

        console.log('Replan complete. Verifying bundle conflict resolution...');

        // Fetch final state of the two jobs
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, estimated_sched, assigned_technician, service_id')
            .in('id', bundledJobIds)
            .order('id', { ascending: true }); // Order consistently by ID for comparison

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();
        expect(finalJobs!.length).toEqual(2);

        // --- Assertions ---
        const job1 = finalJobs!.find(j => j.id === bundledJobIds[0]);
        const job2 = finalJobs!.find(j => j.id === bundledJobIds[1]);

        expect(job1).toBeDefined();
        expect(job2).toBeDefined();

        // 1. Verify both jobs were scheduled with technicians
        console.log('Verifying job statuses and assignments...');
        expect(job1!.status).toEqual('queued');
        expect(job1!.assigned_technician).not.toBeNull();
        expect(job1!.estimated_sched).not.toBeNull();
        expect(scenarioTechnicianDbIds).toContain(job1!.assigned_technician);

        expect(job2!.status).toEqual('queued');
        expect(job2!.assigned_technician).not.toBeNull();
        expect(job2!.estimated_sched).not.toBeNull();
        expect(scenarioTechnicianDbIds).toContain(job2!.assigned_technician);

        // 2. CRITICAL: Verify the assigned technicians are DIFFERENT
        console.log(`Verifying technicians are different: Job ${job1!.id} -> Tech ${job1!.assigned_technician}, Job ${job2!.id} -> Tech ${job2!.assigned_technician}`);
        expect(job1!.assigned_technician).not.toEqual(job2!.assigned_technician);

        // 3. Verify Assigned Tech Has Correct Equipment (Placeholder/Optional)
        // TODO: Similar to the previous test, fetch equipment for job1.assigned_technician
        // and verify it matches the requirements for job1.service_id. Do the same for job2.
        console.log('Verifying technician equipment allocation (placeholder)...');
        // const technicianEquipment = await fetchTechnicianEquipment(supabase, scenarioTechnicianDbIds);
        // const serviceRequirements = await fetchServiceRequirements(supabase, [job1.service_id, job2.service_id]);
        // verifyTechHasEquipment(job1, technicianEquipment, serviceRequirements);
        // verifyTechHasEquipment(job2, technicianEquipment, serviceRequirements);

        console.log('Bundle equipment conflict verification successful: Bundle broken, jobs assigned to different technicians.');
    });

    // afterAll(...)
}); 