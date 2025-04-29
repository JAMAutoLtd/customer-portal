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

describe('Scheduler Integration - Fixed Time Today', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;

    // Hold IDs and data relevant to this scenario
    let fixedTimeJobId: number | undefined;
    let orderId: number | undefined;
    let scenarioTechnicianDbIds: number[] = [];
    let expectedFixedTime: string | null = null; // Store the exact fixed time from the DB

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup (Fixed Time Today): Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            // Validate scenario name
            if (currentScenarioResult.scenarioName !== 'fixed_time_today') {
                throw new Error(`Expected scenario metadata for 'fixed_time_today', but found '${currentScenarioResult.scenarioName}'.`);
            }

            // Extract relevant IDs
            const scenarioJobIds = currentScenarioResult.insertedIds?.jobs ?? [];
            orderId = currentScenarioResult.insertedIds?.orders?.[0];
            scenarioTechnicianDbIds = currentScenarioResult.insertedIds?.technicianDbIds ?? [];

            if (!orderId) {
                 throw new Error('Scenario metadata is missing the order ID.');
            }
            if (scenarioJobIds.length !== 1) {
                throw new Error(`Expected 1 job ID for 'fixed_time_today', but found ${scenarioJobIds.length}.`);
            }
            fixedTimeJobId = scenarioJobIds[0];
             if (scenarioTechnicianDbIds.length === 0) {
                throw new Error('Scenario metadata is missing technician DB IDs.');
            }

            // Fetch the actual fixed_schedule_time set by the seeder
            const { data: jobData, error: fetchError } = await supabase
                .from('jobs')
                .select('fixed_schedule_time')
                .eq('id', fixedTimeJobId)
                .single();

            if (fetchError || !jobData || !jobData.fixed_schedule_time) {
                throw new Error(`Failed to fetch fixed_schedule_time for job ${fixedTimeJobId}: ${fetchError?.message}`);
            }
            expectedFixedTime = jobData.fixed_schedule_time;

            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}. Order: ${orderId}. Job: ${fixedTimeJobId}. Expected Fixed Time: ${expectedFixedTime}. Techs: ${scenarioTechnicianDbIds.length}`);
            console.log('--- Test Setup (Fixed Time Today) Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed:', error);
            throw error;
        }
    }, 30000);

    it('should schedule the job exactly at its fixed time and assign a valid technician', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(orderId).toBeDefined();
        expect(fixedTimeJobId).toBeDefined();
        expect(expectedFixedTime).not.toBeNull();
        expect(scenarioTechnicianDbIds.length).toBeGreaterThan(0);

        console.log(`Triggering scheduler replan for fixed time job ID: ${fixedTimeJobId}...`);
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete (fixed time job)...');
        // Wait until the job status becomes 'queued'
        const checkCondition = async (): Promise<boolean> => {
            const { data: job, error } = await supabase
                .from('jobs')
                .select('status')
                .eq('id', fixedTimeJobId!)
                .single();

            if (error) {
                console.error('DB query error during wait:', error);
                return false;
            }
            const isQueued = job?.status === 'queued';
            if (isQueued) {
                console.log(`Condition met: Job ${fixedTimeJobId} has status 'queued'.`);
            } else {
                 console.log(`Condition not met: Job ${fixedTimeJobId} status is ${job?.status ?? 'not found'}. Expected 'queued'.`);
            }
            return isQueued;
        };

        await waitForReplan(checkCondition, 90000, 4000); // Allow reasonable time for scheduling

        console.log('Replan complete. Verifying fixed time schedule...');

        // Fetch final state of the job
        const { data: finalJob, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, estimated_sched, assigned_technician, fixed_schedule_time')
            .eq('id', fixedTimeJobId!)
            .single();

        expect(jobsError).toBeNull();
        expect(finalJob).not.toBeNull();

        // --- Assertions ---

        // 1. Verify Status
        expect(finalJob!.status).toEqual('queued');

        // 2. Verify Technician Assignment
        expect(finalJob!.assigned_technician).not.toBeNull();
        expect(scenarioTechnicianDbIds).toContain(finalJob!.assigned_technician);

        // 3. CRITICAL: Verify Estimated Schedule matches Fixed Time
        expect(finalJob!.estimated_sched).not.toBeNull();
        console.log(`Comparing Estimated: ${finalJob!.estimated_sched} with Fixed: ${expectedFixedTime}`);
        // Direct string comparison should work for ISO timestamps
        expect(finalJob!.estimated_sched).toEqual(expectedFixedTime);
        // Optionally, compare Date objects for robustness
        expect(new Date(finalJob!.estimated_sched!).toISOString()).toEqual(new Date(expectedFixedTime!).toISOString());


        console.log('Fixed time job verification successful.');
    });

    // afterAll(...)
}); 