import {
    OptimizationResponsePayload,
    TechnicianRoute,
    RouteStop
} from '../types/optimization.types';
import { SchedulableItem, Job, SchedulableJob } from '../types/database.types';

// Define the ETA window in minutes (e.g., +/- 30 minutes for a 1-hour window)
// const ETA_WINDOW_MINUTES = 30; // Removed

/**
 * Represents the processed results of an optimization run,
 * ready for database updates.
 */
export interface ProcessedSchedule {
    scheduledJobs: ScheduledJobUpdate[];
    unassignedItemIds: string[]; // IDs of OptimizationItems (job_XXX or bundle_YYY)
}

/**
 * Information needed to update a single scheduled job in the database.
 */
export interface ScheduledJobUpdate {
    jobId: number; // The original database job ID
    technicianId: number;
    estimatedSchedISO: string; // Calculated service start time
    // estimatedSchedEndISO: string; // Calculated service end time // Removed
    // customerEtaStartISO: string; // Calculated ETA window start // Removed
    // customerEtaEndISO: string; // Calculated ETA window end // Removed
}

/**
 * Processes the raw response from the optimization service into structured
 * data for updating the database.
 *
 * @param {OptimizationResponsePayload} response - The payload received from the optimization service.
 * @param {Map<string, SchedulableItem>} eligibleItemMap - A map linking item IDs (job_X, bundle_Y) sent to the optimizer to their original SchedulableItem data (needed to resolve bundle jobs).
 * @returns {ProcessedSchedule} - Structured results including jobs to update and unassigned items.
 * @throws {Error} If the response status is 'error'.
 */
export function processOptimizationResults(
    response: OptimizationResponsePayload,
    eligibleItemMap: Map<string, SchedulableItem>
): ProcessedSchedule {
    console.log('Processing optimization results...');

    if (response.status === 'error') {
        console.error('Cannot process results: Optimization service returned an error.', response.message);
        throw new Error(`Optimization failed: ${response.message || 'Unknown error'}`);
    }

    const scheduledJobs: ScheduledJobUpdate[] = [];

    response.routes.forEach((route: TechnicianRoute) => {
        console.log(`DEBUG: Processing route for Tech ID: ${route?.technicianId}`);
        route.stops.forEach((stop: RouteStop) => {
            console.log(`DEBUG:   Processing stop: ${JSON.stringify(stop)}`);
            
            const scheduledItem = eligibleItemMap.get(stop.itemId);
            if (!scheduledItem) {
                console.warn(`Could not find original item details for scheduled stop ID: ${stop.itemId}`);
                return;
            }

            if (stop.itemId.startsWith('job_')) {
                console.log(`DEBUG:     Found job item: ${stop.itemId}`);
                const jobId = (scheduledItem as SchedulableJob).id;
                
                try {
                    const scheduledStartTime = new Date(stop.startTimeISO);
                    scheduledJobs.push({
                        jobId: jobId,
                        technicianId: route.technicianId,
                        estimatedSchedISO: scheduledStartTime.toISOString(),
                    });
                } catch (e) {
                    console.warn(`Error processing date for job ID ${jobId} from stop ${stop.itemId}:`, e);
                }
            } else if (stop.itemId.startsWith('bundle_') && 'jobs' in scheduledItem) {
                console.log(`DEBUG:     Found bundle item: ${stop.itemId}`);
                const constituentJobs = scheduledItem.jobs;
                try {
                    const scheduledStartTime = new Date(stop.startTimeISO);
                    constituentJobs.forEach((job: Job) => {
                        scheduledJobs.push({
                            jobId: job.id,
                            technicianId: route.technicianId,
                            estimatedSchedISO: scheduledStartTime.toISOString(),
                        });
                        console.log(`DEBUG:       Added job ${job.id} from bundle ${stop.itemId}`);
                    });
                } catch (e) {
                    console.warn(`Error processing date for bundle ${stop.itemId}:`, e);
                }
            } else {
                console.warn(`Scheduled stop ID ${stop.itemId} did not match expected job or bundle structure.`);
            }
        });
    });

    console.log(`Processed ${scheduledJobs.length} scheduled jobs from ${response.routes.length} routes.`);
    if (response.unassignedItemIds && response.unassignedItemIds.length > 0) {
        console.log(`Identified ${response.unassignedItemIds.length} unassigned items.`);
    }

    return {
        scheduledJobs: scheduledJobs,
        unassignedItemIds: response.unassignedItemIds || [],
    };
} 