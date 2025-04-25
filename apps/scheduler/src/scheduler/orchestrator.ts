import { SupabaseClient } from '@supabase/supabase-js';
import { getActiveTechnicians } from '../supabase/technicians';
import { getRelevantJobs, getJobsByStatus } from '../supabase/jobs';
import { Job, JobStatus, Technician, JobBundle, SchedulableItem, TechnicianAvailability, Address, SchedulableJob, VanEquipment } from '../types/database.types';
import { calculateTechnicianAvailability, calculateAvailabilityForDay } from './availability';
import { bundleQueuedJobs, mapItemsToJobIds } from './bundling';
import { determineTechnicianEligibility } from './eligibility';
import { prepareOptimizationPayload } from './payload';
import { callOptimizationService } from './optimize';
import { processOptimizationResults, ScheduledJobUpdate } from './results';
import { updateJobs, JobUpdateOperation } from '../db/update';
import { getEquipmentForVans } from '../supabase/equipment';

const LOCKED_JOB_STATUSES: JobStatus[] = ['en_route', 'in_progress', 'fixed_time'];
const INITIAL_SCHEDULABLE_STATUS: JobStatus = 'queued';
const PENDING_REVIEW_STATUS: JobStatus = 'pending_review';
const FINAL_SUCCESS_STATUS: JobStatus = 'queued';
const MAX_OVERFLOW_ATTEMPTS = 4;

interface FinalAssignment {
    technicianId: number;
    estimatedSchedISO: string;
}

