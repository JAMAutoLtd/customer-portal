import { SupabaseClient } from '@supabase/supabase-js';
import { getActiveTechnicians } from '../supabase/technicians';
import { getRelevantJobs, getJobsByStatus } from '../supabase/jobs';
import { 
    Job, JobStatus, Technician, JobBundle, SchedulableItem, 
    TechnicianAvailability, Address, SchedulableJob, VanEquipment,
    FailureReason, isPersistentFailure, SchedulingAttempt, JobSchedulingState 
} from '../types/database.types';
import { 
    calculateTechnicianAvailability, calculateAvailabilityForDay, 
    formatDateToString, calculateWindowsForTechnician, applyLockedJobsToWindows,
    TimeWindow, DailyAvailabilityWindows
} from './availability';
import { bundleQueuedJobs, mapItemsToJobIds } from './bundling';
import { determineTechnicianEligibility, EligibilityResult, IneligibleItem } from './eligibility';
import { prepareOptimizationPayload } from './payload';
import { callOptimizationService } from './optimize';
import { processOptimizationResults, ScheduledJobUpdate } from './results';
import { updateJobs, JobUpdateOperation } from '../db/update';
import { getEquipmentForVans } from '../supabase/equipment';
import { fetchDeviceLocations, DeviceLocationMap } from '../onestepgps/client';
import { logger } from '../utils/logger';

const LOCKED_JOB_STATUSES: JobStatus[] = ['en_route', 'in_progress', 'fixed_time'];
const INITIAL_SCHEDULABLE_STATUS: JobStatus = 'queued';
const PENDING_REVIEW_STATUS: JobStatus = 'pending_review';
const FINAL_SUCCESS_STATUS: JobStatus = 'queued';
const MAX_OVERFLOW_ATTEMPTS = 5;

interface FinalAssignment {
    technicianId: number;
    estimatedSchedISO: string;
}

// --- Start: Define helper to create a scheduling attempt ---
function createAttempt(
    planningDay: string, // YYYY-MM-DD
    success: boolean,
    failureReason: FailureReason | null,
    assignment?: FinalAssignment | null
): SchedulingAttempt {
    return {
        timestamp: new Date().toISOString(),
        planningDay: planningDay,
        success: success,
        failureReason: failureReason,
        assignedTechnicianId: assignment?.technicianId,
        assignedTimeISO: assignment?.estimatedSchedISO
    };
}
// --- End: Define helper to create a scheduling attempt ---

// --- Helper function to check if a date falls on a specific day ---
function isDateOnDay(isoDateTime: string | null | undefined, targetDate: Date): boolean {
    if (!isoDateTime) return false;
    try {
        const jobDate = new Date(isoDateTime);
        return jobDate.getUTCFullYear() === targetDate.getUTCFullYear() &&
               jobDate.getUTCMonth() === targetDate.getUTCMonth() &&
               jobDate.getUTCDate() === targetDate.getUTCDate();
    } catch (e) {
        logger.error(`Error parsing date ${isoDateTime}:`, e);
        return false;
    }
}

// --- Helper function to check if a date is strictly before a specific day ---
function isDateBefore(isoDateTime: string | null | undefined, targetDate: Date): boolean {
    if (!isoDateTime) return false; // Or maybe true depending on desired behavior for null?
    try {
        const jobDate = new Date(isoDateTime);
        // Set hours to 0 to compare dates only
        const jobDateOnly = new Date(Date.UTC(jobDate.getUTCFullYear(), jobDate.getUTCMonth(), jobDate.getUTCDate()));
        const targetDateOnly = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
        return jobDateOnly < targetDateOnly;
    } catch (e) {
        logger.error(`Error parsing date ${isoDateTime}:`, e);
        return false; // Treat parse errors as not before?
    }
}

// --- Start: Modify logSchedulingSummary signature and logic ---
async function logSchedulingSummary(
    technicians: Technician[],
    finalAssignments: Map<number, FinalAssignment>,
    jobStates: Map<number, JobSchedulingState>, 
    equipmentFetcher: (vanIds: number[]) => Promise<Map<number, VanEquipment[]>>,
    allFetchedJobsMapForSummary: Map<number, Job>
): Promise<string[]> {
    const generatedLinks: string[] = [];
    try {
        logger.info('\n\n--- Scheduling Summary ---');

        if (technicians.length === 0) {
             logger.warn("No technician data available for summary.");
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

            logger.info(`\nTechnician ID: ${tech.id} (${name})`);
            logger.info(`  Van ID: ${vanId ?? 'N/A'}`);
            logger.info(`  Home Location: Lat ${homeLat}, Lng ${homeLng}`);
            logger.info(`  Equipment: ${equipmentList}`);
            logger.info(`  Assigned Schedule:`);
            logger.info(scheduleString);

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
                     logger.debug(`  (Skipping directions link for Tech ${tech.id}: Could not determine job coordinates)`);
                }
            } else if (schedule.length > 0) {
                logger.debug(`  (Skipping directions link for Tech ${tech.id}: Missing technician home location)`);
            }
            // +++ END: Generate and Collect Google Maps Link +++
        }

        // 4. Print Unscheduled Jobs based on final state
        logger.info('\n--- Unscheduled Jobs (Pending Review) ---');
        const unscheduledJobIds = Array.from(jobStates.values())
            .filter(state => state.lastStatus === 'failed_persistent' || state.lastStatus === 'failed_transient')
            .map(state => state.jobId)
            .sort((a, b) => a - b);

        if (unscheduledJobIds.length > 0) {
            unscheduledJobIds.forEach(jobId => {
                const state = jobStates.get(jobId);
                const finalReason = state?.attempts[state.attempts.length - 1]?.failureReason || FailureReason.UNKNOWN;
                logger.info(`  - Job ${jobId} (Final Status: ${state?.lastStatus}, Last Reason: ${finalReason})`);
            });
        } else {
            logger.info('None');
        }
        logger.info('--- End Summary ---');
        return generatedLinks;
    } catch (summaryError) {
        logger.error("Error generating scheduling summary:", summaryError);
        return [];
    }
}
// --- End: Modify logSchedulingSummary signature and logic ---

// --- Start: Helper function for updating job states on skipped days ---
/**
 * Updates the internal state of pending/transient jobs when a planning day is skipped 
 * due to lack of overall technician availability.
 * Adds a SchedulingAttempt with the specified failure reason for the skipped date.
 *
 * @param jobStates Map tracking the scheduling state of each job.
 * @param skippedDateStr The date (YYYY-MM-DD) that was skipped.
 * @param failureReason The reason the day was skipped (e.g., NO_TECHNICIAN_AVAILABILITY).
 * @param passIdentifier String identifying which pass was skipped (e.g., "Pass 1 (Today)").
 */
