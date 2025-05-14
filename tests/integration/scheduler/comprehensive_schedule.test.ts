import { getSupabaseClient, readCurrentScenarioMetadata } from './utils';
import { SupabaseClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

dayjs.extend(utc);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

describe('Comprehensive Scheduler Integration Test', () => {
    let supabase: SupabaseClient;
    let testDataIds: any; // Consider defining a more specific type for testDataIds based on ScenarioSeedResult['insertedIds']
    // ... other top-level declarations like baselineJobIds etc. from your PRD example

    beforeAll(async () => {
        supabase = getSupabaseClient();
        // Load metadata for the currently seeded scenario
        const currentScenarioMetadata = await readCurrentScenarioMetadata(); 
        testDataIds = currentScenarioMetadata; // Assign the whole ScenarioSeedResult object
        // Now testDataIds.insertedIds.fillerJobIds should be accessible
        // And testDataIds.technicianDbIds etc.

        console.log('[INFO] Successfully validated and read metadata for scenario:', testDataIds.scenarioName);
    }, 30000); // Increased timeout for beforeAll if metadata reading is slow or involves retries

    it('should correctly schedule and handle various scenarios in one replan cycle', async () => {
        // Ensure testDataIds is loaded before proceeding
        expect(testDataIds).toBeDefined();
        expect(testDataIds.insertedIds).toBeDefined();

        const allRelevantJobIds: number[] = [];
        // Populate allRelevantJobIds from various parts of testDataIds.insertedIds
        if (testDataIds.insertedIds.fillerJobIds) allRelevantJobIds.push(...testDataIds.insertedIds.fillerJobIds);
        if (testDataIds.insertedIds.jobZ1_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobZ1_Id);
        if (testDataIds.insertedIds.jobZ2_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobZ2_Id);
        if (testDataIds.insertedIds.jobE_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobE_Id);
        if (testDataIds.insertedIds.jobF_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobF_Id);
        if (testDataIds.insertedIds.jobT_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobT_Id);
        if (testDataIds.insertedIds.jobL_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobL_Id);
        if (testDataIds.insertedIds.jobS1_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobS1_Id);
        if (testDataIds.insertedIds.jobS2_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobS2_Id);
        if (testDataIds.insertedIds.jobU_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobU_Id);
        if (testDataIds.insertedIds.jobLCKD_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobLCKD_Id);
        if (testDataIds.insertedIds.jobQ1M_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobQ1M_Id);
        if (testDataIds.insertedIds.jobQ2M_Id) allRelevantJobIds.push(...testDataIds.insertedIds.jobQ2M_Id);

        // Remove duplicates if any job ID ended up in multiple arrays (e.g. general jobs array and specific ID)
        const uniqueRelevantJobIds = [...new Set(allRelevantJobIds.filter(id => typeof id === 'number'))];

        console.log(`Fetching ${uniqueRelevantJobIds.length} relevant jobs from DB for verification...`);

        const { data: finalJobs, error: jobsError } = await supabase
            .from('jobs')
            .select('*') 
            .in('id', uniqueRelevantJobIds); // Use unique IDs
        
        expect(jobsError).toBeNull();
        expect(finalJobs).toBeDefined();
        const finalJobsMap = new Map(finalJobs!.map((j: any) => [j.id, j]));

        // --- Scenario A: Baseline Schedule Verification ---
        console.log('Verifying Scenario A: Baseline Schedule...');
        const fillerJobIds = testDataIds.insertedIds.fillerJobIds || [];
        expect(fillerJobIds.length).toBeGreaterThanOrEqual(5); // Ensure we have enough filler jobs to test

        const scheduledFillerJobs = fillerJobIds.reduce((count: number, jobId: number) => {
            const job = finalJobsMap.get(jobId);
            if (job && job.status === 'queued' && job.estimated_sched !== null) {
                return count + 1;
            }
            return count;
        }, 0);

        const schedulingPercentage = fillerJobIds.length > 0 ? (scheduledFillerJobs / fillerJobIds.length) * 100 : 0;
        console.log(`Scenario A: ${scheduledFillerJobs} out of ${fillerJobIds.length} filler jobs scheduled (${schedulingPercentage.toFixed(2)}%).`);
        expect(schedulingPercentage).toBeGreaterThan(75);

        // --- Scenario B: Bundle Equipment Conflict Verification ---
        console.log('Verifying Scenario B: Bundle Equipment Conflict...');
        const jobZ1_Id = testDataIds.insertedIds.jobZ1_Id?.[0];
        const jobZ2_Id = testDataIds.insertedIds.jobZ2_Id?.[0];
        const tech1DbId = testDataIds.insertedIds.technicianDbIds?.[0]; // Assuming Tech 1 is the first in the array
        const tech2DbId = testDataIds.insertedIds.technicianDbIds?.[1]; // Assuming Tech 2 is the second
        const tech3DbId = testDataIds.insertedIds.technicianDbIds?.[2];
        const tech4DbId = testDataIds.insertedIds.technicianDbIds?.[3];

        expect(jobZ1_Id).toBeDefined();
        expect(jobZ2_Id).toBeDefined();
        expect(tech1DbId).toBeDefined();
        expect(tech2DbId).toBeDefined();

        const jobZ1 = finalJobsMap.get(jobZ1_Id!);
        const jobZ2 = finalJobsMap.get(jobZ2_Id!);

        expect(jobZ1).toBeDefined();
        expect(jobZ2).toBeDefined();

        // Assert Job Z1 (prog) status and assignment
        expect(jobZ1.status).toBe('queued');
        expect(jobZ1.assigned_technician).not.toBeNull();
        expect([tech1DbId, tech3DbId, tech4DbId]).toContain(jobZ1.assigned_technician);
        expect(jobZ1.assigned_technician).not.toBe(tech2DbId);

        // Assert Job Z2 (immo) status and assignment
        expect(jobZ2.status).toBe('queued');
        expect(jobZ2.assigned_technician).not.toBeNull();
        expect([tech2DbId, tech3DbId, tech4DbId]).toContain(jobZ2.assigned_technician);
        expect(jobZ2.assigned_technician).not.toBe(tech1DbId);

        // Assert that if Z1 is with Tech 1, Z2 is not, and if Z2 is with Tech 2, Z1 is not.
        // This also implies they cannot be assigned to the same tech if that tech is Tech 1 or Tech 2.
        if (jobZ1.assigned_technician === tech1DbId) {
            expect(jobZ2.assigned_technician).not.toBe(tech1DbId);
        }
        if (jobZ2.assigned_technician === tech2DbId) {
            expect(jobZ1.assigned_technician).not.toBe(tech2DbId);
        }
        // A more general assertion: Z1 and Z2 should not be assigned to the same technician
        // if that assignment would violate equipment constraints for one of them.
        // If they are assigned to the same tech (e.g. Tech 3 or 4 who has both tools),
        // that's fine. The primary check is that they are NOT assigned to a tech who lacks the tool.
        // The individual assertions above cover this more directly.
        // If they are assigned to different techs (Tech1/Tech2 or Tech3/Tech4 combos), that's also fine.
        console.log(`Scenario B: Job Z1 (prog) assigned to Tech ${jobZ1.assigned_technician}, Job Z2 (immo) assigned to Tech ${jobZ2.assigned_technician}`);

        // --- Scenario C: Equipment Conflict (Single Job) Verification ---
        console.log('Verifying Scenario C: Equipment Conflict (Single Job)...');
        const jobE_Id = testDataIds.insertedIds.jobE_Id?.[0];
        expect(jobE_Id).toBeDefined();

        const jobE = finalJobsMap.get(jobE_Id!);
        expect(jobE).toBeDefined();

        expect(jobE.status).toBe('pending_review');
        expect(jobE.assigned_technician).toBeNull();
        expect(jobE.estimated_sched).toBeNull();
        console.log(`Scenario C: Job E (rare_tool) status is ${jobE.status}, as expected.`);

        // --- Scenario D: Fixed Time Future Overflow Verification ---
        console.log('Verifying Scenario D: Fixed Time Future Overflow...');
        const jobF_Id = testDataIds.insertedIds.jobF_Id?.[0];
        const tech1DbId_D = testDataIds.insertedIds.technicianDbIds?.[0]; // Tech 1
        expect(jobF_Id).toBeDefined();
        expect(tech1DbId_D).toBeDefined();

        const jobF = finalJobsMap.get(jobF_Id!);
        expect(jobF).toBeDefined();
        expect(jobF.status).toBe('fixed_time');
        expect(jobF.assigned_technician).toBe(tech1DbId_D);
        expect(jobF.estimated_sched).not.toBeNull();
        // Ensure fixed_schedule_time is defined on the job object from the DB
        expect(jobF.fixed_schedule_time).toBeDefined(); 

        const jobF_estimatedSched = dayjs(jobF.estimated_sched).utc();
        const jobF_fixedTime = dayjs(jobF.fixed_schedule_time).utc();
        expect(jobF_estimatedSched.toISOString()).toBe(jobF_fixedTime.toISOString());

        // Verify no overlaps with other jobs for Tech 1 on that future day
        const jobF_endTime = jobF_estimatedSched.add(jobF.job_duration, 'minute');
        finalJobsMap.forEach(otherJob => {
            if (otherJob.id !== jobF_Id && 
                otherJob.assigned_technician === tech1DbId_D && 
                otherJob.estimated_sched &&
                dayjs(otherJob.estimated_sched).utc().isSame(jobF_estimatedSched, 'day')) {
                
                const otherJobStartTime = dayjs(otherJob.estimated_sched).utc();
                const otherJobEndTime = otherJobStartTime.add(otherJob.job_duration, 'minute');
                
                // Check for overlap: (StartA < EndB) and (EndA > StartB)
                const overlap = jobF_estimatedSched.isBefore(otherJobEndTime) && jobF_endTime.isAfter(otherJobStartTime);
                expect(overlap).toBe(false);
            }
        });
        console.log(`Scenario D: Job F (ID: ${jobF_Id}) correctly scheduled for Tech ${tech1DbId_D} at ${jobF_estimatedSched.toISOString()} (fixed).`);

        // --- Scenario E: Fixed Time Today Verification ---
        console.log('Verifying Scenario E: Fixed Time Today...');
        const jobT_Id = testDataIds.insertedIds.jobT_Id?.[0];
        const tech2DbId_E = testDataIds.insertedIds.technicianDbIds?.[1]; // Tech 2
        expect(jobT_Id).toBeDefined();
        expect(tech2DbId_E).toBeDefined();

        const jobT = finalJobsMap.get(jobT_Id!);
        expect(jobT).toBeDefined();
        expect(jobT.status).toBe('fixed_time');
        expect(jobT.assigned_technician).toBe(tech2DbId_E);
        expect(jobT.estimated_sched).not.toBeNull();
        expect(jobT.fixed_schedule_time).toBeDefined();

        const jobT_estimatedSched = dayjs(jobT.estimated_sched).utc();
        const jobT_fixedTime = dayjs(jobT.fixed_schedule_time).utc();
        expect(jobT_estimatedSched.toISOString()).toBe(jobT_fixedTime.toISOString());

        // Verify no overlaps with other jobs for Tech 2 today
        const jobT_endTime = jobT_estimatedSched.add(jobT.job_duration, 'minute');
        finalJobsMap.forEach(otherJob => {
            if (otherJob.id !== jobT_Id && 
                otherJob.assigned_technician === tech2DbId_E && 
                otherJob.estimated_sched &&
                dayjs(otherJob.estimated_sched).utc().isSame(jobT_estimatedSched, 'day')) {
                
                const otherJobStartTime = dayjs(otherJob.estimated_sched).utc();
                const otherJobEndTime = otherJobStartTime.add(otherJob.job_duration, 'minute');
                
                const overlap = jobT_estimatedSched.isBefore(otherJobEndTime) && jobT_endTime.isAfter(otherJobStartTime);
                expect(overlap).toBe(false);
            }
        });
        console.log(`Scenario E: Job T (ID: ${jobT_Id}) correctly scheduled for Tech ${tech2DbId_E} at ${jobT_estimatedSched.toISOString()} (fixed).`);
        
        // --- Scenario F: Long Duration Job Verification ---
        console.log('Verifying Scenario F: Long Duration Job...');
        const jobL_Id = testDataIds.insertedIds.jobL_Id?.[0];
        expect(jobL_Id).toBeDefined();

        const jobL = finalJobsMap.get(jobL_Id!);
        expect(jobL).toBeDefined();

        if (jobL.status === 'queued') {
            expect(jobL.assigned_technician).not.toBeNull();
            expect(jobL.estimated_sched).not.toBeNull();
            console.log(`Scenario F: Job L (ID: ${jobL_Id}, duration 600m) is QUEUED for Tech ${jobL.assigned_technician} at ${jobL.estimated_sched}.`);
        } else {
            // If not queued, it must be pending_review (or another unscheduled state)
            expect(jobL.status).toBe('pending_review');
            expect(jobL.assigned_technician).toBeNull();
            expect(jobL.estimated_sched).toBeNull();
            console.log(`Scenario F: Job L (ID: ${jobL_Id}, duration 600m) is PENDING_REVIEW, as expected if it couldn't be scheduled.`);
        }
        // Verify the job duration is still 600 as a sanity check
        expect(jobL.job_duration).toBe(600);

        // --- Scenario G: Same Location (Priority & Equipment) Verification ---
        console.log('Verifying Scenario G: Same Location (Priority & Equipment)...');
        const jobS1_Id = testDataIds.insertedIds.jobS1_Id?.[0];
        const jobS2_Id = testDataIds.insertedIds.jobS2_Id?.[0];
        const tech3DbId_G = testDataIds.insertedIds.technicianDbIds?.[2]; // Tech 3

        expect(jobS1_Id).toBeDefined();
        expect(jobS2_Id).toBeDefined();
        expect(tech3DbId_G).toBeDefined();

        const jobS1 = finalJobsMap.get(jobS1_Id!);
        const jobS2 = finalJobsMap.get(jobS2_Id!);

        expect(jobS1).toBeDefined();
        expect(jobS2).toBeDefined();

        expect(jobS1.status).toBe('queued');
        expect(jobS1.assigned_technician).toBe(tech3DbId_G);
        expect(jobS1.estimated_sched).not.toBeNull();

        expect(jobS2.status).toBe('queued');
        expect(jobS2.assigned_technician).toBe(tech3DbId_G);
        expect(jobS2.estimated_sched).not.toBeNull();
        
        // Optional: Check if S1 is scheduled before or at the same time as S2 if their durations allow.
        // This can be complex if the optimizer bundles them efficiently back-to-back regardless of original priority order.
        // For now, ensuring both are assigned to the correct tech and scheduled is the primary goal.
        if (jobS1.estimated_sched && jobS2.estimated_sched) {
            const s1Start = dayjs(jobS1.estimated_sched).utc();
            const s2Start = dayjs(jobS2.estimated_sched).utc();
            // It's possible S2 (lower priority) could be scheduled first if it leads to a better overall route
            // or if S1 couldn't fit earlier. So, a strict S1 <= S2 might not always hold if optimizer is aggressive.
            // A more robust check is that they don't overlap badly if they are distinct.
            // If they are truly bundled (S2 start = S1 end), that's optimal.
            console.log(`Scenario G: Job S1 Start: ${s1Start.toISOString()}, Job S2 Start: ${s2Start.toISOString()}`);
        }
        console.log(`Scenario G: Jobs S1 (ID: ${jobS1_Id}) & S2 (ID: ${jobS2_Id}) assigned to Tech ${tech3DbId_G} and scheduled.`);

        // --- Scenario H: Technician Unavailable Day Verification ---
        console.log('Verifying Scenario H: Technician Unavailable Day...');
        const tech4DbId_H = testDataIds.insertedIds.technicianDbIds?.[3]; // Tech 4 - CORRECTED
        expect(tech4DbId_H).toBeDefined();

        let jobsForTech4Today = 0;
        finalJobsMap.forEach(job => {
            if (job.assigned_technician === tech4DbId_H && 
                job.estimated_sched &&
                dayjs(job.estimated_sched).utc().isSame(dayjs.utc(), 'day')) {
                jobsForTech4Today++;
            }
        });
        expect(jobsForTech4Today).toBe(0);
        console.log(`Scenario H: Tech ${tech4DbId_H} has ${jobsForTech4Today} jobs scheduled for today (expected 0).`);

        // --- Scenario I: Technician Unavailable Window Verification ---
        console.log('Verifying Scenario I: Technician Unavailable Window (Late Start)...');
        const tech1JobsToday: any[] = []; 
        const tech1DbId_I = testDataIds.insertedIds.technicianDbIds?.[0]; // CORRECTED - Get Tech 1 ID
        // expect(tech1DbId_I).toBeDefined(); // Optional: add this expect if needed

        if (finalJobsMap && tech1DbId_I) { // CORRECTED - Check tech1DbId_I itself
            finalJobsMap.forEach(job => {
                if (job.assigned_technician === tech1DbId_I && dayjs(job.estimated_sched).utc().isSame(dayjs.utc(), 'day')) { // CORRECTED - Use tech1DbId_I
                    tech1JobsToday.push(job);
                }
            });
        }

        const tech1AvailableStartTime = dayjs.utc().hour(14).minute(0).second(0).millisecond(0);
        const tech1AvailableEndTime = dayjs.utc().hour(18).minute(30).second(0).millisecond(0);

        tech1JobsToday.forEach(job => {
            const jobStartTime = dayjs(job.estimated_sched).utc();
            const jobEndTime = jobStartTime.add(job.job_duration, 'minute');
            
            expect(jobStartTime.isSameOrAfter(tech1AvailableStartTime)).toBe(true);
            expect(jobEndTime.isSameOrBefore(tech1AvailableEndTime)).toBe(true);
        });
        console.log(`Scenario I: Tech 1 has ${tech1JobsToday.length} jobs scheduled today, all within 14:00-18:30 UTC.`);

        // --- Scenario J: Unschedulable Fixed Verification ---
        console.log('Verifying Scenario J: Unschedulable Fixed...');
        const jobU_Id = testDataIds.insertedIds.jobU_Id?.[0];
        expect(jobU_Id).toBeDefined();

        const jobU = finalJobsMap.get(jobU_Id!);
        expect(jobU).toBeDefined();

        expect(jobU.status).toBe('pending_review');
        expect(jobU.estimated_sched).toBeNull();
        if (jobU.assigned_technician !== null) {
            expect(jobU.assigned_technician).toBe(testDataIds.insertedIds.technicianDbIds?.[0]); // CORRECTED - Should be Tech 1 if not null
        }
        console.log(`Scenario J: Job U (ID: ${jobU_Id}) unschedulable fixed job has status ${jobU.status}.`);

        // --- Scenario M: Locked Job - In Progress Verification ---
        console.log('Verifying Scenario M: Locked Job - In Progress...');
        const jobLCKD_Id = testDataIds.insertedIds.jobLCKD_Id?.[0];
        const jobQ1M_Id = testDataIds.insertedIds.jobQ1M_Id?.[0];
        const jobQ2M_Id = testDataIds.insertedIds.jobQ2M_Id?.[0];
        const tech1DbId_M = testDataIds.insertedIds.technicianDbIds?.[0]; // Tech 1 - CORRECTED

        expect(jobLCKD_Id).toBeDefined();
        expect(jobQ1M_Id).toBeDefined();
        expect(jobQ2M_Id).toBeDefined();
        expect(tech1DbId_M).toBeDefined();

        const jobLCKD = finalJobsMap.get(jobLCKD_Id!);
        const jobQ1M = finalJobsMap.get(jobQ1M_Id!);
        const jobQ2M = finalJobsMap.get(jobQ2M_Id!);

        expect(jobLCKD).toBeDefined();
        expect(jobQ1M).toBeDefined();
        expect(jobQ2M).toBeDefined();

        // Verify Job LCKD (the 'in_progress' job)
        expect(jobLCKD.status).toBe('in_progress'); // Or could be 'completed' if test runs long enough, but 'in_progress' is the seeded state.
        expect(jobLCKD.assigned_technician).toBe(tech1DbId_M);
        expect(dayjs(jobLCKD.estimated_sched).utc().toISOString()).toBe(dayjs.utc().hour(9).minute(0).second(0).millisecond(0).toISOString());
        const jobLCKD_endTime = dayjs(jobLCKD.estimated_sched).utc().add(jobLCKD.job_duration, 'minute');
        console.log(`Scenario M: Job LCKD (ID: ${jobLCKD_Id}) is 'in_progress' with Tech ${tech1DbId_M} from ${jobLCKD.estimated_sched} to ${jobLCKD_endTime.toISOString()}`);

        // Verify Job Q1M
        if (jobQ1M.status === 'queued') {
            expect(jobQ1M.assigned_technician).toBe(tech1DbId_M);
            expect(jobQ1M.estimated_sched).not.toBeNull();
            const q1mStartTime = dayjs(jobQ1M.estimated_sched).utc();
            expect(q1mStartTime.isSameOrAfter(jobLCKD_endTime)).toBe(true);
            console.log(`Scenario M: Job Q1M (ID: ${jobQ1M_Id}) scheduled for Tech ${tech1DbId_M} at ${q1mStartTime.toISOString()}`);
        } else {
            expect(jobQ1M.status).toBe('pending_review');
            console.log(`Scenario M: Job Q1M (ID: ${jobQ1M_Id}) is pending_review.`);
        }

        // Verify Job Q2M
        if (jobQ2M.status === 'queued') {
            expect(jobQ2M.assigned_technician).toBe(tech1DbId_M);
            expect(jobQ2M.estimated_sched).not.toBeNull();
            const q2mStartTime = dayjs(jobQ2M.estimated_sched).utc();
            expect(q2mStartTime.isSameOrAfter(jobLCKD_endTime)).toBe(true);
            if (jobQ1M.status === 'queued' && jobQ1M.estimated_sched) {
                const q1mEndTimeAfterAll = dayjs(jobQ1M.estimated_sched).utc().add(jobQ1M.job_duration, 'minute');
                expect(q2mStartTime.isSameOrAfter(q1mEndTimeAfterAll)).toBe(true);
            }
            console.log(`Scenario M: Job Q2M (ID: ${jobQ2M_Id}) scheduled for Tech ${tech1DbId_M} at ${q2mStartTime.toISOString()}`);
        } else {
            expect(jobQ2M.status).toBe('pending_review');
            console.log(`Scenario M: Job Q2M (ID: ${jobQ2M_Id}) is pending_review.`);
        }

        console.log('--- Comprehensive Verification Potentially Complete (pending remaining scenario assertions) ---');
    });

    afterAll(async () => {
        // Optional: Cleanup specific seeded data if necessary
    });
}); 