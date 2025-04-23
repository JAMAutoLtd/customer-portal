import { 
    Technician, 
    Job, 
    SchedulableItem, 
    Address,
    JobBundle,
    SchedulableJob,
    TechnicianAvailability
} from '../types/database.types';
import {
    OptimizationLocation,
    OptimizationTechnician,
    OptimizationItem,
    OptimizationFixedConstraint,
    TravelTimeMatrix,
    OptimizationRequestPayload
} from '../types/optimization.types';
import { getTravelTime } from '../google/maps';
import { LatLngLiteral } from '@googlemaps/google-maps-services-js';
import { WORK_END_HOUR_UTC, WORK_END_MINUTE_UTC } from './availability'; // Import constants

const DEFAULT_DEPOT_LOCATION: LatLngLiteral = { lat: 51.0447, lng: -114.0719 }; // Updated to Calgary Downtown (matches Tech 1 Home for consistency)

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
 * @param {Technician[]} technicians - Array of available technicians (with availability calculated for today).
 * @param {SchedulableItem[]} items - Array of schedulable jobs/bundles (with eligibility calculated).
 * @param {Job[]} fixedTimeJobs - Array of jobs that have a fixed schedule time.
 * @param {TechnicianAvailability[]} [technicianAvailability] - Optional. Availability details for a specific future day (from calculateAvailabilityForDay).
 * @param {boolean} isForToday - Optional. Indicates whether the payload is for today or a future date.
 * @returns {Promise<OptimizationRequestPayload>} The payload object.
 */
