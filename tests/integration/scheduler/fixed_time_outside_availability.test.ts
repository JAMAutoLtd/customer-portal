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

const EXPECTED_TOTAL_JOBS = 2; // 1 fixed weekend job + 1 normal queued job

describe('Scheduler Integration - Fixed Time Outside Availability', () => {
    let supabase: SupabaseClient;
    let currentScenarioResult: ScenarioSeedResult;
    let baselineRefs: BaselineRefs;
    let weekendFixedJobId: number;
    let normalQueuedJobId: number;
    let assignedTechId: number;

    beforeAll(async () => {
        supabase = getSupabaseClient();
        console.log('--- Test Setup: Reading Metadata Files --- ');
        try {
            baselineRefs = await readBaselineMetadata();
            currentScenarioResult = await readCurrentScenarioMetadata();

            if (currentScenarioResult.scenarioName !== 'fixed_time_outside_availability') {
                throw new Error(`Expected scenario metadata for 'fixed_time_outside_availability', but found '${currentScenarioResult.scenarioName}'.`);
            }
            
            if (!currentScenarioResult.insertedIds?.jobs || currentScenarioResult.insertedIds.jobs.length !== EXPECTED_TOTAL_JOBS) {
                throw new Error(`Scenario metadata should contain exactly ${EXPECTED_TOTAL_JOBS} job IDs for fixed_time_outside_availability.`);
            }
            
            // Assume the first ID is the weekend fixed job, second is the normal queued job (based on seed script order)
            weekendFixedJobId = currentScenarioResult.insertedIds.jobs[0];
            normalQueuedJobId = currentScenarioResult.insertedIds.jobs[1];
            
            // Get the assigned technician ID from the fixed job
            const { data: fixedJobData, error: fixedJobError } = await supabase
                .from('jobs')
                .select('assigned_technician')
                .eq('id', weekendFixedJobId)
                .single();
                
            if (fixedJobError || !fixedJobData || !fixedJobData.assigned_technician) {
                throw new Error('Failed to get assigned technician for weekend fixed job.');
            }
            assignedTechId = fixedJobData.assigned_technician;
            
            console.log(`Metadata loaded. Scenario: ${currentScenarioResult.scenarioName}`);
            console.log(`Weekend Fixed Job ID: ${weekendFixedJobId}, Normal Queued Job ID: ${normalQueuedJobId}`);
            console.log(`Assigned Tech ID: ${assignedTechId}`);
            console.log('--- Test Setup Complete ---');

        } catch (error) {
            console.error('FATAL: Test setup failed while reading metadata:', error);
            throw error;
        }
    }, 30000);

    it('should maintain fixed_time status for jobs scheduled outside availability windows', async () => {
        expect(baselineRefs).toBeDefined();
        expect(currentScenarioResult).toBeDefined();
        expect(weekendFixedJobId).toBeDefined();
        expect(normalQueuedJobId).toBeDefined();
        expect(assignedTechId).toBeDefined();

        // Fetch the original fixed job details before replan
        const { data: originalFixedJob, error: fetchError } = await supabase
            .from('jobs')
            .select('fixed_schedule_time, status, assigned_technician')
            .eq('id', weekendFixedJobId)
            .single();

        expect(fetchError).toBeNull();
        expect(originalFixedJob).not.toBeNull();
        expect(originalFixedJob!.fixed_schedule_time).not.toBeNull();
        expect(originalFixedJob!.status).toEqual('fixed_time');
        expect(originalFixedJob!.assigned_technician).toEqual(assignedTechId);
        
        const expectedFixedScheduleTime = originalFixedJob!.fixed_schedule_time!;
        console.log(`Original weekend fixed job scheduled for: ${expectedFixedScheduleTime}`);

        // Verify this is actually a weekend (Saturday)
        const fixedDate = dayjs(expectedFixedScheduleTime);
        expect(fixedDate.day()).toEqual(6); // Saturday
        console.log(`Confirmed job is scheduled for Saturday: ${fixedDate.format('YYYY-MM-DD dddd HH:mm')} UTC`);

        // Verify technician has availability exceptions during weekdays
        const { data: exceptions, error: exceptionsError } = await supabase
            .from('technician_availability_exceptions')
            .select('date, is_available')
            .eq('technician_id', assignedTechId)
            .eq('is_available', false);

        expect(exceptionsError).toBeNull();
        expect(exceptions).not.toBeNull();
        expect(exceptions!.length).toBeGreaterThan(0);
        console.log(`Tech ${assignedTechId} has ${exceptions!.length} full-day unavailability exceptions`);

        console.log('Triggering scheduler replan...');
        await triggerSchedulerReplan();

        console.log('Waiting for replan to complete...');
        
        const checkCondition = async (): Promise<boolean> => {
            const { data: jobs, error } = await supabase
                .from('jobs')
                .select('id, status, estimated_sched, fixed_schedule_time, assigned_technician')
                .in('id', [weekendFixedJobId, normalQueuedJobId]);

            if (error) {
                console.error('Error fetching jobs for condition check:', error);
                return false;
            }

            if (!jobs || jobs.length !== EXPECTED_TOTAL_JOBS) {
                console.log('Condition not met: Expected jobs not returned from query.');
                return false;
            }

            const fixedJob = jobs.find(j => j.id === weekendFixedJobId);
            const queuedJob = jobs.find(j => j.id === normalQueuedJobId);

            if (!fixedJob || !queuedJob) {
                console.log('Condition not met: Could not find both jobs.');
                return false;
            }

            // Check if replan is complete:
            // 1. Fixed job should be UNTOUCHED - maintain 'fixed_time' status, keep assigned technician, but NO estimated_sched
            //    (automation should skip jobs outside availability windows entirely)
            // 2. Queued job should either be scheduled ('queued' with estimated_sched) or 'pending_review'
            const fixedJobUntouched = fixedJob.status === 'fixed_time' && 
                                    fixedJob.estimated_sched === null &&  // Should NOT get scheduled by automation
                                    fixedJob.assigned_technician === assignedTechId;
            const queuedJobProcessed = (queuedJob.status === 'queued' && queuedJob.estimated_sched !== null) || 
                                     queuedJob.status === 'pending_review';

            const allCorrect = fixedJobUntouched && queuedJobProcessed;

            if (allCorrect) {
                console.log('Success: All jobs handled correctly.');
                console.log(`  Fixed Job ${weekendFixedJobId}: Status=${fixedJob.status}, HasSchedule=${!!fixedJob.estimated_sched}, AssignedTech=${fixedJob.assigned_technician} (UNTOUCHED)`);
                console.log(`  Queued Job ${normalQueuedJobId}: Status=${queuedJob.status}, HasSchedule=${!!queuedJob.estimated_sched}`);
            } else {
                console.log(`Condition not met: Fixed job untouched: ${fixedJobUntouched}, Queued job processed: ${queuedJobProcessed}`);
                console.log(`  Fixed Job: Status=${fixedJob.status}, HasSchedule=${!!fixedJob.estimated_sched}, AssignedTech=${fixedJob.assigned_technician}, Expected=${assignedTechId}`);
                console.log(`  Queued Job: Status=${queuedJob.status}, HasSchedule=${!!queuedJob.estimated_sched}`);
            }
            
            return allCorrect;
        };

        await waitForReplan(checkCondition, 120000, 5000); // 2 minute timeout

        console.log('Replan complete. Verifying results...');

        // Fetch final state of both jobs
        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('id, status, assigned_technician, estimated_sched, fixed_schedule_time')
            .in('id', [weekendFixedJobId, normalQueuedJobId])
            .order('id');

        expect(jobsError).toBeNull();
        expect(finalJobs).not.toBeNull();
        expect(finalJobs!.length).toEqual(EXPECTED_TOTAL_JOBS);

        // *** Verify Weekend Fixed Job ***
        const finalFixedJob = finalJobs!.find(j => j.id === weekendFixedJobId);
        expect(finalFixedJob).toBeDefined();
        console.log('Verifying weekend fixed job:', finalFixedJob);
        
        // CRITICAL ASSERTIONS: Fixed job outside availability should be left completely UNTOUCHED
        expect(finalFixedJob!.status).toEqual('fixed_time'); // Should NOT be pending_review
        expect(finalFixedJob!.assigned_technician).toEqual(assignedTechId); // Should keep original assignment
        expect(finalFixedJob!.estimated_sched).toBeNull(); // Should NOT be scheduled by automation
        
        // Should keep original fixed_schedule_time unchanged
        expect(dayjs(finalFixedJob!.fixed_schedule_time).utc().toISOString())
            .toEqual(dayjs(expectedFixedScheduleTime).utc().toISOString());
        
        console.log(`✓ Weekend fixed job ${weekendFixedJobId} correctly maintained 'fixed_time' status`);
        console.log(`✓ Left UNTOUCHED by automation - no estimated_sched assigned`);
        console.log(`✓ Kept original technician assignment: ${finalFixedJob!.assigned_technician}`);

        // *** Verify Normal Queued Job ***
        const finalQueuedJob = finalJobs!.find(j => j.id === normalQueuedJobId);
        expect(finalQueuedJob).toBeDefined();
        console.log('Verifying normal queued job:', finalQueuedJob);
        
        // Queued job behavior depends on whether other technicians had availability
        expect(['queued', 'pending_review']).toContain(finalQueuedJob!.status);
        
        if (finalQueuedJob!.status === 'queued') {
            expect(finalQueuedJob!.assigned_technician).not.toBeNull();
            expect(finalQueuedJob!.estimated_sched).not.toBeNull();
            console.log(`✓ Normal queued job ${normalQueuedJobId} was scheduled successfully`);
        } else {
            expect(finalQueuedJob!.assigned_technician).toBeNull();
            expect(finalQueuedJob!.estimated_sched).toBeNull();
            console.log(`✓ Normal queued job ${normalQueuedJobId} marked as pending_review (expected if no availability)`);
        }

        console.log('✅ Fixed time outside availability verification successful!');
        console.log('   Fixed job maintained fixed_time status and was completely UNTOUCHED by automation');
        console.log('   This confirms the scheduler correctly skips fixed jobs outside availability windows');
    });
});