function updateJobStatesForSkippedDay(
    jobStates: Map<number, JobSchedulingState>,
    skippedDateStr: string, // YYYY-MM-DD
    failureReason: FailureReason,
    passIdentifier: string // e.g., "Pass 1 (Today)" or "Overflow Pass X"
): void {
    logger.info(`Updating job states due to skipped planning day: ${skippedDateStr} (${passIdentifier})`);
    const jobIdsToUpdate = Array.from(jobStates.keys());
    let updatedCount = 0;
    jobIdsToUpdate.forEach(jobId => {
        const state = jobStates.get(jobId);
        if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
            const attempt = createAttempt(skippedDateStr, false, failureReason);
            state.attempts.push(attempt);
            state.lastStatus = 'failed_transient'; 
            jobStates.set(jobId, state);
            logger.debug(`Updating job state (${failureReason} - ${passIdentifier} Skip)`, {
                jobId: jobId,
                newStatus: state.lastStatus,
                failureReason: failureReason,
                planningDay: skippedDateStr,
                passIdentifier: passIdentifier
            });
            updatedCount++;
        } else if (!state) {
            logger.error(`Could not find state for job ID ${jobId} during ${failureReason} update for ${skippedDateStr}.`);
        }
        // If state.lastStatus is already 'scheduled' or 'failed_persistent', do nothing.
    });
    logger.info(`Finished updating states for ${updatedCount} pending/transient jobs for skipped day ${skippedDateStr}.`);
}
// --- End: Helper function ---

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
  // Remove diagnostic logs
  logger.info('\n--- Starting Full Replan Cycle ---');

  let allTechnicians: Technician[] = [];
  const jobStates = new Map<number, JobSchedulingState>();
  const finalAssignments = new Map<number, FinalAssignment>();
  const eligibleItemMapForPass = new Map<string, SchedulableItem>();
  let allFetchedJobsMap = new Map<number, Job>();
  let collectedDirectionLinks: string[] = [];
  // --- Start Refactoring: Initialize finalUpdates early ---
  const finalUpdates: JobUpdateOperation[] = [];
  // --- End Refactoring ---

  try {
    // Log entry into the try block
    logger.info('>>> runFullReplan entered TRY block.');

    // ========================================\n    // == Initial Data Fetch & Setup         ==\n    // ========================================
    logger.info('Step 0: Fetching initial technicians and relevant jobs...');
    const [fetchedTechnicians, relevantJobsToday, allFixedTimeJobsFromDB] = await Promise.all([
      getActiveTechnicians(),
      getRelevantJobs(),
      getJobsByStatus(['fixed_time'])
    ]);
    allTechnicians = fetchedTechnicians;

    if (allTechnicians.length === 0) {
      logger.warn('No active technicians found. Aborting replan.');
      return;
    }
    logger.info(`Found ${allTechnicians.length} technicians and ${relevantJobsToday.length} relevant jobs.`);

    relevantJobsToday.forEach(job => {
        allFetchedJobsMap.set(job.id, job);
        if (job.status === INITIAL_SCHEDULABLE_STATUS) {
            jobStates.set(job.id, {
                jobId: job.id,
                attempts: [],
                lastStatus: 'pending' // Start as pending
            });
        }
    });

    // +++ START One Step GPS Integration +++
    logger.info('Step 0.5: Fetching real-time technician locations from One Step GPS...');
    const realTimeLocations: DeviceLocationMap | null = await fetchDeviceLocations();

    if (realTimeLocations) {
        let updatedCount = 0;
        allTechnicians.forEach(tech => {
            // Get device ID from the assigned van
            const deviceId = tech.van?.onestepgps_device_id;

            if (deviceId && realTimeLocations[deviceId]) {
                const locationInfo = realTimeLocations[deviceId];
                // Update the technician's current location in memory
                tech.current_location = { lat: locationInfo.lat, lng: locationInfo.lng };
                // Optional: Consider storing timestamp if needed for staleness checks
                // tech.location_timestamp = locationInfo.timestamp; 
                updatedCount++;
            } else if (tech.assigned_van_id && deviceId) {
                // Only warn if tech has a van and device ID, but no location was found in the API response
                logger.warn(`OneStepGPS WARN: No real-time location found for Tech ${tech.id} (Van: ${tech.assigned_van_id}, Device ID: ${deviceId}). Using last known DB/Van location.`);
            } else if (tech.assigned_van_id && !deviceId) {
                // Optional: Log info if van exists but has no device ID configured
                logger.debug(`OneStepGPS INFO: Tech ${tech.id} (Van: ${tech.assigned_van_id}) has no OneStepGPS device ID configured.`);
            }
            // If no assigned van or no deviceId, naturally fall back to DB location (likely home or last known van location from initial fetch)
        });
        logger.info(`OneStepGPS: Successfully updated ${updatedCount} technician locations from One Step GPS.`);
    } else {
        logger.warn('OneStepGPS WARN: Failed to fetch real-time locations from One Step GPS. Proceeding with last known locations from database/van data.');
        // No changes needed, allTechnicians array already has DB/van locations as current_location fallback
    }
    // +++ END One Step GPS Integration +++

    const lockedJobsToday = relevantJobsToday.filter(job => LOCKED_JOB_STATUSES.includes(job.status));
    logger.info(`Found ${allFixedTimeJobsFromDB.length} total fixed time jobs initially.`);

    const initialPendingCount = Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending').length;
    logger.info(`Initial state (after GPS check): ${initialPendingCount} jobs to plan, ${lockedJobsToday.length} locked.`);

    // ========================================\n    // == Pass 1: Plan for Today             ==\n    // ========================================
    // --- Start: Availability Pre-Check for Today (FR-ORCH-SKIP-001) ---
    // Before committing to planning for today, check if *any* technician has *any*
    // availability window after considering their default hours, exceptions, AND
    // any jobs already locked for today (e.g., en_route, in_progress, fixed_time).
    logger.info('Step 1.0: Performing availability pre-check for today...');
    let isAnyTechAvailableToday = false;
    const todayDate = new Date();
    const todayDateStr = formatDateToString(todayDate);

    for (const tech of allTechnicians) {
        // Calculate base windows for today (just for this one day is efficient enough here)
        const baseWindowsMap: DailyAvailabilityWindows = calculateWindowsForTechnician(tech, todayDate, todayDate);
        
        // Apply locked jobs for today
        const lockedJobsForTechToday = lockedJobsToday.filter(j => j.assigned_technician === tech.id);
        const finalWindowsMapToday: DailyAvailabilityWindows = applyLockedJobsToWindows(
            baseWindowsMap,         // Pass the full map
            lockedJobsForTechToday,
            tech.id,                // Pass tech ID
            todayDate               // Pass the target date
        );

        // Get the windows specifically for today from the result map
        const finalWindowsArrayToday: TimeWindow[] = finalWindowsMapToday.get(todayDateStr) || [];

        // Check the length of the array for today
        if (finalWindowsArrayToday.length > 0) {
            isAnyTechAvailableToday = true;
            logger.debug(`Technician ${tech.id} has calculated availability today.`);
            break; // Found an available tech
        }
    }

    if (isAnyTechAvailableToday) {
        logger.info('Availability pre-check passed: At least one technician is available today.');
    } else {
        logger.warn('Availability pre-check failed: No technicians have calculated availability windows for today after considering locked jobs.');
    }
    // --- End: Availability Pre-Check for Today ---

    // --- Start Refactoring: Check overall availability before planning pass ---
    // let isAnyTechAvailableToday = false; // Removed - calculated above
    // for (const tech of allTechnicians) { // Removed - calculated above
    //     const techWindows = calculateWindowsForTechnician(tech, new Date(), new Date()); // Removed - calculated above
    //     if (techWindows.has(formatDateToString(new Date()))) { // Removed - calculated above
    //         isAnyTechAvailableToday = true; // Removed - calculated above
    //         break; // Removed - calculated above
    //     }
    // }
    // --- End Refactoring ---

    // --- Start Refactoring: Conditionally execute Pass 1 ---
    // Only proceed with Pass 1 if:
    // 1. There are jobs currently in a state that needs planning (pending or failed_transient).
    // 2. The availability pre-check above confirmed at least one technician is available today.
    if (Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending' || s.lastStatus === 'failed_transient').length > 0 && isAnyTechAvailableToday) { // Modified condition
        logger.info('\n--- Pass 1: Planning for Today ---');
        eligibleItemMapForPass.clear(); // Ensure map is clear for this pass
        const currentPlanningDate = new Date();
        const planningDateStr = formatDateToString(currentPlanningDate);

        logger.info('Step 1.1: Calculating technician availability for today...');
        // Availability is now calculated within prepareOptimizationPayload based on targetDate
        // calculateTechnicianAvailability(allTechnicians, lockedJobsToday); <-- Remove old call

        const pendingJobIdsToday = Array.from(jobStates.values())
            .filter(state => state.lastStatus === 'pending')
            .map(state => state.jobId);
        const jobsForPass1Details = pendingJobIdsToday
            .map(id => allFetchedJobsMap.get(id))
            .filter((job): job is Job => !!job);

        logger.info('Step 1.2: Bundling jobs for today...');
        const bundledItemsToday: SchedulableItem[] = bundleQueuedJobs(jobsForPass1Details);

        logger.info('Step 1.3: Determining eligibility for today...');
        const { eligibleItems: eligibleItemsTodayRaw, ineligibleItems: ineligibleItemsToday }: EligibilityResult = 
            await determineTechnicianEligibility(bundledItemsToday, allTechnicians);
        
        // --- Start Refactoring: Handle Ineligible Fixed Jobs (Today) ---
        ineligibleItemsToday.forEach(ineligible => {
            const itemIdString = 'jobs' in ineligible.item
                ? `bundle_${ineligible.item.order_id}`
                : `job_${ineligible.item.id}`;
            const itemJobIds = mapItemsToJobIds([itemIdString], new Map([[itemIdString, ineligible.item]]));

            itemJobIds.forEach(jobId => {
                const originalJob = allFetchedJobsMap.get(jobId); // Get original job details

                // Check if it's a fixed job that failed eligibility persistently
                if (originalJob && originalJob.status === 'fixed_time' && isPersistentFailure(ineligible.reason)) {
                     logger.warn(`Fixed job ${jobId} failed persistent eligibility check (${ineligible.reason}). Marking for pending_review.`);
                     // Directly mark for final DB update to pending_review
                     finalUpdates.push({
                         jobId: jobId,
                         data: {
                             status: PENDING_REVIEW_STATUS,
                             assigned_technician: null,
                             estimated_sched: null,
                         }
                     });
                     // Remove from jobStates if it somehow got added (defensive)
                     jobStates.delete(jobId);
                } else {
                    // Original logic for non-fixed jobs or transient failures
                    const state = jobStates.get(jobId);
                    if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
                        const attempt = createAttempt(planningDateStr, false, ineligible.reason);
                        state.attempts.push(attempt);
                        if (isPersistentFailure(ineligible.reason)) {
                            state.lastStatus = 'failed_persistent';
                            logger.debug(`   -> Job ${jobId} marked failed_persistent due to ${ineligible.reason}`);
                        } else {
                            state.lastStatus = 'failed_transient';
                        }
                        jobStates.set(jobId, state);
                    }
                    // If state doesn't exist or is already 'scheduled'/'failed_persistent', do nothing here
                    // (Fixed jobs failing eligibility are handled above)
                }
            });
        });
        // --- End Refactoring ---
        
        // Filter eligibleItemsTodayRaw based on whether their constituent jobs were marked 'failed_persistent' directly above
        const eligibleItemsToday = eligibleItemsTodayRaw.filter(item => {
            const itemIdString = 'jobs' in item ? `bundle_${item.order_id}` : `job_${item.id}`;
            const itemJobIds = mapItemsToJobIds([itemIdString], new Map([[itemIdString, item]]));
            // Keep the item only if ALL its constituent jobs were NOT directly marked for pending_review in finalUpdates
            return Array.from(itemJobIds).every(jobId => 
                !finalUpdates.some(upd => upd.jobId === jobId && upd.data.status === PENDING_REVIEW_STATUS)
            );
        });
        
        // Update eligibleItemMapForPass with the *filtered* list
        eligibleItemsToday.forEach(item => {
            if ('jobs' in item) {
                eligibleItemMapForPass.set(`bundle_${item.order_id}`, item);
            } else {
                eligibleItemMapForPass.set(`job_${item.id}`, item);
            }
        });
        const eligibleItemCountPass1 = eligibleItemsToday.length;
        logger.info(`   -> Found ${eligibleItemCountPass1} eligible item(s) for Pass 1.`);

        if (eligibleItemCountPass1 > 0) {
            logger.info('Step 1.4: Preparing optimization payload for today...');
            const targetDateToday = new Date(); 
            const optimizationPayloadToday = await prepareOptimizationPayload(
                allTechnicians, 
                eligibleItemsToday,
                lockedJobsToday, 
                targetDateToday 
            );

            if (optimizationPayloadToday.items.length > 0) {
                 logger.info('Step 1.5: Calling optimization microservice for today...');
                 const optimizationResponseToday = await callOptimizationService(optimizationPayloadToday);
                 
                 // <<< Add Logging for Raw Optimizer Response >>>
                 logger.debug("Received raw optimizer response (Today Pass)", { 
                    response: optimizationResponseToday 
                 });
                 // <<< End Logging >>>

                 logger.info('Step 1.6: Processing optimization results for today...');
                 const processedResultsToday = processOptimizationResults(optimizationResponseToday, eligibleItemMapForPass);

                 logger.info('Step 1.7: Updating internal state...');
                 processedResultsToday.scheduledJobs.forEach((update: ScheduledJobUpdate) => {
                     const state = jobStates.get(update.jobId);
                     if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
                         const assignment: FinalAssignment = {
                            technicianId: update.technicianId,
                            estimatedSchedISO: update.estimatedSchedISO,
                         }; 
                         finalAssignments.set(update.jobId, assignment);
                         const attempt = createAttempt(planningDateStr, true, null, assignment);
                         // <<< Add Logging for Job State Update >>>
                         logger.debug("Updating job state (Scheduled)", {
                             jobId: update.jobId,
                             newStatus: 'scheduled',
                             planningDay: planningDateStr,
                             passNumber: 1,
                             assignment: assignment
                         });
                         // <<< End Logging >>>
                         state.attempts.push(attempt);
                         state.lastStatus = 'scheduled';
                         jobStates.set(update.jobId, state);
                         logger.debug(`   -> Job ${update.jobId} marked scheduled.`);
                     } else if (state) {
                         logger.warn(`Job ${update.jobId} scheduled by optimizer but was already ${state.lastStatus}. Ignoring optimizer result for this job.`);
                     } else {
                         logger.error(`CRITICAL: Job ${update.jobId} scheduled by optimizer but no state found!`);
                     }
                 });
                 
                 const unassignedItemIdsOptimizer = processedResultsToday.unassignedItemIds || [];
                 unassignedItemIdsOptimizer.forEach(itemId => {
                    const itemJobIds = mapItemsToJobIds([itemId], eligibleItemMapForPass);
                    itemJobIds.forEach(jobId => {
                        const state = jobStates.get(jobId);
                        if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
                             const attempt = createAttempt(planningDateStr, false, FailureReason.OPTIMIZER_OTHER);
                             const newStatus = 'failed_transient';
                             // <<< Add Logging for Job State Update >>>
                             logger.debug("Updating job state (Optimizer Unassigned)", {
                                 jobId: jobId,
                                 newStatus: newStatus,
                                 failureReason: FailureReason.OPTIMIZER_OTHER,
                                 planningDay: planningDateStr,
                                 passNumber: 1
                             });
                             // <<< End Logging >>>
                             state.attempts.push(attempt);
                             state.lastStatus = 'failed_transient';
                             jobStates.set(jobId, state);
                             logger.debug(`   -> Job ${jobId} (from ${itemId}) marked failed_transient (optimizer unassigned).`);
                        } else if (state && state.lastStatus === 'failed_transient') {
                            const attempt = createAttempt(planningDateStr, false, FailureReason.OPTIMIZER_OTHER);
                            state.attempts.push(attempt);
                            jobStates.set(jobId, state);
                            logger.debug(`   -> Job ${jobId} (from ${itemId}) recorded another transient failure (optimizer unassigned).`);
                        }
                    });
                 });

                 // --- BEGIN: Update fixed job states for this pass --- 
                 const fixedTimeJobsForThisPass = allFixedTimeJobsFromDB.filter(job => 
                    job.fixed_schedule_time && isDateOnDay(job.fixed_schedule_time, currentPlanningDate)
                 );
                 logger.info(`Step 1.7.1: Confirming schedule for ${fixedTimeJobsForThisPass.length} fixed time job(s) on ${planningDateStr}...`);

                 for (const fixedJob of fixedTimeJobsForThisPass) {
                    // Find the job's state (it might not be in jobStates if it wasn't 'queued' initially, but we process all relevant fixed jobs)
                    // Let's ensure we update the final assignment regardless of initial state if the pass succeeded.
                    const state = jobStates.get(fixedJob.id);

                    if (state && state.lastStatus === 'failed_persistent') {
                        logger.warn(`Fixed job ${fixedJob.id} was marked persistently failed earlier. It will not be scheduled.`);
                        continue; // Skip this one
                    }

                    if (fixedJob.assigned_technician !== null && fixedJob.fixed_schedule_time) {
                        const assignment: FinalAssignment = {
                            technicianId: fixedJob.assigned_technician,
                            estimatedSchedISO: fixedJob.fixed_schedule_time, // Use the fixed time!
                        };
                        finalAssignments.set(fixedJob.id, assignment);

                        // If the job was being tracked in jobStates, update its status
                        if (state) {
                            const attempt = createAttempt(planningDateStr, true, null, assignment);
                            state.attempts.push(attempt);
                            state.lastStatus = 'scheduled'; // Mark internally as scheduled
                            jobStates.set(fixedJob.id, state);
                            logger.debug(`Updating job state (Fixed Time Confirmed)`, {
                                jobId: fixedJob.id,
                                newStatus: state.lastStatus, // 'scheduled' internally
                                planningDay: planningDateStr,
                                passNumber: 1, // Always 1 for today pass
                                assignment: assignment
                            });
                        } else {
                            // If not in jobStates (e.g., started as en_route but fixed), still log confirmation
                            logger.debug(`Confirmed fixed time schedule for job ${fixedJob.id} (not in initial state map)`);
                        }
                    } else {
                        logger.warn(`Skipping update for fixed job ${fixedJob.id}: Missing fixed_schedule_time or assigned_technician.`);
                    }
                 }
                 // --- END: Update fixed job states for this pass ---

                 const currentScheduledCount = Array.from(jobStates.values()).filter(s => s.lastStatus === 'scheduled').length;
                 const currentPendingCount = Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending' || s.lastStatus === 'failed_transient').length;
                 logger.info(`Pass 1 State: ${currentScheduledCount} jobs scheduled, ${currentPendingCount} jobs remain pending/transiently failed.`);

            } else {
                // <<< Add Logging for Optimizer Skip >>>
                logger.info("Optimizer call skipped for today: No items in prepared payload.", {
                    reason: "no_prepared_items",
                    targetDate: planningDateStr,
                    passNumber: 1
                });
                // <<< End Logging >>>
                logger.info('No items could be prepared for optimization payload for today (all filtered?).');
            }
        } else {
            // --- Start: Handle skipped Pass 1 due to NO availability or NO jobs (FR-ORCH-SKIP-002, FR-ORCH-SKIP-003) ---
            if (!isAnyTechAvailableToday) {
                logger.warn("Skipping Pass 1 (Today): No technicians have availability windows for today.");
                // Use helper to update job states
                updateJobStatesForSkippedDay(
                    jobStates,
                    todayDateStr, // Use the date string calculated earlier
                    FailureReason.NO_TECHNICIAN_AVAILABILITY,
                    "Pass 1 (Today)"
                );
            } else {
                // This case means no jobs were pending/transient initially, but techs WERE available
                logger.info('Pass 1 skipped: No initial jobs were pending or transiently failed.');
            }
            // --- End: Handle skipped Pass 1 ---
        }
    } else {
        logger.info('No initial jobs to plan for today.');
    }
    const remainingJobsCountPass1 = Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending' || s.lastStatus === 'failed_transient').length;
    logger.info(`--- Pass 1 Complete. ${remainingJobsCountPass1} jobs remaining to plan. ---`);

    // ========================================\n    // == Pass 2+: Plan for Overflow        ==\n    // ========================================
    let loopCount = 0;
    let basePlanningDate = new Date();

    while (Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending' || s.lastStatus === 'failed_transient').length > 0 && loopCount < MAX_OVERFLOW_ATTEMPTS) {
        loopCount++;
        const currentPlanningDate = new Date(basePlanningDate);
        currentPlanningDate.setUTCDate(basePlanningDate.getUTCDate() + loopCount);
        const planningDateStr = formatDateToString(currentPlanningDate); // Use helper
        
        // <<< Add Logging for Overflow Pass Target Date >>>
        logger.info(`Starting overflow planning pass`, {
            passNumber: loopCount,
            targetDate: planningDateStr
        });
        // <<< End Logging >>>

        logger.info(`\n--- Overflow Pass ${loopCount}: Planning for ${planningDateStr} ---`);
        eligibleItemMapForPass.clear(); // Clear map for this pass

        logger.info(`Step ${loopCount}.1: Fetching technicians with home locations...`);
        const techsForLoop = await getActiveTechnicians(); // Re-fetch to ensure latest data?
        if (techsForLoop.length === 0) {
            logger.warn(`No active technicians found for ${planningDateStr}. Cannot plan overflow. Stopping loop.`);
            break;
        }

        // <<< Calculate availability for this specific date (FR-ORCH-SKIP-004) >>>
        // Before committing to planning for this specific overflow day, check if *any*
        // technician has *any* availability based on their default hours and exceptions.
        // Locked jobs are not considered here as they are only relevant for the current day (Pass 1).
        logger.info(`Step ${loopCount}.1.1: Performing availability pre-check for ${planningDateStr}...`);
        let isAnyTechAvailableThisDate = false;
        for (const tech of techsForLoop) {
            // Use the function to get windows for this specific day
            const baseWindowsMap: DailyAvailabilityWindows = calculateWindowsForTechnician(tech, currentPlanningDate, currentPlanningDate);
            
            // Apply locked jobs relevant for this future date (e.g., fixed jobs)
            // Note: PRD didn't strictly require this for overflow, but it's safer.
            const lockedJobsForTechThisDay = allFixedTimeJobsFromDB.filter(j => 
                j.assigned_technician === tech.id && 
                j.fixed_schedule_time && 
                isDateOnDay(j.fixed_schedule_time, currentPlanningDate)
            );

            const finalWindowsMapThisDay: DailyAvailabilityWindows = applyLockedJobsToWindows(
                baseWindowsMap,             // Pass the full map
                lockedJobsForTechThisDay,   // Pass only relevant fixed jobs for this day
                tech.id,                    // Pass tech ID
                currentPlanningDate         // Pass the target date
            );

            // Get the windows specifically for this date from the result map
            const finalWindowsArrayThisDay: TimeWindow[] = finalWindowsMapThisDay.get(planningDateStr) || [];

            // Check the length of the array for this date
            if (finalWindowsArrayThisDay.length > 0) {
                isAnyTechAvailableThisDate = true;
                logger.debug(`Technician ${tech.id} has calculated availability for ${planningDateStr}.`);
                break; // Found one, no need to check others for this specific check
            }
        }

        if (isAnyTechAvailableThisDate) {
            logger.info(`Availability pre-check passed for ${planningDateStr}.`);
        } else {
            logger.warn(`Availability pre-check failed for ${planningDateStr}: No technicians found with availability.`);
        }
        // <<< End availability check >>>

        // <<< Add check to skip if no techs have availability >>>
        // If the pre-check found no available technicians for this specific overflow date,
        // skip the rest of the processing for this day and update job states accordingly.
        if (!isAnyTechAvailableThisDate) { // Use the flag calculated above
            logger.info(`Skipping overflow pass ${loopCount} for ${planningDateStr}: No technicians have availability windows.`, {
                reason: "no_available_technicians_for_date",
                targetDate: planningDateStr,
                passNumber: loopCount
            });
            // --- Start: Update Job States for Skipped Overflow Pass (FR-ORCH-SKIP-006) ---
            // Use helper to update job states
            updateJobStatesForSkippedDay(
                jobStates,
                planningDateStr,
                FailureReason.NO_TECHNICIAN_AVAILABILITY,
                `Overflow Pass ${loopCount}`
            );
            // const jobIdsToUpdate = Array.from(jobStates.keys()); // Get all job IDs being tracked // Removed
            // jobIdsToUpdate.forEach(jobId => { // Removed
            //     const state = jobStates.get(jobId); // Removed
            //     if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) { // Removed
            //         // Add a failure attempt for this specific skipped date
            //         const attempt = createAttempt(planningDateStr, false, FailureReason.NO_TECHNICIAN_AVAILABILITY); // Removed
            //         state.attempts.push(attempt); // Removed
            //         state.lastStatus = 'failed_transient'; // Ensure it remains transient // Removed
            //         jobStates.set(jobId, state); // Removed
            //         
            //         logger.debug(`Updating job state (No Tech Availability - Overflow Skip)`, { // Removed
            //             jobId: jobId, // Removed
            //             newStatus: state.lastStatus, // Removed
            //             failureReason: FailureReason.NO_TECHNICIAN_AVAILABILITY, // Removed
            //             planningDay: planningDateStr, // Removed
            //             passNumber: loopCount // Removed
            //         }); // Removed
            //     } else if (!state) { // Removed
            //         // This case should ideally not happen if jobStates map is consistent
            //         logger.error(`Could not find state for job ID ${jobId} during no-tech-availability update for ${planningDateStr}.`); // Removed
            //     } // Removed
            //     // If state.lastStatus is already 'scheduled' or 'failed_persistent', do nothing.
            // }); // Removed
            // --- End: Update Job States --- 
            continue; // Skip to the next day
        }
        // <<< End check >>>
        
        const jobIdsToAttemptThisLoop = Array.from(jobStates.values())
            .filter(state => state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')
            .map(state => state.jobId);
        
        const jobsForLoopDetails = jobIdsToAttemptThisLoop
            .map(id => allFetchedJobsMap.get(id))
            .filter((job): job is Job => !!job);

        if (jobsForLoopDetails.length === 0 && jobIdsToAttemptThisLoop.length > 0) {
             logger.warn(`Job IDs exist in state map but details not found in allFetchedJobsMap for ${planningDateStr}. Ending loop.`);
             break;
        }
        
        const jobsForThisPassFiltered = jobsForLoopDetails.filter(job => {
            if (job.status === 'fixed_time' && job.fixed_schedule_time) {
                return !isDateBefore(job.fixed_schedule_time, currentPlanningDate);
            }
            return true;
        });
        const filteredFixedCount = jobsForLoopDetails.length - jobsForThisPassFiltered.length;
        if (filteredFixedCount > 0) {
            logger.info(`   -> Removed ${filteredFixedCount} past-due fixed time job(s) from consideration for ${planningDateStr}.`);
            jobsForThisPassFiltered.forEach(job => {
                const state = jobStates.get(job.id);
                if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
                }
            });
        }
        
        if (jobsForThisPassFiltered.length === 0) {
            logger.info(`No remaining jobs applicable for planning on ${planningDateStr}. Continuing loop.`);
            continue;
        }
        logger.info(`Attempting to plan ${jobsForThisPassFiltered.length} remaining applicable job(s) for ${planningDateStr}.`);

        logger.info(`Step ${loopCount}.2: Determining available technicians for ${planningDateStr}...`);
        const availableTechsThisDay = techsForLoop;

        // --- START: Fix for Fixed Jobs in Overflow (Task 1.1 / PRD) ---
        // Get the fixed jobs specifically for the current overflow day
        const fixedJobsForTargetOverflowDay = allFixedTimeJobsFromDB.filter(job => 
            job.fixed_schedule_time && isDateOnDay(job.fixed_schedule_time, currentPlanningDate)
        );

        // Combine the remaining queued/failed jobs with the fixed jobs for this day
        // Ensure deduplication: Use a Map to prioritize fixed job data if ID exists in both lists
        const combinedJobsMap = new Map<number, Job>();
        jobsForThisPassFiltered.forEach(job => combinedJobsMap.set(job.id, job));
        fixedJobsForTargetOverflowDay.forEach(job => combinedJobsMap.set(job.id, job)); // Fixed job data overwrites if duplicate ID
        
        const combinedJobsForOverflowPass = Array.from(combinedJobsMap.values());

        if (combinedJobsForOverflowPass.length === 0) {
            logger.info(`No remaining queued jobs or applicable fixed jobs for planning on ${planningDateStr}. Continuing loop.`);
            continue;
        }
        logger.info(`Attempting to plan ${combinedJobsForOverflowPass.length} combined applicable job(s) (queued/failed + fixed) for ${planningDateStr}.`);
        // --- END: Fix for Fixed Jobs in Overflow --- 

        // <<< Add logging to inspect combined list before bundling >>>
        logger.debug("Combined list BEFORE bundling:", JSON.stringify(combinedJobsForOverflowPass.map(j => ({id: j.id, status: j.status, fixed_schedule_time: j.fixed_schedule_time})), null, 2));
        // <<< End logging >>>

        logger.info(`Step ${loopCount}.3: Bundling remaining jobs for ${planningDateStr}...`);
        // Use the combined list for bundling
        const bundledItemsLoop: SchedulableItem[] = bundleQueuedJobs(combinedJobsForOverflowPass);

        logger.info(`Step ${loopCount}.4: Determining eligibility for ${planningDateStr}...`);
        const { eligibleItems: eligibleItemsLoopRaw, ineligibleItems: ineligibleItemsLoop }: EligibilityResult = 
            await determineTechnicianEligibility(bundledItemsLoop, availableTechsThisDay);

        // --- Start Refactoring: Handle Ineligible Fixed Jobs (Overflow) ---
        ineligibleItemsLoop.forEach(ineligible => {
            const itemIdString = 'jobs' in ineligible.item
                ? `bundle_${ineligible.item.order_id}`
                : `job_${ineligible.item.id}`;
            const itemJobIds = mapItemsToJobIds([itemIdString], new Map([[itemIdString, ineligible.item]]));

            itemJobIds.forEach(jobId => {
                const originalJob = allFetchedJobsMap.get(jobId); // Get original job details

                // Check if it's a fixed job that failed eligibility persistently
                if (originalJob && originalJob.status === 'fixed_time' && isPersistentFailure(ineligible.reason)) {
                     logger.warn(`Fixed job ${jobId} failed persistent eligibility check (${ineligible.reason}) in overflow pass ${loopCount}. Marking for pending_review.`);
                     // Directly mark for final DB update to pending_review
                     // Check if already added to avoid duplicates (optional but good practice)
                     if (!finalUpdates.some(update => update.jobId === jobId)) {
                         finalUpdates.push({
                             jobId: jobId,
                             data: {
                                 status: PENDING_REVIEW_STATUS,
                                 assigned_technician: null,
                                 estimated_sched: null,
                             }
                         });
                     }
                     // Remove from jobStates if it somehow got added (defensive)
                     jobStates.delete(jobId);
                } else {
                    // Original logic for non-fixed jobs or transient failures
                    const state = jobStates.get(jobId);
                    if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
                        const attempt = createAttempt(planningDateStr, false, ineligible.reason);
                        state.attempts.push(attempt);
                        if (isPersistentFailure(ineligible.reason)) {
                            state.lastStatus = 'failed_persistent';
                            logger.debug(`   -> Job ${jobId} marked failed_persistent due to ${ineligible.reason} in overflow pass.`);
                        } else {
                            state.lastStatus = 'failed_transient';
                        }
                        logger.debug("Updating job state (Ineligible - Overflow)", {
                            jobId: jobId,
                            newStatus: state.lastStatus,
                            failureReason: ineligible.reason,
                            planningDay: planningDateStr,
                            passNumber: loopCount
                        });
                        jobStates.set(jobId, state);
                    }
                     // If state doesn't exist or is already 'scheduled'/'failed_persistent', do nothing here
                     // (Fixed jobs failing eligibility are handled above)
                }
            });
        });
        // --- End Refactoring ---

        // Filter eligibleItemsLoopRaw based on whether their constituent jobs were marked 'failed_persistent' directly above
        const eligibleItemsLoop = eligibleItemsLoopRaw.filter(item => {
            const itemIdString = 'jobs' in item ? `bundle_${item.order_id}` : `job_${item.id}`;
            const itemJobIds = mapItemsToJobIds([itemIdString], new Map([[itemIdString, item]]));
            // Keep the item only if ALL its constituent jobs were NOT directly marked for pending_review in finalUpdates
            return Array.from(itemJobIds).every(jobId => 
                !finalUpdates.some(upd => upd.jobId === jobId && upd.data.status === PENDING_REVIEW_STATUS)
            );
        });
        
        // Update eligibleItemMapForPass with the *filtered* list
        eligibleItemsLoop.forEach(item => {
            if ('jobs' in item) {
                eligibleItemMapForPass.set(`bundle_${item.order_id}`, item);
            } else {
                eligibleItemMapForPass.set(`job_${item.id}`, item);
            }
        });
        const eligibleItemCountLoop = eligibleItemsLoop.length;
        logger.info(`   -> Found ${eligibleItemCountLoop} eligible item(s) for Overflow Pass ${loopCount}.`);
        
        if (eligibleItemCountLoop === 0) {
            // <<< Add Logging for Optimizer Skip >>>
            logger.info(`Optimizer call skipped for overflow pass ${loopCount}: No eligible items.`, {
                reason: "no_eligible_items",
                targetDate: planningDateStr,
                passNumber: loopCount
            });
            // <<< End Logging >>>
            logger.info(`No eligible items for ${planningDateStr} after bundling and eligibility (all filtered?). Continuing loop.`);
            continue;
        }

        logger.info(`Step ${loopCount}.5: Preparing optimization payload for ${planningDateStr}...`);
        const optimizationPayloadLoop = await prepareOptimizationPayload(
            availableTechsThisDay, 
            eligibleItemsLoop,
            [], 
            currentPlanningDate
        );

        if (optimizationPayloadLoop.items.length === 0) {
            // <<< Add Logging for Optimizer Skip >>>
            logger.info(`Optimizer call skipped for overflow pass ${loopCount}: No items in prepared payload.`, {
                reason: "no_prepared_items",
                targetDate: planningDateStr,
                passNumber: loopCount
            });
            // <<< End Logging >>>
            logger.info(`No items could be prepared for optimization for ${planningDateStr} (all filtered?). Continuing loop.`);
            continue;
        }

        logger.info(`Step ${loopCount}.6: Calling optimization microservice for ${planningDateStr}...`);
        const optimizationResponseLoop = await callOptimizationService(optimizationPayloadLoop);

        // <<< Add Logging for Raw Optimizer Response >>>
        logger.debug(`Received raw optimizer response (Overflow Pass ${loopCount})`, { 
            response: optimizationResponseLoop 
        });
        // <<< End Logging >>>

        logger.info(`Step ${loopCount}.7: Processing optimization results for ${planningDateStr}...`);
        const processedResultsLoop = processOptimizationResults(optimizationResponseLoop, eligibleItemMapForPass);

        logger.info(`Step ${loopCount}.8: Updating internal state...`);
        processedResultsLoop.scheduledJobs.forEach((update: ScheduledJobUpdate) => {
             const state = jobStates.get(update.jobId);
             if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
                 const assignment: FinalAssignment = {
                    technicianId: update.technicianId,
                    estimatedSchedISO: update.estimatedSchedISO,
                 };
                 finalAssignments.set(update.jobId, assignment);
                 const attempt = createAttempt(planningDateStr, true, null, assignment);
                 // <<< Add Logging for Job State Update >>>
                 logger.debug("Updating job state (Scheduled - Overflow)", {
                     jobId: update.jobId,
                     newStatus: 'scheduled',
                     planningDay: planningDateStr,
                     passNumber: loopCount,
                     assignment: assignment
                 });
                 // <<< End Logging >>>
                 state.attempts.push(attempt);
                 state.lastStatus = 'scheduled';
                 jobStates.set(update.jobId, state);
                 logger.debug(`   -> Job ${update.jobId} marked scheduled in overflow pass.`);
             } else if (state) {
                 logger.warn(`Job ${update.jobId} scheduled by optimizer in overflow but was already ${state.lastStatus}. Ignoring.`);
             } else {
                  logger.error(`CRITICAL: Job ${update.jobId} scheduled by overflow optimizer but no state found!`);
             }
        });

        const unassignedItemIdsOptimizerLoop = processedResultsLoop.unassignedItemIds || [];
        unassignedItemIdsOptimizerLoop.forEach(itemId => {
            const itemJobIds = mapItemsToJobIds([itemId], eligibleItemMapForPass);
            itemJobIds.forEach(jobId => {
                const state = jobStates.get(jobId);
                if (state && (state.lastStatus === 'pending' || state.lastStatus === 'failed_transient')) {
                     const attempt = createAttempt(planningDateStr, false, FailureReason.OPTIMIZER_OTHER);
                     const newStatus = 'failed_transient';
                     // <<< Add Logging for Job State Update >>>
                     logger.debug("Updating job state (Optimizer Unassigned - Overflow)", {
                         jobId: jobId,
                         newStatus: newStatus,
                         failureReason: FailureReason.OPTIMIZER_OTHER,
                         planningDay: planningDateStr,
                         passNumber: loopCount
                     });
                     // <<< End Logging >>>
                     state.attempts.push(attempt);
                     state.lastStatus = 'failed_transient';
                     jobStates.set(jobId, state);
                     logger.debug(`   -> Job ${jobId} (from ${itemId}) marked failed_transient (optimizer unassigned) in overflow pass.`);
                }
            });
        });
        
        // --- BEGIN: Update fixed job states for this overflow pass --- 
        const fixedTimeJobsForThisOverflowPass = allFixedTimeJobsFromDB.filter(job => 
            job.fixed_schedule_time && isDateOnDay(job.fixed_schedule_time, currentPlanningDate)
        );
        logger.info(`Step ${loopCount}.8.1: Confirming schedule for ${fixedTimeJobsForThisOverflowPass.length} fixed time job(s) on ${planningDateStr}...`);

        for (const fixedJob of fixedTimeJobsForThisOverflowPass) {
            const state = jobStates.get(fixedJob.id);

            if (state && state.lastStatus === 'failed_persistent') {
                logger.warn(`Fixed job ${fixedJob.id} was marked persistently failed earlier. It will not be scheduled.`);
                continue; // Skip this one
            }

            if (fixedJob.assigned_technician !== null && fixedJob.fixed_schedule_time) {
                const assignment: FinalAssignment = {
                    technicianId: fixedJob.assigned_technician,
                    estimatedSchedISO: fixedJob.fixed_schedule_time, // Use the fixed time!
                };
                finalAssignments.set(fixedJob.id, assignment);

                if (state) {
                    const attempt = createAttempt(planningDateStr, true, null, assignment);
                    state.attempts.push(attempt);
                    state.lastStatus = 'scheduled'; // Mark internally as scheduled
                    jobStates.set(fixedJob.id, state);
                    logger.debug(`Updating job state (Fixed Time Confirmed - Overflow)`, {
                        jobId: fixedJob.id,
                        newStatus: state.lastStatus, // 'scheduled' internally
                        planningDay: planningDateStr,
                        passNumber: loopCount,
                        assignment: assignment
                    });
                } else {
                     logger.debug(`Confirmed fixed time schedule for job ${fixedJob.id} (not in initial state map)`);
                }
            } else {
                logger.warn(`Skipping update for fixed job ${fixedJob.id}: Missing fixed_schedule_time or assigned_technician.`);
            }
        }
        // --- END: Update fixed job states for this overflow pass ---

        const remainingJobsCountLoop = Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending' || s.lastStatus === 'failed_transient').length;
        logger.info(`--- Overflow Pass ${loopCount} Complete. ${remainingJobsCountLoop} jobs remaining to plan. ---`);

    } // End while loop

    // ========================================\n    // == Final Database Update             ==\n    // ========================================
    logger.info('\n--- Final Database Update ---');
    
    logger.debug('DEBUG: Final Job States before DB Update:');
    jobStates.forEach((state, jobId) => {
        logger.debug(`  Job ${jobId}: Status = ${state.lastStatus}, Attempts = ${state.attempts.length}`);
    });
    logger.debug('DEBUG: Final Assignments before DB Update:');
    finalAssignments.forEach((assignment, jobId) => {
        logger.debug(`  Job ${jobId}: Tech = ${assignment.technicianId}, Time = ${assignment.estimatedSchedISO}`);
    });
    
    // --- Start Refactoring: Consolidate final updates using a Map ---
    // Use a Map to ensure only the latest intended update per job is kept
    const finalUpdateMap = new Map<number, JobUpdateOperation['data']>();

    // 1. Process jobs based on their final internal state tracked in jobStates
    jobStates.forEach((state, jobId) => {
        // processedJobIds.add(jobId); // No longer need processedJobIds set with Map approach
        const originalJob = allFetchedJobsMap.get(jobId);

        if (state.lastStatus === 'scheduled') {
            const assignment = finalAssignments.get(jobId);
            if (assignment && originalJob) {
                const finalDbStatus: JobStatus = originalJob.status === 'fixed_time'
                    ? 'fixed_time' // Keep original fixed_time status
                    : FINAL_SUCCESS_STATUS; // Otherwise use standard success status (e.g., 'queued')
                
                finalUpdateMap.set(jobId, {
                    status: finalDbStatus,
                    assigned_technician: assignment.technicianId,
                    estimated_sched: assignment.estimatedSchedISO,
                });
            } else {
                logger.error(`CRITICAL: Job ${jobId} has final internal status 'scheduled' but no assignment or original data found! Setting to pending_review.`);
                finalUpdateMap.set(jobId, { status: PENDING_REVIEW_STATUS, assigned_technician: null, estimated_sched: null });
            }
        } else if (state.lastStatus === 'failed_persistent' || state.lastStatus === 'failed_transient' || state.lastStatus === 'pending') {
            // Jobs that ended up unschedulable or were never eligible/processed via jobStates
            finalUpdateMap.set(jobId, {
                status: PENDING_REVIEW_STATUS,
                assigned_technician: null,
                estimated_sched: null,
            });
        }
        // No 'else' needed: jobs still locked (en_route, in_progress) aren't in jobStates map
    });

    // 2. Incorporate direct updates for ineligible fixed jobs (and others added directly)
    // This will overwrite any entry from jobStates if a fixed job was marked both ways,
    // ensuring the pending_review status takes precedence if it failed eligibility.
    finalUpdates.forEach(update => {
        finalUpdateMap.set(update.jobId, update.data);
    });


    // 3. Process any remaining fixed_time jobs confirmed via finalAssignments but not in jobStates
    allFixedTimeJobsFromDB.forEach(fixedJob => {
        // Only process if not already handled via jobStates or direct finalUpdates
        if (!finalUpdateMap.has(fixedJob.id)) {
            const assignment = finalAssignments.get(fixedJob.id);
            if (assignment && fixedJob.assigned_technician) {
                logger.info(`Applying confirmed schedule for fixed job ${fixedJob.id} (not in initial state map or failed eligibility).`);
                 finalUpdateMap.set(fixedJob.id, {
                    status: 'fixed_time', // Keep fixed status
                    assigned_technician: fixedJob.assigned_technician, // Keep original assignment
                    estimated_sched: assignment.estimatedSchedISO, // Update with the confirmed fixed time
                });
            } else {
                 // This fixed job's planning day might have failed, or it was invalid
                 // It shouldn't be updated to pending_review unless it was ALREADY pending_review
                 // If it started as fixed_time and its day failed, leave it as fixed_time with null sched?
                 logger.warn(`Fixed job ${fixedJob.id} (not in initial state map/failed eligibility) did not receive a final assignment confirmation. No DB update.`);
            }
        }
    });

    // 4. Convert Map back to array for the update function
    const finalUpdatesArray: JobUpdateOperation[] = Array.from(finalUpdateMap.entries()).map(([jobId, data]) => ({ jobId, data }));


    if (finalUpdatesArray.length > 0) {
        const scheduledCount = finalUpdatesArray.filter(u => u.data.status === FINAL_SUCCESS_STATUS || u.data.status === 'fixed_time').length;
        const pendingCount = finalUpdatesArray.filter(u => u.data.status === PENDING_REVIEW_STATUS).length;
        logger.info(`Applying final updates: ${scheduledCount} jobs to scheduled states ('${FINAL_SUCCESS_STATUS}'/'fixed_time'), ${pendingCount} jobs to '${PENDING_REVIEW_STATUS}'.`);
        // Ensure updateJobs function is compatible with the JobUpdateOperation array structure
        await updateJobs(dbClient, finalUpdatesArray); // Use the final combined array
    } else {
        logger.info('No final database updates required (no jobs processed or state changed).');
    }
    // --- End Refactoring ---

    // Call summary logger and capture the links
    collectedDirectionLinks = await logSchedulingSummary(allTechnicians, finalAssignments, jobStates, getEquipmentForVans, allFetchedJobsMap);

    logger.info('\n--- Full Replan Cycle Completed Successfully ---');

  } catch (error) {
    // Call summary logger in case of error, using the jobStates map
    await logSchedulingSummary(allTechnicians, finalAssignments, jobStates, getEquipmentForVans, allFetchedJobsMap);

    logger.error('\n--- Full Replan Cycle Failed ---');
    if (error instanceof Error) {
        logger.error(`Error Message: ${error.message}`);
        logger.error(`Error Stack: ${error.stack}`);
    } else {
        logger.error('An unexpected error occurred:', error);
    }
    throw error; // Re-throw
  }
}




