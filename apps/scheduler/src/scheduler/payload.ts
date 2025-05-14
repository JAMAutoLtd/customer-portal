import { 
    Technician, 
    Job, 
    SchedulableItem, 
    JobBundle,
    SchedulableJob,
} from '../types/database.types';
import {
    OptimizationLocation,
    OptimizationTechnician,
    OptimizationItem,
    OptimizationFixedConstraint,
    TravelTimeMatrix,
    OptimizationRequestPayload
} from '../types/optimization.types';
import { getBulkTravelTimes } from '../google/maps';
import { LatLngLiteral } from '@googlemaps/google-maps-services-js';
import { 
    calculateWindowsForTechnician, 
    applyLockedJobsToWindows, 
    TimeWindow, 
    DailyAvailabilityWindows, 
    formatDateToString,
    AvailabilityGap,
    findAvailabilityGaps as findAvailabilityGapsFromAvailability
} from './availability';
import { startOfDay } from 'date-fns';
import { logger } from '../utils/logger';

// Define a type for the new unavailability structure
interface TechnicianUnavailability {
    technicianId: number;
    startTimeISO: string;
    durationSeconds: number;
}

const DEFAULT_DEPOT_LOCATION: LatLngLiteral = { lat: 51.0447, lng: -114.0719 };
const FUTURE_DEPARTURE_HOUR_UTC = 15;

export const DUMMY_BREAK_LOCATION_ID = 'dummy_break_loc';

function createDummyBreakLocation(locationIndex: number): OptimizationLocation {
  return {
    id: DUMMY_BREAK_LOCATION_ID,
    index: locationIndex,
    coords: { lat: -999, lng: -999 },
  };
}

function adjustTravelTimeMatrixForDummyBreaks(
    travelTimeMatrix: TravelTimeMatrix,
    dummyBreakLocationIndex: number
): TravelTimeMatrix {
    if (!(dummyBreakLocationIndex in travelTimeMatrix)) {
        logger.error(`Invalid dummyBreakLocationIndex: ${dummyBreakLocationIndex} is not a key in the travel time matrix. Matrix not adjusted.`);
        return travelTimeMatrix;
    }

    logger.debug(`Adjusting travel time matrix for dummy break location at index: ${dummyBreakLocationIndex}`);

    for (const originIdxStr in travelTimeMatrix) {
        const originIdx = parseInt(originIdxStr, 10);
        const destinations = travelTimeMatrix[originIdx];

        for (const destIdxStr in destinations) {
            const destIdx = parseInt(destIdxStr, 10);

            if (originIdx === dummyBreakLocationIndex || destIdx === dummyBreakLocationIndex) {
                if (travelTimeMatrix[originIdx][destIdx] !== 0) {
                    travelTimeMatrix[originIdx][destIdx] = 0;
                }
            }
        }
    }
    return travelTimeMatrix;
}

function getItemId(item: SchedulableItem): string {
    if ('jobs' in item) {
        return `bundle_${item.order_id}`;
    } else {
        return `job_${item.id}`;
    }
}

