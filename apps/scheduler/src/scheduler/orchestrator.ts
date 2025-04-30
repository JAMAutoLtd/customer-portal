import { SupabaseClient } from '@supabase/supabase-js';
import { getActiveTechnicians } from '../supabase/technicians';
import { getRelevantJobs, getJobsByStatus } from '../supabase/jobs';
import { 
    Job, JobStatus, Technician, JobBundle, SchedulableItem, 
    TechnicianAvailability, Address, SchedulableJob, VanEquipment,
    FailureReason, isPersistentFailure, SchedulingAttempt, JobSchedulingState 
} from '../types/database.types';
import { calculateTechnicianAvailability, calculateAvailabilityForDay, formatDateToString } from './availability';
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
const MAX_OVERFLOW_ATTEMPTS = 4;

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

  try {
    // Log entry into the try block
    logger.info('>>> runFullReplan entered TRY block.');

    // ========================================\n    // == Initial Data Fetch & Setup         ==\n    // ========================================
    logger.info('Step 0: Fetching initial technicians and relevant jobs...');
    const [fetchedTechnicians, relevantJobsToday] = await Promise.all([
      getActiveTechnicians(),
      getRelevantJobs(),
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
    const allFixedTimeJobs = relevantJobsToday.filter(job => job.status === 'fixed_time' && job.fixed_schedule_time);
    logger.info(`Found ${allFixedTimeJobs.length} total fixed time jobs initially.`);

    const initialPendingCount = Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending').length;
    logger.info(`Initial state (after GPS check): ${initialPendingCount} jobs to plan, ${lockedJobsToday.length} locked.`);

    // ========================================\n    // == Pass 1: Plan for Today             ==\n    // ========================================
    if (Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending').length > 0) {
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
        
        ineligibleItemsToday.forEach(ineligible => {
            // --- Start: Fix Linter Error - Handle SchedulableItem union type ---
            const itemIdString = 'jobs' in ineligible.item 
                ? `bundle_${ineligible.item.order_id}` 
                : `job_${ineligible.item.id}`;
            const itemJobIds = mapItemsToJobIds([itemIdString], new Map([[itemIdString, ineligible.item]]));
            // --- End: Fix Linter Error ---
            itemJobIds.forEach(jobId => {
                const state = jobStates.get(jobId);
                if (state && state.lastStatus === 'pending') {
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
            });
        });
        
        eligibleItemsTodayRaw.forEach(item => {
            if ('jobs' in item) {
                eligibleItemMapForPass.set(`bundle_${item.order_id}`, item);
            } else {
                eligibleItemMapForPass.set(`job_${item.id}`, item);
            }
        });
        const eligibleItemCountPass1 = eligibleItemsTodayRaw.length;
        logger.info(`   -> Found ${eligibleItemCountPass1} eligible item(s) for Pass 1.`);

        if (eligibleItemCountPass1 > 0) {
            logger.info('Step 1.4: Preparing optimization payload for today...');
            const targetDateToday = new Date(); 
            const fixedTimeJobsForThisPass = allFixedTimeJobs.filter(job => isDateOnDay(job.fixed_schedule_time, targetDateToday));
            logger.info(`   -> Including ${fixedTimeJobsForThisPass.length} fixed time constraints for today.`);

            const optimizationPayloadToday = await prepareOptimizationPayload(
                allTechnicians, 
                eligibleItemsTodayRaw,
                fixedTimeJobsForThisPass,
                lockedJobsToday, 
                targetDateToday 
            );

            if (optimizationPayloadToday.items.length > 0) {
                 logger.info('Step 1.5: Calling optimization microservice for today...');
                 const optimizationResponseToday = await callOptimizationService(optimizationPayloadToday);

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

                 const currentScheduledCount = Array.from(jobStates.values()).filter(s => s.lastStatus === 'scheduled').length;
                 const currentPendingCount = Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending' || s.lastStatus === 'failed_transient').length;
                 logger.info(`Pass 1 State: ${currentScheduledCount} jobs scheduled, ${currentPendingCount} jobs remain pending/transiently failed.`);

            } else {
                logger.info('No items could be prepared for optimization payload for today (all filtered?).');
            }
        } else {
            logger.info('No initial jobs to plan for today.');
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
        logger.info(`\n--- Overflow Pass ${loopCount}: Planning for ${planningDateStr} ---`);
        eligibleItemMapForPass.clear(); // Clear map for this pass

        logger.info(`Step ${loopCount}.1: Fetching technicians with home locations...`);
        const techsForLoop = await getActiveTechnicians();
        if (techsForLoop.length === 0) {
            logger.warn(`No active technicians found for ${planningDateStr}. Cannot plan overflow. Stopping loop.`);
            break;
        }
        
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

        logger.info(`Step ${loopCount}.3: Bundling remaining jobs for ${planningDateStr}...`);
        const bundledItemsLoop: SchedulableItem[] = bundleQueuedJobs(jobsForThisPassFiltered);

        logger.info(`Step ${loopCount}.4: Determining eligibility for ${planningDateStr}...`);
        const { eligibleItems: eligibleItemsLoopRaw, ineligibleItems: ineligibleItemsLoop }: EligibilityResult = 
            await determineTechnicianEligibility(bundledItemsLoop, availableTechsThisDay);

        ineligibleItemsLoop.forEach(ineligible => {
            // --- Start: Fix Linter Error - Handle SchedulableItem union type ---
            const itemIdString = 'jobs' in ineligible.item 
                ? `bundle_${ineligible.item.order_id}` 
                : `job_${ineligible.item.id}`;
            const itemJobIds = mapItemsToJobIds([itemIdString], new Map([[itemIdString, ineligible.item]]));
            // --- End: Fix Linter Error ---
            itemJobIds.forEach(jobId => {
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
                    jobStates.set(jobId, state);
                }
            });
        });

        eligibleItemsLoopRaw.forEach(item => {
             if ('jobs' in item) {
                eligibleItemMapForPass.set(`bundle_${item.order_id}`, item);
            } else {
                eligibleItemMapForPass.set(`job_${item.id}`, item);
            }
        });
        const eligibleItemCountLoop = eligibleItemsLoopRaw.length;
        logger.info(`   -> Found ${eligibleItemCountLoop} eligible item(s) for Overflow Pass ${loopCount}.`);
        
        if (eligibleItemCountLoop === 0) {
            logger.info(`No eligible items for ${planningDateStr} after bundling and eligibility (all filtered?). Continuing loop.`);
            continue;
        }

        logger.info(`Step ${loopCount}.5: Preparing optimization payload for ${planningDateStr}...`);
        const fixedTimeJobsForThisPass = allFixedTimeJobs.filter(job => isDateOnDay(job.fixed_schedule_time, currentPlanningDate));
        logger.info(`   -> Including ${fixedTimeJobsForThisPass.length} fixed time constraints for ${planningDateStr}.`);

        const optimizationPayloadLoop = await prepareOptimizationPayload(
            availableTechsThisDay, 
            eligibleItemsLoopRaw,
            fixedTimeJobsForThisPass,
            [], 
            currentPlanningDate
        );

        if (optimizationPayloadLoop.items.length === 0) {
            logger.info(`No items could be prepared for optimization for ${planningDateStr} (all filtered?). Continuing loop.`);
            continue;
        }

        logger.info(`Step ${loopCount}.6: Calling optimization microservice for ${planningDateStr}...`);
        const optimizationResponseLoop = await callOptimizationService(optimizationPayloadLoop);

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
                     state.attempts.push(attempt);
                     state.lastStatus = 'failed_transient';
                     jobStates.set(jobId, state);
                     logger.debug(`   -> Job ${jobId} (from ${itemId}) marked failed_transient (optimizer unassigned) in overflow pass.`);
                }
            });
        });
        
        const remainingJobsCountLoop = Array.from(jobStates.values()).filter(s => s.lastStatus === 'pending' || s.lastStatus === 'failed_transient').length;
        logger.info(`--- Overflow Pass ${loopCount} Complete. ${remainingJobsCountLoop} jobs remaining to plan. ---`);

    } // End while loop

    // ========================================\n    // == Final Database Update             ==\n    // ========================================
    logger.info('\n--- Final Database Update ---');
    
    logger.debug('DEBUG: Final Job States before DB Update:');
    jobStates.forEach((state, jobId) => {
        logger.debug(`  Job ${jobId}: Status = ${state.lastStatus}, Attempts = ${state.attempts.length}`);
    });
    
    const finalUpdates: JobUpdateOperation[] = [];

    jobStates.forEach((state, jobId) => {
        if (state.lastStatus === 'scheduled') {
            const assignment = finalAssignments.get(jobId);
            if (assignment) {
                finalUpdates.push({
                    jobId: jobId,
                    data: {
                        status: FINAL_SUCCESS_STATUS, // 'queued'
                        assigned_technician: assignment.technicianId,
                        estimated_sched: assignment.estimatedSchedISO,
                    }
                });
            } else {
                 logger.error(`CRITICAL: Job ${jobId} has final status 'scheduled' but no assignment found in finalAssignments map! Setting to pending_review.`);
                 finalUpdates.push({ jobId: jobId, data: { status: PENDING_REVIEW_STATUS, assigned_technician: null, estimated_sched: null } });
            }
        } else if (state.lastStatus === 'failed_persistent' || state.lastStatus === 'failed_transient' || state.lastStatus === 'pending') {
             finalUpdates.push({
                jobId: jobId,
                data: {
                    status: PENDING_REVIEW_STATUS,
                    assigned_technician: null,
                    estimated_sched: null,
                }
            });
        } 
    });

    if (finalUpdates.length > 0) {
        const scheduledCount = finalUpdates.filter(u => u.data.status === FINAL_SUCCESS_STATUS).length;
        const pendingCount = finalUpdates.filter(u => u.data.status === PENDING_REVIEW_STATUS).length;
        logger.info(`Applying final updates: ${scheduledCount} jobs to '${FINAL_SUCCESS_STATUS}', ${pendingCount} jobs to '${PENDING_REVIEW_STATUS}'.`);
        await updateJobs(dbClient, finalUpdates);
    } else {
        logger.info('No final database updates required (no jobs processed or state changed).');
    }

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