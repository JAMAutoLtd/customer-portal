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
import { getTravelTime, getBulkTravelTimes } from '../google/maps';
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
    
    // --- Start: Call Bulk Travel Time Function --- 
    logger.info(`Requesting bulk travel times for ${finalLocations.length} locations (isForToday: ${isForToday}, departureTime: ${futureDepartureTime?.toISOString() || 'N/A'})...`);
    // Call with locations, get matrix directly
    const travelTimeMatrix: TravelTimeMatrix = await getBulkTravelTimes(finalLocations, isForToday, futureDepartureTime);
    logger.info(`Received travel time matrix.`);
    // --- End: Call Bulk Travel Time Function ---

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
            
            // <<< Add Logging for Availability Gaps >>>
            if (gaps.length > 0) {
                logger.debug(`Found ${gaps.length} availability gaps for technician ${tech.id} on ${formatDateToString(targetDate)}`);
                gaps.forEach((gap, index) => {
                    logger.debug(`Gap ${index + 1}: Start=${gap.start.toISOString()}, End=${gap.end.toISOString()}`, {
                        technicianId: tech.id,
                        targetDate: formatDateToString(targetDate),
                        gapIndex: index + 1,
                        gapStartISO: gap.start.toISOString(),
                        gapEndISO: gap.end.toISOString(),
                    });
                });
            } else {
                 logger.debug(`No availability gaps found for technician ${tech.id} on ${formatDateToString(targetDate)}`);
            }
            // <<< End Logging >>>

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
                        assignedTechnicianId: tech.id,
                        durationSeconds: durationSeconds
                    });
                    // <<< Add Logging for Dummy Break >>>
                    logger.debug("Generated dummy break item and constraint", {
                        technicianId: tech.id,
                        breakId: breakId,
                        breakDurationSeconds: durationSeconds,
                        breakLocationIndex: startLocation.index,
                        constraintFixedTimeISO: gap.start.toISOString(),
                        originalGapStartISO: gap.start.toISOString(),
                        originalGapEndISO: gap.end.toISOString()
                    });
                    // <<< End Logging >>>
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

            // --- Start: Add Fixed Time Info to OptimizationItem --- 
            let isFixed = false;
            let fixedISO: string | undefined = undefined;

            // Only SchedulableJob can be fixed_time (bundles cannot contain fixed jobs)
            if (!('jobs' in item) && (item as SchedulableJob).status === 'fixed_time') {
                const fixedJob = item as SchedulableJob;
                if (fixedJob.fixed_schedule_time) {
                    isFixed = true;
                    fixedISO = fixedJob.fixed_schedule_time;
                    logger.debug(`Marking item ${getItemId(item)} as fixed: ${fixedISO}`);
                } else {
                    logger.warn(`Item ${getItemId(item)} has status fixed_time but no fixed_schedule_time value.`);
                }
            }
            // --- End: Add Fixed Time Info to OptimizationItem --- 

            // Base item structure
            const baseOptimizationItem: OptimizationItem = {
                id: getItemId(item),
                locationIndex: itemLocation.index,
                durationSeconds: duration * 60, // Convert minutes to seconds
                priority: item.priority,
                eligibleTechnicianIds: 'jobs' in item 
                    ? (item as JobBundle).eligible_technician_ids
                    : (item as SchedulableJob).eligibleTechnicians.map(t => t.id),
            };

            // Conditionally add earliestStartTimeISO and fixed time info
            let finalOptimizationItem = { ...baseOptimizationItem };
            if (earliestItemStartTimeISO) {
                finalOptimizationItem.earliestStartTimeISO = earliestItemStartTimeISO;
            }
            if (isFixed) {
                finalOptimizationItem.isFixedTime = true;
                finalOptimizationItem.fixedTimeISO = fixedISO;
            }
            
            logger.debug(`Final Optimization Item for ${getItemId(item)}:`, finalOptimizationItem);
            
            return finalOptimizationItem; // Returns the item to be included in the payload
        })
        .filter((item): item is OptimizationItem => item !== null); // Filter out skipped items

    // Add generated break items to the list
    optimizationItems = optimizationItems.concat(tempBreakItems);

    // 5. Format Fixed Constraints
    let optimizationFixedConstraints: OptimizationFixedConstraint[] = [...tempBreakConstraints]; // Initialize with breaks

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
    
    // <<< Add INFO Summary Logging (Task 9) >>>
    const payloadSummary = {
      technicianCount: payload.technicians.length,
      itemCount: payload.items.length,
      locationCount: payload.locations.length,
      fixedConstraintCount: payload.fixedConstraints.length,
      technicianSummaries: payload.technicians.map(t => ({
        id: t.id,
        startIdx: t.startLocationIndex,
        endIdx: t.endLocationIndex,
        startISO: t.earliestStartTimeISO,
        endISO: t.latestEndTimeISO
      })),
      itemSummaries: payload.items.map(i => ({ 
        id: i.id, 
        priority: i.priority, 
        locIdx: i.locationIndex,
        earliestStartISO: i.earliestStartTimeISO // Include if present
      })),
      fixedConstraintSummaries: payload.fixedConstraints.map(fc => ({
        itemId: fc.itemId,
        fixedTimeISO: fc.fixedTimeISO
      }))
      // travelTimeMatrix is intentionally excluded as per requirement
    };
    logger.info("Prepared optimization payload summary", { payloadSummary });
    // <<< End INFO Summary Logging >>>

    return payload;
}