// +++ START HELPER FUNCTION FOR SUMMARY +++
async function logSchedulingSummary(
    technicians: Technician[],
    finalAssignments: Map<number, FinalAssignment>,
    jobsToPlan: Set<number>,
    equipmentFetcher: (vanIds: number[]) => Promise<Map<number, VanEquipment[]>>,
    allFetchedJobsMapForSummary: Map<number, Job>
): Promise<string[]> {
    const generatedLinks: string[] = [];
    try {
        console.log('\n\n--- Scheduling Summary ---');

        if (technicians.length === 0) {
             console.log("No technician data available for summary.");
             return [];
        }

        // 1. Fetch equipment for all relevant vans
        const vanIds = technicians.map(t => t.assigned_van_id).filter((id): id is number => id !== null && id !== undefined);
        const equipmentByVan = vanIds.length > 0 ? await equipmentFetcher(vanIds) : new Map<number, VanEquipment[]>();

        // 2. Group assignments by technician
        const assignmentsByTechnician = new Map<number, { jobId: number; estimatedSchedISO: string }[]>();
        finalAssignments.forEach((assignment, jobId) => {
            if (!assignmentsByTechnician.has(assignment.technicianId)) {
                assignmentsByTechnician.set(assignment.technicianId, []);
            }
            // Type assertion needed as get() can return undefined
            (assignmentsByTechnician.get(assignment.technicianId) as { jobId: number; estimatedSchedISO: string }[]).push({ jobId, estimatedSchedISO: assignment.estimatedSchedISO });
        });

        // 3. Print Technician Summaries and Collect Links
        for (const tech of technicians) {
            const vanId = tech.assigned_van_id;
            const techEquipment = vanId ? (equipmentByVan.get(vanId) || []) : [];
            const equipmentList = techEquipment.map(e => e.equipment?.model || 'Unknown Model').join(', ') || 'None';
            const schedule = assignmentsByTechnician.get(tech.id) || [];
            schedule.sort((a, b) => a.estimatedSchedISO.localeCompare(b.estimatedSchedISO));
            const scheduleString = schedule.map(s => `  - Job ${s.jobId} @ ${s.estimatedSchedISO}`).join('\n') || '  - No jobs assigned';

            const name = tech.user?.full_name ?? 'Unknown Name';
            const homeLat = tech.home_location?.lat ?? 'N/A';
            const homeLng = tech.home_location?.lng ?? 'N/A';

            console.log(`\nTechnician ID: ${tech.id} (${name})`);
            console.log(`  Van ID: ${vanId ?? 'N/A'}`);
            console.log(`  Home Location: Lat ${homeLat}, Lng ${homeLng}`);
            console.log(`  Equipment: ${equipmentList}`);
            console.log(`  Assigned Schedule:`);
            console.log(scheduleString);

            // +++ START: Generate and Collect Google Maps Link +++
            if (schedule.length > 0 && tech.home_location?.lat && tech.home_location?.lng) {
                const origin = `${tech.home_location.lat},${tech.home_location.lng}`;
                let destination = origin;
                const waypoints: string[] = [];

                const jobCoordinates = schedule.map(assignment => {
                    const job = allFetchedJobsMapForSummary?.get(assignment.jobId);
                    if (job?.address?.lat && job?.address?.lng) {
                        return `${job.address.lat},${job.address.lng}`;
                    }
                    return null;
                }).filter((coord): coord is string => coord !== null);

                if (jobCoordinates.length > 0) {
                    destination = jobCoordinates[jobCoordinates.length - 1];
                    if (jobCoordinates.length > 1) {
                        waypoints.push(...jobCoordinates.slice(0, -1));
                    }

                    const mapsUrl = new URL('https://www.google.com/maps/dir/');
                    mapsUrl.searchParams.set('api', '1');
                    mapsUrl.searchParams.set('origin', origin);
                    mapsUrl.searchParams.set('destination', destination);
                    if (waypoints.length > 0) {
                        mapsUrl.searchParams.set('waypoints', waypoints.join('|'));
                    }
                    mapsUrl.searchParams.set('travelmode', 'driving');

                    generatedLinks.push(mapsUrl.toString());
                } else {
                     console.log(`  (Skipping directions link for Tech ${tech.id}: Could not determine job coordinates)`);
                }
            } else if (schedule.length > 0) {
                console.log(`  (Skipping directions link for Tech ${tech.id}: Missing technician home location)`);
            }
            // +++ END: Generate and Collect Google Maps Link +++
        }

        // 4. Print Unscheduled Jobs
        console.log('\n--- Unscheduled Jobs (Pending Review) ---');
        if (jobsToPlan.size > 0) {
            console.log(Array.from(jobsToPlan).sort((a, b) => a - b).join(', '));
        } else {
            console.log('None');
        }
        console.log('--- End Summary ---');
        return generatedLinks;
    } catch (summaryError) {
        console.error("Error generating scheduling summary:", summaryError);
        return [];
    }
}
// +++ END HELPER FUNCTION FOR SUMMARY +++

/**
 * Orchestrates the full job replanning process for a given day and subsequent overflow days.
 * Fetches necessary data, calculates availability, bundles jobs, determines eligibility,
 * calls an external optimization service, processes results internally, and performs a single
 * final database update.
 *
 * @param {SupabaseClient<any>} dbClient - The Supabase client instance for database interactions.
 * @returns {Promise<void>} A promise that resolves when the replan cycle is complete or rejects if an error occurs.
 * @throws {Error} Throws an error if a critical step fails (e.g., initial data fetch, optimization call, final DB update).
 */