export async function prepareOptimizationPayload(
    technicians: Technician[],
    items: SchedulableItem[],
    lockedJobs: Job[],
    targetDate: Date
): Promise<OptimizationRequestPayload> {
    const isForToday = formatDateToString(targetDate) === formatDateToString(new Date());
    logger.info(`Preparing optimization payload for date: ${formatDateToString(targetDate)} ${isForToday ? '(Using today logic)' : '(Using future logic)'}`);
    logger.debug(
        `[payload.ts] Initial lockedJobs for targetDate ${formatDateToString(targetDate)}`,
        { 
            count: lockedJobs.length, 
            jobIds: lockedJobs.map(j => j.id)
        }
    );
    
    let futureDepartureTime: Date | undefined = undefined;
    if (!isForToday) {
        futureDepartureTime = startOfDay(targetDate);
        if (futureDepartureTime) {
            futureDepartureTime.setUTCHours(FUTURE_DEPARTURE_HOUR_UTC, 0, 0, 0);
            logger.debug(`Calculated future departure time for predictive traffic: ${futureDepartureTime.toISOString()}`);
        } else {
            logger.error("Failed to initialize futureDepartureTime from targetDate.");
        }
    }

    const locationsMap = new Map<string, OptimizationLocation>();
    let currentIndex = 0;
    const itemCoordsSet = new Set<string>();

    const addOrGetLocation = (id: string | number, coords: LatLngLiteral): OptimizationLocation => {
        const key = `${coords.lat},${coords.lng}`;
        if (!locationsMap.has(key)) {
            locationsMap.set(key, { id: id, index: currentIndex++, coords: coords });
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return locationsMap.get(key)!;
    };

    // --- Stage 1: Depot (Index 0) ---
    const depotLocation = addOrGetLocation('depot', DEFAULT_DEPOT_LOCATION);

    // --- Pre-calculate all technician availability and check for gaps (already good) ---
    const allTechnicianDailyAvailability: Map<number, DailyAvailabilityWindows> = new Map();
    const perTechnicianGaps: Map<number, AvailabilityGap[]> = new Map();
    // NEW: Collect unavailabilities here
    const technicianUnavailabilities: TechnicianUnavailability[] = [];

    technicians.forEach(tech => {
        const baseWindows = calculateWindowsForTechnician(tech, targetDate, targetDate);

        // Filter lockedJobs for those specifically ON the targetDate for this tech
        const relevantLockedJobsForTargetDate = lockedJobs.filter(job => {
            if (job.assigned_technician !== tech.id) {
                return false;
            }
            // For fixed_time jobs
            if (job.status === 'fixed_time' && job.fixed_schedule_time) {
                const jobDateStr = formatDateToString(new Date(job.fixed_schedule_time));
                const targetDateStr = formatDateToString(targetDate);
                const matches = jobDateStr === targetDateStr;
                logger.debug(`Filtering locked job ${job.id} for tech ${tech.id} on ${targetDateStr}: jobDate=${jobDateStr}, matches=${matches}`);
                return matches;
            }
            // For in_progress jobs
            if (job.status === 'in_progress' && job.estimated_sched) {
                const jobDateStr = formatDateToString(new Date(job.estimated_sched));
                const targetDateStr = formatDateToString(targetDate);
                const matches = jobDateStr === targetDateStr;
                logger.debug(`Filtering locked job ${job.id} (in_progress) for tech ${tech.id} on ${targetDateStr}: jobDate=${jobDateStr}, matches=${matches}`);
                return matches;
            }
            // Consider 'en_route' or other statuses if they should also define locked time
            return false;
        });

        // ALWAYS apply relevant locked jobs, not just for today
        const finalWindows = applyLockedJobsToWindows(baseWindows, relevantLockedJobsForTargetDate, tech.id, targetDate);
        
        allTechnicianDailyAvailability.set(tech.id, finalWindows);

        const techWindowsForTargetDate = finalWindows.get(formatDateToString(targetDate)) || [];
        if (techWindowsForTargetDate.length > 0) {
            const techEarliestStartTimeISO = techWindowsForTargetDate[0].start.toISOString();
            const techLatestEndTimeISO = techWindowsForTargetDate[techWindowsForTargetDate.length - 1].end.toISOString();
            const technicianDetailsForGapFinding = {
                id: tech.id,
                earliestStartTimeISO: techEarliestStartTimeISO,
                latestEndTimeISO: techLatestEndTimeISO
            };

            // Log inputs to findAvailabilityGapsFromAvailability
            logger.debug(
                `Inputs for findAvailabilityGaps for Tech ${tech.id} on ${formatDateToString(targetDate)}`,
                {
                    technicianId: tech.id,
                    targetDate: formatDateToString(targetDate),
                    technicianDetails: technicianDetailsForGapFinding,
                    availabilityWindows: techWindowsForTargetDate.map(w => ({ 
                        start: w.start.toISOString(), 
                        end: w.end.toISOString() 
                    }))
                }
            );

            const gaps = findAvailabilityGapsFromAvailability(technicianDetailsForGapFinding, techWindowsForTargetDate);
            
            logger.debug(
                `IMMEDIATE check of gaps for Tech ${tech.id} on ${formatDateToString(targetDate)}`,
                {
                    technicianId: tech.id,
                    targetDate: formatDateToString(targetDate),
                    gapsLength: gaps.length,
                    gapsContent: JSON.stringify(gaps) // Stringify to ensure it's logged fully
                }
            );

            // Log output of findAvailabilityGapsFromAvailability
            logger.debug(
                `Output of findAvailabilityGaps for Tech ${tech.id} on ${formatDateToString(targetDate)}`,
                {
                    technicianId: tech.id,
                    targetDate: formatDateToString(targetDate),
                    returnedGaps: gaps
                }
            );

            // Populate technicianUnavailabilities
            gaps.forEach(gap => {
                if (gap.durationSeconds > 0) {
                    technicianUnavailabilities.push({
                        technicianId: gap.technicianId,
                        startTimeISO: gap.start, // gap.start is already an ISO string from current logic
                        durationSeconds: gap.durationSeconds
                    });
                    logger.debug(`[payload.ts] Collected unavailability for Tech ${gap.technicianId} on ${formatDateToString(targetDate)}: ${gap.start} for ${gap.durationSeconds}s`);
                }
            });
            // Log the state of technicianUnavailabilities for this specific tech/date after processing gaps
            logger.debug(
                `[payload.ts] State of technicianUnavailabilities for Tech ${tech.id} on ${formatDateToString(targetDate)} after processing gaps`,
                {
                    technicianId: tech.id,
                    targetDate: formatDateToString(targetDate),
                    currentTechnicianUnavailabilities: technicianUnavailabilities.filter(tu => tu.technicianId === tech.id && tu.startTimeISO.startsWith(formatDateToString(targetDate)))
                }
            );

            perTechnicianGaps.set(tech.id, gaps); // Keep this if used elsewhere, or remove if only for old break logic
        } else {
            perTechnicianGaps.set(tech.id, []);
        }
    });
    // logger.debug(`Pre-calculated gaps. Need dummy break location: ${willNeedDummyBreakLocation}`); // No longer need this log

    // --- Stage 2: Item Locations ---
    logger.debug("Processing item locations...");
    items.forEach(item => {
        if (!item.address?.lat || !item.address?.lng) {
            logger.error(`Item ${getItemId(item)} is missing address coordinates. Skipping.`);
            return; 
        }
        const itemCoords: LatLngLiteral = { lat: item.address.lat, lng: item.address.lng };
        const key = `${itemCoords.lat},${itemCoords.lng}`;
        itemCoordsSet.add(key);
        addOrGetLocation(getItemId(item), itemCoords);
    });
    logger.debug(`Processed ${itemCoordsSet.size} unique item locations.`);

    // --- Stage 3: Technician Start Locations ---
    logger.debug("Processing technician start locations...");
    technicians.forEach(tech => { // This loop is now primarily for adding tech start locations
        let startCoords = tech.home_location || DEFAULT_DEPOT_LOCATION;
        if (isForToday && tech.current_location) {
             startCoords = tech.current_location;
        }
        const originalKey = `${startCoords.lat},${startCoords.lng}`;
        if (itemCoordsSet.has(originalKey)) {
             const perturbation = 0.00001;
             const perturbedCoords = { lat: startCoords.lat + perturbation, lng: startCoords.lng };
             logger.warn(`Technician ${tech.id} start location clashes with an item location at (${startCoords.lat}, ${startCoords.lng}). Perturbing to (${perturbedCoords.lat}, ${perturbedCoords.lng}).`);
             startCoords = perturbedCoords;
        }
        addOrGetLocation(`tech_start_${tech.id}`, startCoords);
    });

    // --- Finalize Locations List ---
    const finalLocations = Array.from(locationsMap.values()).sort((a, b) => a.index - b.index);
    logger.info(`Defined ${finalLocations.length} unique locations for optimization.`);
    
    // --- Calculate Travel Time Matrix (using finalLocations) ---
    logger.info(`Requesting bulk travel times for ${finalLocations.length} locations (isForToday: ${isForToday}, departureTime: ${futureDepartureTime?.toISOString() || 'N/A'})...`);
    const travelTimeMatrixResponse: TravelTimeMatrix = await getBulkTravelTimes(finalLocations, isForToday, futureDepartureTime);
    logger.info(`Received travel time matrix.`);
    
    // --- Format Technicians ---
    const optimizationTechnicians: OptimizationTechnician[] = technicians.map(tech => {
        // Find the tech's start location (already added to locationsMap)
        let techStartLocCoords = tech.home_location || DEFAULT_DEPOT_LOCATION;
        if (isForToday && tech.current_location) {
            techStartLocCoords = tech.current_location;
        }
        const originalKey = `${techStartLocCoords.lat},${techStartLocCoords.lng}`;
        if (itemCoordsSet.has(originalKey)) { // Check for perturbation again to find the correct key
             const perturbation = 0.00001;
             techStartLocCoords = { lat: techStartLocCoords.lat + perturbation, lng: techStartLocCoords.lng };
        }
        const startLocation = addOrGetLocation(`tech_start_${tech.id}`, techStartLocCoords); // This retrieves the existing one
        
        let techEarliestStartTimeISO: string;
        let techLatestEndTimeISO: string;
        const techWindows = allTechnicianDailyAvailability.get(tech.id)?.get(formatDateToString(targetDate)) || [];

        if (techWindows.length > 0) {
            const workDayStart = techWindows[0].start;
            const workDayEnd = techWindows[techWindows.length - 1].end;
            techEarliestStartTimeISO = workDayStart.toISOString();
            techLatestEndTimeISO = workDayEnd.toISOString();

            // REMOVE: Logic for creating tempBreakItems and tempBreakConstraints from gaps
            // const gaps: AvailabilityGap[] = perTechnicianGaps.get(tech.id) || []; 
            // if (gaps.length > 0 && dummyBreakLocationGlobal) { ... gaps.forEach ... tempBreakItems.push ... tempBreakConstraints.push ... }

        } else {
            logger.warn(`Technician ${tech.id} has no availability windows for ${formatDateToString(targetDate)}. Setting narrow time window.`);
            const midDay = new Date(targetDate);
            midDay.setUTCHours(12, 0, 0, 0);
            techEarliestStartTimeISO = midDay.toISOString();
            techLatestEndTimeISO = midDay.toISOString(); 
        }
        
        return {
            id: tech.id,
            startLocationIndex: startLocation.index,
            endLocationIndex: depotLocation.index,
            earliestStartTimeISO: techEarliestStartTimeISO, 
            latestEndTimeISO: techLatestEndTimeISO,       
        };
    });

    // --- Format Items ---
    let optimizationItems: OptimizationItem[] = items
        .map(item => {
            const itemLocation = addOrGetLocation(getItemId(item), {
                lat: item.address?.lat || 0, 
                lng: item.address?.lng || 0
            });
             // finalLocations is now defined before this block
             if (!finalLocations.find((l: OptimizationLocation) => l.index === itemLocation.index)) {
                logger.warn(`Skipping item ${getItemId(item)} because its location could not be indexed (likely missing coordinates).`);
                return null; 
            }
            const isBundle = 'jobs' in item;
            const duration = isBundle ? (item as JobBundle).total_duration : (item as SchedulableJob).job_duration;
            let earliestItemStartTimeISO: string | undefined = undefined;
            if ('jobs' in item) {
                const bundle = item as JobBundle;
                let latestEarliestTime = 0;
                bundle.jobs.forEach(job => {
                    const jobEarliestTimeStr = job.order_details?.earliest_available_time;
                    if (jobEarliestTimeStr) {
                        const jobEarliestTime = new Date(jobEarliestTimeStr).getTime();
                        if (jobEarliestTime > latestEarliestTime) latestEarliestTime = jobEarliestTime;
                    }
                });
                if (latestEarliestTime > 0) earliestItemStartTimeISO = new Date(latestEarliestTime).toISOString();
            } else {
                const schedJob = item as SchedulableJob;
                earliestItemStartTimeISO = schedJob.order_details?.earliest_available_time || undefined;
            }
            let isFixed = false;
            let fixedISO: string | undefined = undefined;
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
            const baseOptimizationItem: OptimizationItem = {
                id: getItemId(item),
                locationIndex: itemLocation.index,
                durationSeconds: duration * 60,
                priority: item.priority,
                eligibleTechnicianIds: 'jobs' in item 
                    ? (item as JobBundle).eligible_technician_ids
                    : (item as SchedulableJob).eligibleTechnicians.map(t => t.id),
            };
            let finalOptimizationItem = { ...baseOptimizationItem };
            if (earliestItemStartTimeISO) finalOptimizationItem.earliestStartTimeISO = earliestItemStartTimeISO;
            if (isFixed) {
                finalOptimizationItem.isFixedTime = true;
                finalOptimizationItem.fixedTimeISO = fixedISO;
            }
            logger.debug(`Final Optimization Item for ${getItemId(item)}:`, finalOptimizationItem);
            return finalOptimizationItem;
        })
        .filter((item): item is OptimizationItem => item !== null);

    // Format Fixed Constraints - will be empty now unless actual fixed jobs are handled elsewhere
    const optimizationFixedConstraints: OptimizationFixedConstraint[] = []; // Initialize as empty
    // REMOVE: Spreading of tempBreakConstraints
    // let optimizationFixedConstraints: OptimizationFixedConstraint[] = [...tempBreakConstraints];
    // (Future: Add logic here to include fixed constraints for actual fixed-time jobs, not just breaks)

    // Construct Final Payload
    const payload: OptimizationRequestPayload = {
        locations: finalLocations, 
        technicians: optimizationTechnicians, 
        items: optimizationItems,
        fixedConstraints: optimizationFixedConstraints, // Now empty or for true fixed jobs
        travelTimeMatrix: travelTimeMatrixResponse, // Original matrix, not adjusted for dummy break
        technicianUnavailabilities: technicianUnavailabilities // NEW FIELD
    };
    
    const payloadSummary = {
      technicianCount: payload.technicians.length,
      itemCount: payload.items.length,
      locationCount: payload.locations.length,
      fixedConstraintCount: payload.fixedConstraints.length,
      technicianUnavailabilitiesCount: payload.technicianUnavailabilities?.length || 0, // Add count for new field
      technicianSummaries: payload.technicians.map(t => ({
        id: t.id, startIdx: t.startLocationIndex, endIdx: t.endLocationIndex,
        startISO: t.earliestStartTimeISO, endISO: t.latestEndTimeISO
      })),
      itemSummaries: payload.items.map(i => ({ 
        id: i.id, priority: i.priority, locIdx: i.locationIndex,
        earliestStartISO: i.earliestStartTimeISO
      })),
      fixedConstraintSummaries: payload.fixedConstraints.map(fc => ({
        itemId: fc.itemId, fixedTimeISO: fc.fixedTimeISO
      }))
    };
    logger.info("Prepared optimization payload summary", { payloadSummary });

    return payload;
}
