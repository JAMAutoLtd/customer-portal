import { 
    Technician, 
    Job, 
    SchedulableItem, 
    Address,
    JobBundle,
    SchedulableJob,
    TechnicianDefaultHours,
    TechnicianAvailabilityException
} from '../types/database.types';
import {
    OptimizationLocation,
    OptimizationTechnician,
    OptimizationItem,
    OptimizationFixedConstraint,
    TravelTimeMatrix,
    OptimizationRequestPayload
} from '../types/optimization.types';
import { getTravelTime, getBulkTravelTimes, TravelTimePair, BulkTravelTimeResultMap } from '../google/maps';
import { LatLngLiteral } from '@googlemaps/google-maps-services-js';
import { WORK_END_HOUR_UTC, WORK_END_MINUTE_UTC, calculateWindowsForTechnician, applyLockedJobsToWindows, TimeWindow, DailyAvailabilityWindows, formatDateToString, parseTimeStringToUTCDate } from './availability'; // Import constants AND NEW TYPES/FUNCS & HELPERS
import { startOfDay } from 'date-fns'; // Import date-fns helper
import { logger } from '../utils/logger'; // Import logger

const DEFAULT_DEPOT_LOCATION: LatLngLiteral = { lat: 51.0447, lng: -114.0719 }; // Updated to Calgary Downtown (matches Tech 1 Home for consistency)
// Assuming Calgary Timezone (MDT/MST - UTC-6/UTC-7). For 9 AM local, let's aim for mid-morning UTC.
// 9 AM MDT (UTC-6) = 15:00 UTC
// 9 AM MST (UTC-7) = 16:00 UTC
// Let's use 15:00 UTC as a representative departure time for future days.
const FUTURE_DEPARTURE_HOUR_UTC = 15;

// --- New Helper for Gap Identification ---
/**
 * Identifies time gaps within a technician's workday based on their availability windows.
 *
 * @param availabilityWindows Sorted array of available TimeWindow for the day.
 * @param workDayStart The technician's overall earliest start time for the day (start of first window).
 * @param workDayEnd The technician's overall latest end time for the day (end of last window).
 * @returns An array of TimeWindow objects representing the unavailable gaps.
 */
function findAvailabilityGaps(availabilityWindows: TimeWindow[], workDayStart: Date, workDayEnd: Date): TimeWindow[] {
    const gaps: TimeWindow[] = [];
    let lastEndTime = workDayStart.getTime();

    availabilityWindows.forEach(window => {
        const currentStartTime = window.start.getTime();
        // If there's a gap between the last window's end and the current window's start
        if (currentStartTime > lastEndTime) {
            gaps.push({ start: new Date(lastEndTime), end: new Date(currentStartTime) });
        }
        lastEndTime = Math.max(lastEndTime, window.end.getTime()); // Move to the end of the current window
    });

    // Check for a gap after the last window until the workday end
    if (workDayEnd.getTime() > lastEndTime) {
        gaps.push({ start: new Date(lastEndTime), end: workDayEnd });
    }

    // We don't need to check for a gap before the first window, 
    // as workDayStart is defined as the start of the first window.
    
    // Filter out minuscule gaps that might occur due to float precision (e.g., < 1 second)
    return gaps.filter(gap => gap.end.getTime() - gap.start.getTime() > 1000); 
}
// --- End New Helper ---

/**
 * Creates a unique identifier for a SchedulableItem.
 * Prefixes with 'job_' or 'bundle_' based on the type.
 */
function getItemId(item: SchedulableItem): string {
    // Check if it has the 'jobs' property, which is unique to JobBundle
    if ('jobs' in item) {
        // It's a JobBundle
        return `bundle_${item.order_id}`;
    } else {
        // It's a SchedulableJob (which extends Job)
        return `job_${item.id}`;
    }
}

/**
 * Prepares the complete payload required by the optimization microservice.
 *
 * @param {Technician[]} technicians - Array of available technicians (with defaultHours/exceptions).
 * @param {SchedulableItem[]} items - Array of schedulable jobs/bundles (with eligibility calculated).
 * @param {Job[]} fixedTimeJobs - Array of jobs that have a fixed schedule time.
 * @param {Job[]} lockedJobs - Array of jobs locked for today (en_route, in_progress).
 * @param {Date} targetDate - The specific date for which the payload is being generated.
 * @returns {Promise<OptimizationRequestPayload>} The payload object.
 */