export async function runFullReplan(dbClient: SupabaseClient<any>): Promise<void> {
  console.log('\n--- Starting Full Replan Cycle (Refactored Approach) ---');

  let allTechnicians: Technician[] = [];
  let jobsToPlan = new Set<number>();
  const finalAssignments = new Map<number, FinalAssignment>();
  const eligibleItemMapForPass = new Map<string, SchedulableItem>();
  let allFetchedJobsMap = new Map<number, Job>();
  let collectedDirectionLinks: string[] = [];

  try {
    // ========================================\n    // == Initial Data Fetch & Setup         ==\n    // ========================================
    console.log('Step 0: Fetching initial technicians and relevant jobs...');
    const [fetchedTechnicians, relevantJobsToday] = await Promise.all([
      getActiveTechnicians(),
      getRelevantJobs(),
    ]);
    allTechnicians = fetchedTechnicians;

    if (allTechnicians.length === 0) {
      console.warn('No active technicians found. Aborting replan.');
      return;
    }
    console.log(`Found ${allTechnicians.length} technicians and ${relevantJobsToday.length} relevant jobs.`);

    relevantJobsToday.forEach(job => {
        allFetchedJobsMap.set(job.id, job);
        if (job.status === INITIAL_SCHEDULABLE_STATUS) {
            jobsToPlan.add(job.id);
        }
    });

    const lockedJobsToday = relevantJobsToday.filter(job => LOCKED_JOB_STATUSES.includes(job.status));
    const fixedTimeJobsToday = lockedJobsToday.filter(job => job.status === 'fixed_time' && job.fixed_schedule_time);
    console.log(`Initial state: ${jobsToPlan.size} jobs to plan, ${lockedJobsToday.length} locked, ${fixedTimeJobsToday.length} fixed time.`);

    // ========================================\n    // == Pass 1: Plan for Today             ==\n    // ========================================
    if (jobsToPlan.size > 0) {
        console.log('\n--- Pass 1: Planning for Today ---');
        eligibleItemMapForPass.clear(); // Ensure map is clear for this pass

        console.log('Step 1.1: Calculating technician availability for today...');
        calculateTechnicianAvailability(allTechnicians, lockedJobsToday);

        const jobsForPass1Details = Array.from(jobsToPlan).map(id => allFetchedJobsMap.get(id)).filter((job): job is Job => !!job);

        console.log('Step 1.2: Bundling jobs for today...');
        const bundledItemsToday: SchedulableItem[] = bundleQueuedJobs(jobsForPass1Details);

        console.log('Step 1.3: Determining eligibility for today...');
        const eligibleItemsTodayRaw: SchedulableItem[] = await determineTechnicianEligibility(bundledItemsToday, allTechnicians);

        // +++ START: Filter out items with no eligible technicians for this pass +++
        const trulyEligibleItemsToday = eligibleItemsTodayRaw.filter(item => {
            // Type guard to check eligibility property based on item type
            if ('jobs' in item) { // It's a JobBundle
                // Correctly check the eligible_technician_ids property for bundles
                return (item as any).eligible_technician_ids && (item as any).eligible_technician_ids.length > 0;
            } else { // It's a SchedulableJob
                // Check the property suggested by the linter
                return item.eligibleTechnicians && item.eligibleTechnicians.length > 0;
            }
        });
        const ineligibleItemCountPass1 = eligibleItemsTodayRaw.length - trulyEligibleItemsToday.length;
        if (ineligibleItemCountPass1 > 0) {
            console.log(`   -> Filtered out ${ineligibleItemCountPass1} item(s) with no eligible technicians for Pass 1.`);
        }
        // +++ END: Filter +++

        // Use the *filtered* list from now on for this pass
        trulyEligibleItemsToday.forEach(item => {
            // Set the key in the eligibleItemMapForPass (only for truly eligible items)
            if ('jobs' in item) {
                eligibleItemMapForPass.set(`bundle_${item.order_id}`, item);
            } else {
                eligibleItemMapForPass.set(`job_${item.id}`, item);
            }
        });

        if (trulyEligibleItemsToday.length > 0) { // <-- Use filtered list length
            console.log('Step 1.4: Preparing optimization payload for today...');
            // Pass the *filtered* list to payload generation, indicating it's for today
            const optimizationPayloadToday = await prepareOptimizationPayload(allTechnicians, trulyEligibleItemsToday, fixedTimeJobsToday, undefined, true);

            if (optimizationPayloadToday.items.length > 0) {
                 console.log('Step 1.5: Calling optimization microservice for today...');
                 const optimizationResponseToday = await callOptimizationService(optimizationPayloadToday);

                 console.log('Step 1.6: Processing optimization results for today...');
                 // Pass the map which now *only* contains truly eligible items for this pass
                 const processedResultsToday = processOptimizationResults(optimizationResponseToday, eligibleItemMapForPass);

                 console.log('Step 1.7: Updating internal state...');
                 processedResultsToday.scheduledJobs.forEach((update: ScheduledJobUpdate) => {
                     if (jobsToPlan.has(update.jobId)) {
                         finalAssignments.set(update.jobId, {
                             technicianId: update.technicianId,
                             estimatedSchedISO: update.estimatedSchedISO,
                         });
                         jobsToPlan.delete(update.jobId);
                     } else {
                          console.warn(`Job ${update.jobId} scheduled by optimizer but was not in 'jobsToPlan' set.`);
                     }
                 });
                 const unassignedJobIdsToday = mapItemsToJobIds(processedResultsToday.unassignedItemIds, eligibleItemMapForPass);
                 unassignedJobIdsToday.forEach(jobId => {
                    if (!jobsToPlan.has(jobId) && allFetchedJobsMap.get(jobId)?.status === INITIAL_SCHEDULABLE_STATUS) {
                        console.warn(`Job ${jobId} reported unassigned but was missing from 'jobsToPlan' set. Adding back.`);
                        jobsToPlan.add(jobId);
                    }
                 });
                 console.log(`Pass 1 Results: ${finalAssignments.size} jobs assigned, ${jobsToPlan.size} jobs remain.`);

            } else {
                console.log('No items could be prepared for optimization payload for today (all filtered?).');
            }
        } else {
            console.log('No eligible items found for today after bundling and eligibility checks (all filtered?).');
        }
    } else {
        console.log('No initial jobs to plan for today.');
    }
    console.log(`--- Pass 1 Complete. ${jobsToPlan.size} jobs remaining to plan. ---`);

    // ========================================\n    // == Pass 2+: Plan for Overflow        ==\n    // ========================================
    let loopCount = 0;
    let basePlanningDate = new Date();

    while (jobsToPlan.size > 0 && loopCount < MAX_OVERFLOW_ATTEMPTS) {
        loopCount++;
        const currentPlanningDate = new Date(basePlanningDate);
        currentPlanningDate.setUTCDate(basePlanningDate.getUTCDate() + loopCount);
        const planningDateStr = currentPlanningDate.toISOString().split('T')[0];
        console.log(`\n--- Overflow Pass ${loopCount}: Planning for ${planningDateStr} ---`);
        eligibleItemMapForPass.clear(); // Clear map for this pass

        console.log(`Step ${loopCount}.1: Fetching technicians with home locations...`);
        const techsForLoop = await getActiveTechnicians();
        if (techsForLoop.length === 0) {
            console.warn(`No active technicians found for ${planningDateStr}. Cannot plan overflow. Stopping loop.`);
            break;
        }

        const jobsForLoopDetails = Array.from(jobsToPlan)
            .map(id => allFetchedJobsMap.get(id))
            .filter((job): job is Job => {
                if (!job) console.warn(`Missing job detail in allFetchedJobsMap for ID during overflow pass ${loopCount}`);
                return !!job;
            });

        if (jobsForLoopDetails.length === 0 && jobsToPlan.size > 0) {
             console.warn(`Job IDs exist in jobsToPlan but details not found in allFetchedJobsMap for ${planningDateStr}. Ending loop.`);
             jobsToPlan.clear();
             break;
        }
         console.log(`Attempting to plan ${jobsToPlan.size} remaining jobs.`);


        console.log(`Step ${loopCount}.2: Calculating availability for ${planningDateStr}...`);
        const availabilityThisDay: TechnicianAvailability[] = calculateAvailabilityForDay(techsForLoop, currentPlanningDate);
        if (availabilityThisDay.length === 0) {
            console.log(`No technician availability on ${planningDateStr} (Weekend/Holiday?). Skipping day.`);
            continue;
        }
        const availableTechIdsThisDay = new Set(availabilityThisDay.map(a => a.technicianId));
        const availableTechsThisDay = techsForLoop.filter(t => availableTechIdsThisDay.has(t.id));
        console.log(`Found ${availableTechsThisDay.length} technicians available on ${planningDateStr}.`);

        console.log(`Step ${loopCount}.3: Bundling remaining jobs for ${planningDateStr}...`);
        const bundledItemsLoop: SchedulableItem[] = bundleQueuedJobs(jobsForLoopDetails);

        console.log(`Step ${loopCount}.4: Determining eligibility for ${planningDateStr}...`);
        const eligibleItemsLoopRaw: SchedulableItem[] = await determineTechnicianEligibility(bundledItemsLoop, availableTechsThisDay);

        // +++ START: Filter out items with no eligible technicians for this pass +++
        const trulyEligibleItemsLoop = eligibleItemsLoopRaw.filter(item => {
            // Type guard to check eligibility property based on item type
            if ('jobs' in item) { // It's a JobBundle
                 // Correctly check the eligible_technician_ids property for bundles
                return (item as any).eligible_technician_ids && (item as any).eligible_technician_ids.length > 0;
            } else { // It's a SchedulableJob
                 // Check the property suggested by the linter
                return item.eligibleTechnicians && item.eligibleTechnicians.length > 0;
            }
        });
        const ineligibleItemCountLoop = eligibleItemsLoopRaw.length - trulyEligibleItemsLoop.length;
        if (ineligibleItemCountLoop > 0) {
            console.log(`   -> Filtered out ${ineligibleItemCountLoop} item(s) with no eligible technicians for Overflow Pass ${loopCount}.`);
        }
        // +++ END: Filter +++

        // Use the *filtered* list from now on for this pass
        trulyEligibleItemsLoop.forEach(item => {
            // Set the key in the eligibleItemMapForPass (only for truly eligible items)
            if ('jobs' in item) {
                eligibleItemMapForPass.set(`bundle_${item.order_id}`, item);
            } else {
                eligibleItemMapForPass.set(`job_${item.id}`, item);
            }
        });

        if (trulyEligibleItemsLoop.length === 0) { // <-- Use filtered list length
            console.log(`No eligible items for ${planningDateStr} after bundling and eligibility (all filtered?). Continuing loop.`);
            continue;
        }

        console.log(`Step ${loopCount}.5: Preparing optimization payload for ${planningDateStr}...`);
        // Pass the *filtered* list and availability details, indicating it's NOT for today
        const optimizationPayloadLoop = await prepareOptimizationPayload(availableTechsThisDay, trulyEligibleItemsLoop, [], availabilityThisDay, false);

        if (optimizationPayloadLoop.items.length === 0) {
            console.log(`No items could be prepared for optimization for ${planningDateStr} (all filtered?). Continuing loop.`);
            continue;
        }

        console.log(`Step ${loopCount}.6: Calling optimization microservice for ${planningDateStr}...`);
        const optimizationResponseLoop = await callOptimizationService(optimizationPayloadLoop);

        console.log(`Step ${loopCount}.7: Processing optimization results for ${planningDateStr}...`);
        // Pass the map which now *only* contains truly eligible items for this pass
        const processedResultsLoop = processOptimizationResults(optimizationResponseLoop, eligibleItemMapForPass);

        console.log(`Step ${loopCount}.8: Updating internal state...`);
        processedResultsLoop.scheduledJobs.forEach((update: ScheduledJobUpdate) => {
             if (jobsToPlan.has(update.jobId)) {
                 finalAssignments.set(update.jobId, {
                     technicianId: update.technicianId,
                     estimatedSchedISO: update.estimatedSchedISO,
                 });
                 jobsToPlan.delete(update.jobId);
             } else {
                  console.warn(`Job ${update.jobId} scheduled by optimizer in overflow pass but was not in 'jobsToPlan' set.`);
             }
        });
        const unassignedJobIdsLoop = mapItemsToJobIds(processedResultsLoop.unassignedItemIds, eligibleItemMapForPass);
        unassignedJobIdsLoop.forEach(jobId => {
           if (!jobsToPlan.has(jobId) && allFetchedJobsMap.get(jobId)?.status === INITIAL_SCHEDULABLE_STATUS) {
               console.warn(`Job ${jobId} reported unassigned in overflow pass but was missing from 'jobsToPlan' set. Adding back.`);
               jobsToPlan.add(jobId);
           }
        });

        console.log(`--- Overflow Pass ${loopCount} Complete. ${jobsToPlan.size} jobs remaining to plan. ---`);
    } // End while loop

    // ========================================\n    // == Final Database Update             ==\n    // ========================================
    console.log('\n--- Final Database Update ---');
    console.log('DEBUG: Final content of finalAssignments Map:', JSON.stringify(Array.from(finalAssignments.entries())));
    console.log('DEBUG: Final content of jobsToPlan Set:', JSON.stringify(Array.from(jobsToPlan.values())));
    const finalUpdates: JobUpdateOperation[] = [];

    finalAssignments.forEach((assignment, jobId) => {
        finalUpdates.push({
            jobId: jobId,
            data: {
                status: FINAL_SUCCESS_STATUS, // 'queued'
                assigned_technician: assignment.technicianId,
                estimated_sched: assignment.estimatedSchedISO,
            }
        });
    });

    jobsToPlan.forEach(jobId => {
        finalUpdates.push({
            jobId: jobId,
            data: {
                status: PENDING_REVIEW_STATUS,
                assigned_technician: null,
                estimated_sched: null,
            }
        });
    });

    if (finalUpdates.length > 0) {
        console.log(`Applying final updates: ${finalAssignments.size} jobs to '${FINAL_SUCCESS_STATUS}', ${jobsToPlan.size} jobs to '${PENDING_REVIEW_STATUS}'.`);
        await updateJobs(dbClient, finalUpdates);
    } else {
        console.log('No final database updates required (no jobs planned or failed).');
    }

    // Call summary logger and capture the links
    collectedDirectionLinks = await logSchedulingSummary(allTechnicians, finalAssignments, jobsToPlan, getEquipmentForVans, allFetchedJobsMap);

    // <-- START: Log collected links at the end -->
    console.log('\n\n--- Generated Direction Links ---');
    if (collectedDirectionLinks.length > 0) {
        collectedDirectionLinks.forEach(link => console.log(link));
    } else {
        console.log('No direction links were generated.');
    }
    console.log('--- End Generated Direction Links ---');
    // <-- END: Log collected links at the end -->

    console.log('\n--- Full Replan Cycle Completed Successfully ---');

  } catch (error) {
    // Call summary logger in case of error, but we might not log the links here
    // as the state could be inconsistent.
    await logSchedulingSummary(allTechnicians, finalAssignments, jobsToPlan, getEquipmentForVans, allFetchedJobsMap);

    console.error('\n--- Full Replan Cycle Failed ---');
    if (error instanceof Error) {
        console.error(`Error Message: ${error.message}`);
        console.error(`Error Stack: ${error.stack}`);
    } else {
        console.error('An unexpected error occurred:', error);
    }
    throw error; // Re-throw
  }
}

/* Example run block remains the same */
/*
import { runFullReplan } from './scheduler/orchestrator';
import { supabase } from './supabase/client';

async function main() {
  if (!supabase) {
      console.error("Supabase client is not initialized. Cannot run replan.");
      process.exit(1);
  }
  try {
    await runFullReplan(supabase);
    console.log("Main execution finished.");
  } catch (error) {
    console.error('Main execution failed.');
    process.exit(1);
  }
}
// main();
*/ 