export async function prepareOptimizationPayload(
    technicians: Technician[],
    items: SchedulableItem[],
    fixedTimeJobs: Job[],
    technicianAvailability?: TechnicianAvailability[],
    isForToday: boolean = true
): Promise<OptimizationRequestPayload> {
    console.log(`Preparing optimization payload... ${isForToday ? '(for today - using real-time traffic where applicable)' : '(for future date - using standard travel times)'}`);
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
    console.log("Processing item locations...");
    items.forEach(item => {
        if (!item.address?.lat || !item.address?.lng) {
            console.error(`Item ${getItemId(item)} is missing address coordinates. Skipping.`);
            return; 
        }
        const itemCoords: LatLngLiteral = { lat: item.address.lat, lng: item.address.lng };
        const key = `${itemCoords.lat},${itemCoords.lng}`;
        itemCoordsSet.add(key); // Store item coordinates
        addOrGetLocation(getItemId(item), itemCoords);
    });
    console.log(`Processed ${itemCoordsSet.size} unique item locations.`);

    // --- Stage 3: Technician Start Locations (Check for clashes) ---
    console.log("Processing technician start locations...");
    // Create a map for easy lookup if technicianAvailability is provided
    const availabilityMap = new Map<number, TechnicianAvailability>();
    if (technicianAvailability) {
        technicianAvailability.forEach(avail => availabilityMap.set(avail.technicianId, avail));
    }

    technicians.forEach(tech => {
        const techAvail = availabilityMap.get(tech.id);
        // Use home location from availability if provided, otherwise use current location/depot
        let startCoords = techAvail?.startLocation || tech.current_location || DEFAULT_DEPOT_LOCATION;
        const originalKey = `${startCoords.lat},${startCoords.lng}`;

        // Check if the exact coordinates are already used by an item
        if (itemCoordsSet.has(originalKey)) {
            // Perturb coordinates slightly to create a distinct location
            const perturbation = 0.00001; // Small offset
            const perturbedCoords = { lat: startCoords.lat + perturbation, lng: startCoords.lng };
            console.warn(`Technician ${tech.id} start location clashes with an item location at (${startCoords.lat}, ${startCoords.lng}). Perturbing to (${perturbedCoords.lat}, ${perturbedCoords.lng}).`);
            startCoords = perturbedCoords; // Use perturbed coords for this tech's start
            // Note: We don't add the perturbed key back to itemCoordsSet
        }
        
        // Add the (potentially perturbed) start location
        addOrGetLocation(`tech_start_${tech.id}`, startCoords);
    });

    // --- Finalize Locations List ---
    const finalLocations = Array.from(locationsMap.values()).sort((a, b) => a.index - b.index);
    console.log(`Defined ${finalLocations.length} unique locations for optimization (including depots/starts).`);

    // 2. Calculate Travel Time Matrix (using final coordinates)
    console.log('Calculating travel time matrix...');
    const travelTimeMatrix: TravelTimeMatrix = {};
    for (let i = 0; i < finalLocations.length; i++) {
        travelTimeMatrix[i] = {};
        for (let j = 0; j < finalLocations.length; j++) {
            if (i === j) {
                travelTimeMatrix[i][j] = 0; // Time from a location to itself is 0
                continue;
            }
            const originLoc = finalLocations[i];
            const destLoc = finalLocations[j];
            // console.log(`Fetching time from ${originLoc.id} (${i}) to ${destLoc.id} (${j})`);
            const duration = await getTravelTime(originLoc.coords, destLoc.coords, isForToday);
            if (duration === null) {
                // Handle error: Maybe use a high penalty value or throw
                console.error(`Failed to get travel time from ${originLoc.id} to ${destLoc.id}. Using high penalty.`);
                travelTimeMatrix[i][j] = 999999; // High penalty value
            } else {
                travelTimeMatrix[i][j] = duration;
            }
        }
    }
    // console.log('Travel time matrix calculated.'); // Commented out for cleaner test logs

    // 3. Format Technicians (use final coordinates for startLocationIndex)
    const optimizationTechnicians: OptimizationTechnician[] = technicians.map(tech => {
        const techAvail = availabilityMap.get(tech.id); // Get availability details if present

        // Determine start coordinates (potentially perturbed)
        let startCoords = techAvail?.startLocation || tech.current_location || DEFAULT_DEPOT_LOCATION;
        const originalKey = `${startCoords.lat},${startCoords.lng}`;
        if (itemCoordsSet.has(originalKey)) {
             const perturbation = 0.00001;
             startCoords = { lat: startCoords.lat + perturbation, lng: startCoords.lng };
        }
        
        // Find the location object added in Stage 3 using the potentially perturbed coords
        const startLocation = addOrGetLocation(`tech_start_${tech.id}`, startCoords); // This will retrieve the existing entry
        
        // Define start and end times: Use availability details if provided, otherwise calculate for today
        let earliestStartTimeISO: string;
        let latestEndTimeISO: string;

        if (techAvail) {
            earliestStartTimeISO = techAvail.availabilityStartTimeISO;
            latestEndTimeISO = techAvail.availabilityEndTimeISO;
            // console.log(`Tech ${tech.id} using future availability: ${earliestStartTimeISO} - ${latestEndTimeISO}`); // Commented out for cleaner test logs
        } else {
            // Fallback logic for today's calculation
            const earliestStartDate = new Date(tech.earliest_availability || Date.now());
            const latestEndDate = new Date(earliestStartDate);
            // Use setUTCHours to ensure end time is based on UTC day
            // Assumes WORK_END_HOUR_UTC and WORK_END_MINUTE_UTC are defined globally or imported
            // (They should be consistent with availability.ts)
            // TODO: Import or define UTC work hour constants here
            latestEndDate.setUTCHours(WORK_END_HOUR_UTC, WORK_END_MINUTE_UTC, 0, 0); // Use imported constants
            earliestStartTimeISO = earliestStartDate.toISOString();
            latestEndTimeISO = latestEndDate.toISOString();
            // console.log(`Tech ${tech.id} using current availability (UTC adjusted): ${earliestStartTimeISO} - ${latestEndTimeISO}`); // Commented out for cleaner test logs
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
    const optimizationItems: OptimizationItem[] = items
        .map(item => {
            // Get the location object previously created
            const itemLocation = addOrGetLocation(getItemId(item), {
                // These checks are needed because we might have skipped items without coords earlier
                lat: item.address?.lat || 0, 
                lng: item.address?.lng || 0
            });
             // Check if the location was actually found/created (it should have been unless coords were missing)
             if (!finalLocations.find(l => l.index === itemLocation.index)) {
                console.warn(`Skipping item ${getItemId(item)} because its location could not be indexed (likely missing coordinates).`);
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

    // 5. Format Fixed Constraints
    const optimizationFixedConstraints: OptimizationFixedConstraint[] = fixedTimeJobs
        .map(job => {
            // Find the corresponding OptimizationItem ID
            const itemId = `job_${job.id}`;
            const correspondingItem = optimizationItems.find(optItem => optItem.id === itemId);
            if (!correspondingItem) {
                console.warn(`Fixed time job ${job.id} was not found in the list of schedulable items. Skipping constraint.`);
                return null;
            }
            if (!job.fixed_schedule_time) {
                console.warn(`Job ${job.id} is marked fixed but has no fixed_schedule_time. Skipping constraint.`);
                return null;
            }
            return {
                itemId: itemId,
                fixedTimeISO: new Date(job.fixed_schedule_time).toISOString(),
            };
        })
        .filter((constraint): constraint is OptimizationFixedConstraint => constraint !== null);

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
        console.log(`Locations: ${payload.locations.length}`);
        console.log(`Technicians: ${payload.technicians.length}`);
        console.log(`Items: ${payload.items.length}`);
        console.log(`Fixed Constraints: ${payload.fixedConstraints.length}`);
        console.log(`Travel Matrix Size: ${Object.keys(payload.travelTimeMatrix).length}`);
        // console.log(JSON.stringify(payload, null, 2)); // Full payload

    } catch (error) {
        console.error('Payload preparation example failed:', error);
    }
}

// runPayloadExample();
*/ 