export async function prepareOptimizationPayload(
    technicians: Technician[],
    items: SchedulableItem[],
    fixedTimeJobs: Job[],
    lockedJobs: Job[],
    targetDate: Date
): Promise<OptimizationRequestPayload> {
    const isForToday = formatDateToString(targetDate) === formatDateToString(new Date());
    logger.info(`Preparing optimization payload for date: ${formatDateToString(targetDate)} ${isForToday ? '(Using today logic)' : '(Using future logic)'}`);
    
    // --- Calculate Future Departure Time if needed ---
    let futureDepartureTime: Date | undefined = undefined;
    if (!isForToday) {
        // Set departure time to FUTURE_DEPARTURE_HOUR_UTC on the target date
        futureDepartureTime = startOfDay(targetDate); // Get start of the target date (UTC 00:00)
        // Add check to ensure futureDepartureTime is defined before calling methods
        if (futureDepartureTime) {
            futureDepartureTime.setUTCHours(FUTURE_DEPARTURE_HOUR_UTC, 0, 0, 0); // Set to desired UTC hour
            logger.debug(`Calculated future departure time for predictive traffic: ${futureDepartureTime.toISOString()}`);
        } else {
            // This case should ideally not happen if startOfDay works correctly
            logger.error("Failed to initialize futureDepartureTime from targetDate.");
        }
    }
    // --- End Future Departure Time Calculation ---

    // --- Calculate Detailed Availability --- 
    const allTechnicianAvailability: Map<number, DailyAvailabilityWindows> = new Map();
    technicians.forEach(tech => {
        // Calculate base windows from defaults/exceptions for the target date
        const baseWindows = calculateWindowsForTechnician(tech, targetDate, targetDate); 
        // Apply today's locked jobs if planning for today
        const finalWindows = isForToday 
            ? applyLockedJobsToWindows(baseWindows, lockedJobs, tech.id, targetDate) 
            : baseWindows;
        allTechnicianAvailability.set(tech.id, finalWindows);
    });
    logger.debug('Calculated detailed availability windows for technicians.');
    // --- End Availability Calculation ---

    const locationsMap = new Map<string, OptimizationLocation>();
    let currentIndex = 0;
    const itemCoordsSet = new Set<string>();

    // Function to add/get location and assign index
    const addOrGetLocation = (id: string | number, coords: LatLngLiteral): OptimizationLocation => {
        const key = `${coords.lat},${coords.lng}`;
        if (!locationsMap.has(key)) {
            locationsMap.set(key, { id: id, index: currentIndex++, coords: coords });
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return locationsMap.get(key)!;
    };

    // 1. Define Locations (Depot, Items, THEN Tech Starts)
    // --- Stage 1: Depot (Index 0) ---
    const depotLocation = addOrGetLocation('depot', DEFAULT_DEPOT_LOCATION);

    // --- Stage 2: Item Locations ---
    logger.debug("Processing item locations...");
    items.forEach(item => {
        if (!item.address?.lat || !item.address?.lng) {
            logger.error(`Item ${getItemId(item)} is missing address coordinates. Skipping.`);
            return; 
        }
        const itemCoords: LatLngLiteral = { lat: item.address.lat, lng: item.address.lng };
        const key = `${itemCoords.lat},${itemCoords.lng}`;
        itemCoordsSet.add(key); // Store item coordinates
        addOrGetLocation(getItemId(item), itemCoords);
    });
    logger.debug(`Processed ${itemCoordsSet.size} unique item locations.`);

    // --- Stage 3: Technician Start Locations (Check for clashes) ---
    logger.debug("Processing technician start locations...");
    // Create a map for easy lookup if technicianAvailability is provided
    // const availabilityMap = new Map<number, TechnicianAvailability>();

    technicians.forEach(tech => {
        // const techAvail = availabilityMap.get(tech.id);
        // Use home location from availability if provided, otherwise use current location/depot
        let startCoords = tech.home_location || DEFAULT_DEPOT_LOCATION;
        if (isForToday && tech.current_location) {
             startCoords = tech.current_location;
        }
        const originalKey = `${startCoords.lat},${startCoords.lng}`;

        // Check if the exact coordinates are already used by an item
        if (itemCoordsSet.has(originalKey)) {
            // Perturb coordinates slightly to create a distinct location
            const perturbation = 0.00001; // Small offset
            const perturbedCoords = { lat: startCoords.lat + perturbation, lng: startCoords.lng };
            logger.warn(`Technician ${tech.id} start location clashes with an item location at (${startCoords.lat}, ${startCoords.lng}). Perturbing to (${perturbedCoords.lat}, ${perturbedCoords.lng}).`);
            startCoords = perturbedCoords; // Use perturbed coords for this tech's start
            // Note: We don't add the perturbed key back to itemCoordsSet
        }
        
        // Add the (potentially perturbed) start location
        addOrGetLocation(`tech_start_${tech.id}`, startCoords);
    });

    // --- Finalize Locations List ---
    const finalLocations = Array.from(locationsMap.values()).sort((a, b) => a.index - b.index);
    logger.info(`Defined ${finalLocations.length} unique locations for optimization (including depots/starts).`);

    // 2. Calculate Travel Time Matrix (using final coordinates)
    logger.debug('Collecting unique travel time pairs...');
    // --- Start: Collect Origin-Destination Pairs --- 
    const travelPairs: { origin: LatLngLiteral; destination: LatLngLiteral }[] = [];
    const pairKeys = new Set<string>();

    for (let i = 0; i < finalLocations.length; i++) {
        for (let j = 0; j < finalLocations.length; j++) {
            if (i === j) continue; // Skip self-to-self
            
            const originLoc = finalLocations[i];
            const destLoc = finalLocations[j];
            const key = `${originLoc.coords.lat},${originLoc.coords.lng}:${destLoc.coords.lat},${destLoc.coords.lng}`;
            
            if (!pairKeys.has(key)) {
                travelPairs.push({ origin: originLoc.coords, destination: destLoc.coords });
                pairKeys.add(key);
            }
        }
    }
    logger.debug(`Collected ${travelPairs.length} unique origin-destination pairs.`);
    // --- End: Collect Origin-Destination Pairs ---

    // --- Start: Placeholder for bulk fetch and matrix population ---
    // TODO: Implement bulk fetching and caching in maps.ts (Task 5.2, 5.3)
    // const travelTimeResults = await getBulkTravelTimes(travelPairs, isForToday);
    // console.warn('TODO: Implement bulk travel time fetching. Using individual calls for now...');
    
    // --- Start: Call Bulk Travel Time Function --- 
    logger.info(`Requesting bulk travel times for ${travelPairs.length} pairs (isForToday: ${isForToday}, departureTime: ${futureDepartureTime?.toISOString() || 'N/A'})...`);
    // Pass futureDepartureTime if calculated, otherwise rely on isForToday for real-time vs standard
    const travelTimeResults: BulkTravelTimeResultMap = await getBulkTravelTimes(travelPairs, isForToday, futureDepartureTime);
    logger.info(`Received ${travelTimeResults.size} results from bulk travel time fetch.`);
    // --- End: Call Bulk Travel Time Function ---

    const travelTimeMatrix: TravelTimeMatrix = {};
    for (let i = 0; i < finalLocations.length; i++) {
        travelTimeMatrix[i] = {};
        for (let j = 0; j < finalLocations.length; j++) {
            if (i === j) {
                travelTimeMatrix[i][j] = 0; 
                continue;
            }
            const originLoc = finalLocations[i];
            const destLoc = finalLocations[j];
            
            // --- TEMPORARY: Still using individual getTravelTime until bulk is ready --- 
            // const duration = await getTravelTime(originLoc.coords, destLoc.coords, isForToday);
            // --- END TEMPORARY ---

            // --- Start: Use Bulk Results Map --- 
            // Use the standard key format (without :realtime suffix) for lookup
            const key = `${originLoc.coords.lat},${originLoc.coords.lng}:${destLoc.coords.lat},${destLoc.coords.lng}`;
            const duration = travelTimeResults.get(key);
            // --- End: Use Bulk Results Map --- 

            if (duration === null || duration === undefined) { // Check for undefined when using map
                logger.error(`Failed to get travel time from ${originLoc.id} (${originLoc.index}) to ${destLoc.id} (${destLoc.index}). Using high penalty.`);
                travelTimeMatrix[i][j] = 999999; 
            } else {
                travelTimeMatrix[i][j] = duration;
            }
        }
    }
    // --- End: Placeholder for bulk fetch and matrix population ---

    // 3. Format Technicians (use final coordinates for startLocationIndex)
    const tempBreakItems: OptimizationItem[] = [];
    const tempBreakConstraints: OptimizationFixedConstraint[] = [];

    const optimizationTechnicians: OptimizationTechnician[] = technicians.map(tech => {
        // const techAvail = availabilityMap.get(tech.id); // Get availability details if present

        // Determine start coordinates (potentially perturbed)
        let startCoords = tech.home_location || DEFAULT_DEPOT_LOCATION;
        if (isForToday && tech.current_location) {
             startCoords = tech.current_location;
        }
        const originalKey = `${startCoords.lat},${startCoords.lng}`;
        if (itemCoordsSet.has(originalKey)) {
             const perturbation = 0.00001;
             startCoords = { lat: startCoords.lat + perturbation, lng: startCoords.lng };
        }
        
        // Find the location object added in Stage 3 using the potentially perturbed coords
        const startLocation = addOrGetLocation(`tech_start_${tech.id}`, startCoords); // This will retrieve the existing entry
        
        // Define start and end times: Use calculated windows for the target date
        let earliestStartTimeISO: string;
        let latestEndTimeISO: string;

        const techWindows = allTechnicianAvailability.get(tech.id)?.get(formatDateToString(targetDate)) || [];

        if (techWindows.length > 0) {
            // Use the start of the first window and end of the last window as bounds
            const workDayStart = techWindows[0].start;
            const workDayEnd = techWindows[techWindows.length - 1].end;
            earliestStartTimeISO = workDayStart.toISOString();
            latestEndTimeISO = workDayEnd.toISOString();

            // --- Find Gaps and Create Breaks ---
            const gaps = findAvailabilityGaps(techWindows, workDayStart, workDayEnd);
            gaps.forEach((gap, index) => {
                const breakId = `break_${tech.id}_${formatDateToString(targetDate)}_${index}`;
                const durationSeconds = Math.round((gap.end.getTime() - gap.start.getTime()) / 1000);
                
                // Only create breaks longer than a minute
                if (durationSeconds > 60) { 
                    logger.debug(`Technician ${tech.id}: Creating break ${breakId} for gap: ${gap.start.toISOString()} - ${gap.end.toISOString()} (${durationSeconds}s)`);
                    // Create break item (location doesn't matter much, use start location)
                    tempBreakItems.push({
                        id: breakId,
                        locationIndex: startLocation.index, // Assign to tech's start/depot
                        durationSeconds: durationSeconds,
                        priority: 10, // Low priority, but maybe configurable?
                        eligibleTechnicianIds: [tech.id], // Only this tech
                    });
                    // Create fixed constraint for the break
                    tempBreakConstraints.push({
                        itemId: breakId,
                        fixedTimeISO: gap.start.toISOString(), // Fix break to the start of the gap
                    });
                }
            });
             // --- End Gap Finding ---

        } else {
            // Technician has NO availability on this date according to windows
            // Set start/end times such that they likely won't be assigned anything
            // (e.g., start = end = midday)
            logger.warn(`Technician ${tech.id} has no availability windows for ${formatDateToString(targetDate)}. Setting narrow time window.`);
            const midDay = new Date(targetDate);
            midDay.setUTCHours(12, 0, 0, 0);
            earliestStartTimeISO = midDay.toISOString();
            latestEndTimeISO = midDay.toISOString(); 
        }
        
        return {
            id: tech.id,
            startLocationIndex: startLocation.index,
            endLocationIndex: depotLocation.index, // Assume all techs return to depot
            earliestStartTimeISO: earliestStartTimeISO, // Use determined start time
            latestEndTimeISO: latestEndTimeISO,       // Use determined end time
        };
    });

    // 4. Format Items
    let optimizationItems: OptimizationItem[] = items
        .map(item => {
            // Get the location object previously created
            const itemLocation = addOrGetLocation(getItemId(item), {
                // These checks are needed because we might have skipped items without coords earlier
                lat: item.address?.lat || 0, 
                lng: item.address?.lng || 0
            });
             // Check if the location was actually found/created (it should have been unless coords were missing)
             if (!finalLocations.find(l => l.index === itemLocation.index)) {
                logger.warn(`Skipping item ${getItemId(item)} because its location could not be indexed (likely missing coordinates).`);
                return null; 
            }

            const isBundle = 'jobs' in item;
            // For duration, use job_duration for SchedulableJob (extends Job) or total_duration for JobBundle
            const duration = isBundle ? (item as JobBundle).total_duration : (item as SchedulableJob).job_duration;
            
            // Extract earliest available time from the job's order data
            let earliestItemStartTimeISO: string | undefined = undefined;
            if ('jobs' in item) {
                // It's a JobBundle, take the *latest* earliest_available_time among its constituent jobs
                const bundle = item as JobBundle;
                let latestEarliestTime = 0;
                bundle.jobs.forEach(job => {
                    const jobEarliestTimeStr = job.order_details?.earliest_available_time;
                    if (jobEarliestTimeStr) {
                        const jobEarliestTime = new Date(jobEarliestTimeStr).getTime();
                        if (jobEarliestTime > latestEarliestTime) {
                            latestEarliestTime = jobEarliestTime;
                        }
                    }
                });
                if (latestEarliestTime > 0) {
                    earliestItemStartTimeISO = new Date(latestEarliestTime).toISOString();
                }
            } else {
                // It's a SchedulableJob, which extends Job directly
                const schedJob = item as SchedulableJob;
                earliestItemStartTimeISO = schedJob.order_details?.earliest_available_time || undefined;
            }

            // --- Priority Adjustment (Temporarily Disabled) ---
            // const getOrderCreatedAt = (schedulableItem: SchedulableItem): string | undefined => {
            //   // Check if it's a JobBundle (check for the 'jobs' property)
            //   if ('jobs' in schedulableItem) {
            //     // It's a JobBundle
            //     const bundle = schedulableItem as JobBundle; // Cast
            //     if (bundle.jobs.length > 0) {
            //       const firstJob = bundle.jobs[0]; // This should be SchedulableJob
            //       // Use the renamed property
            //       if (firstJob.order_details?.created_at) {
            //         return firstJob.order_details.created_at;
            //       }
            //     }
            //   }
            //   // Check if it's a Job (check for the 'order_id' property, which bundles don't have)
            //   else if ('order_id' in schedulableItem) {
            //      // It's a Job - Cast it explicitly after the check
            //      const jobItem = schedulableItem as SchedulableJob; // Cast
            //      // Use the renamed property
            //      if (jobItem.order_details?.created_at) {
            //         return jobItem.order_details.created_at;
            //      }
            //   }
            //   return undefined;
            // };

            // const createdAtISO = getOrderCreatedAt(item);

            // if (createdAtISO) {
            //   try {
            //     const createdAtDate = new Date(createdAtISO);
            //     const now = new Date();
            //     const ageInMillis = now.getTime() - createdAtDate.getTime();
            //     const ageInDays = Math.floor(ageInMillis / (1000 * 60 * 60 * 24));

            //     if (ageInDays > MAX_AGE_DAYS_THRESHOLD) {
            //       const daysOverThreshold = ageInDays - MAX_AGE_DAYS_THRESHOLD;
            //       const priorityBoost = daysOverThreshold * PRIORITY_BOOST_PER_DAY;
            //       adjustedPriority = Math.max(MIN_PRIORITY_VALUE, item.priority - priorityBoost);
            //       // console.log(`Adjusted priority for item ${item.id} from ${item.priority} to ${adjustedPriority} (Age: ${ageInDays} days)`);
            //     }
            //   } catch (e) {
            //     console.warn(`Could not parse created_at date ('${createdAtISO}') for item ${getItemId(item)} to adjust priority: ${e}`);
            //   }
            // }
            // --- End Priority Adjustment ---

            // Base item structure
            const baseOptimizationItem = {
                id: getItemId(item),
                locationIndex: itemLocation.index,
                durationSeconds: duration * 60, // Convert minutes to seconds
                priority: item.priority,
                eligibleTechnicianIds: 'jobs' in item 
                    ? (item as JobBundle).eligible_technician_ids
                    : (item as SchedulableJob).eligibleTechnicians.map(t => t.id),
            };

            // Conditionally add the earliestStartTimeISO field
            if (earliestItemStartTimeISO) {
                return {
                    ...baseOptimizationItem,
                    earliestStartTimeISO: earliestItemStartTimeISO,
                };
            } else {
                return baseOptimizationItem;
            }
        })
        .filter((item): item is OptimizationItem => item !== null); // Filter out skipped items

    // Add generated break items to the list
    optimizationItems = optimizationItems.concat(tempBreakItems);

    // 5. Format Fixed Constraints
    let optimizationFixedConstraints: OptimizationFixedConstraint[] = fixedTimeJobs
        .map(job => {
            // Find the corresponding OptimizationItem ID
            const itemId = `job_${job.id}`;
            const correspondingItem = optimizationItems.find(optItem => optItem.id === itemId);
            if (!correspondingItem) {
                logger.warn(`Fixed time job ${job.id} was not found in the list of schedulable items. Skipping constraint.`);
                return null;
            }
            if (!job.fixed_schedule_time) {
                logger.warn(`Job ${job.id} is marked fixed but has no fixed_schedule_time. Skipping constraint.`);
                return null;
            }
            return {
                itemId: itemId,
                fixedTimeISO: new Date(job.fixed_schedule_time).toISOString(),
            };
        })
        .filter((constraint): constraint is OptimizationFixedConstraint => constraint !== null);

    // Add generated break constraints to the list
    optimizationFixedConstraints = optimizationFixedConstraints.concat(tempBreakConstraints);

    // 6. Construct Final Payload
    const payload: OptimizationRequestPayload = {
        locations: finalLocations,
        technicians: optimizationTechnicians,
        items: optimizationItems,
        fixedConstraints: optimizationFixedConstraints,
        travelTimeMatrix: travelTimeMatrix,
    };

    // console.log('Optimization payload prepared successfully.'); // Commented out for cleaner test logs
    // console.log(JSON.stringify(payload, null, 2)); // Optional: Log the full payload for debugging
    // logger.debug('Full Payload:', JSON.stringify(payload)); // Debug log if needed
    return payload;
}

// Example Usage (complex, requires previous steps)
/*
import { getActiveTechnicians } from '../supabase/technicians';
import { getRelevantJobs } from '../supabase/jobs';
import { bundleQueuedJobs } from './bundling';
import { determineTechnicianEligibility } from './eligibility';
import { calculateTechnicianAvailability } from './availability';

async function runPayloadExample() {
    try {
        console.log('--- Running Payload Preparation Example ---');
        const technicians = await getActiveTechnicians();
        const allJobs = await getRelevantJobs();
        const lockedJobs = allJobs.filter(j => ['en_route', 'in_progress', 'fixed_time'].includes(j.status));
        const queuedJobs = allJobs.filter(j => j.status === 'queued');
        const fixedTimeJobs = allJobs.filter(j => j.status === 'fixed_time' && j.fixed_schedule_time);

        if(technicians.length === 0 || queuedJobs.length === 0) {
            console.log('Need technicians and queued jobs to run example.');
            return;
        }

        calculateTechnicianAvailability(technicians, lockedJobs);
        const bundledItems = bundleQueuedJobs(queuedJobs);
        const eligibleItems = await determineTechnicianEligibility(bundledItems, technicians);

        const payload = await prepareOptimizationPayload(technicians, eligibleItems, fixedTimeJobs);

        console.log('\n--- Payload Prepared (Summary) ---');
        // console.log(`Locations: ${payload.locations.length}`);
        // console.log(`Technicians: ${payload.technicians.length}`);
        // console.log(`Items: ${payload.items.length}`);
        // console.log(`Fixed Constraints: ${payload.fixedConstraints.length}`);
        // console.log(`Travel Matrix Size: ${Object.keys(payload.travelTimeMatrix).length}`);
        logger.info(`Locations: ${payload.locations.length}`);
        logger.info(`Technicians: ${payload.technicians.length}`);
        logger.info(`Items: ${payload.items.length}`);
        logger.info(`Fixed Constraints: ${payload.fixedConstraints.length}`);
        logger.info(`Travel Matrix Size: ${Object.keys(payload.travelTimeMatrix).length}`);
        // console.log(JSON.stringify(payload, null, 2)); // Full payload

    } catch (error) {
        // console.error('Payload preparation example failed:', error);
        logger.error('Payload preparation example failed:', error);
    }
}

// runPayloadExample();
*/ 