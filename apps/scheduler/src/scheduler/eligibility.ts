import { Technician, Job, JobBundle, SchedulableJob, SchedulableItem, VanEquipment } from '../types/database.types';
import { FailureReason } from '../types/database.types';
import { getRequiredEquipmentForJob, getEquipmentForVans } from '../supabase/equipment';
import { logger } from '../utils/logger';

/**
 * Determines the list of eligible technicians for a given set of required equipment models.
 *
 * @param {string[]} requiredModels - Array of required equipment model strings.
 * @param {Technician[]} technicians - Array of all available technicians.
 * @param {Map<number, VanEquipment[]>} vanEquipmentMap - Map of van ID to its equipment list.
 * @returns {number[]} An array of technician IDs eligible to perform the job/bundle.
 */
function findEligibleTechnicians(
    requiredModels: string[],
    technicians: Technician[],
    vanEquipmentMap: Map<number, VanEquipment[]>
): number[] {
    if (requiredModels.length === 0) {
        // If no specific equipment is required, all technicians *with assigned vans* are eligible
        return technicians
            .filter(tech => tech.assigned_van_id !== null)
            .map(tech => tech.id);
    }

    const eligibleTechIds: number[] = [];
    for (const tech of technicians) {
        if (tech.assigned_van_id === null) continue; // Skip techs without vans

        const techEquipment = vanEquipmentMap.get(tech.assigned_van_id) || [];
        const techModels = new Set(techEquipment.map(e => e.equipment_model).filter(m => !!m)); // Get unique models in the van

        // Check if the technician's van has ALL required models
        const hasAllRequired = requiredModels.every(reqModel => techModels.has(reqModel));

        if (hasAllRequired) {
            eligibleTechIds.push(tech.id);
        }
    }
    return eligibleTechIds;
}

/**
 * Represents an item that could not be scheduled due to eligibility constraints.
 */
export interface IneligibleItem {
    item: SchedulableItem;
    reason: FailureReason;
}

/**
 * The result structure for the eligibility determination process.
 */
export interface EligibilityResult {
    eligibleItems: SchedulableItem[];
    ineligibleItems: IneligibleItem[];
}

/**
 * Processes schedulable items (bundles and single jobs) to determine required equipment
 * and find eligible technicians for each.
 * Breaks bundles into single jobs if no technician is eligible for the bundle.
 * Returns separate lists of eligible and ineligible items.
 *
 * @param {SchedulableItem[]} initialItems - Array of items from the bundling step.
 * @param {Technician[]} technicians - Array of available technicians.
 * @returns {Promise<EligibilityResult>} A promise resolving to an object containing eligible and ineligible items.
 */
export async function determineTechnicianEligibility(
    initialItems: SchedulableItem[],
    technicians: Technician[],
): Promise<EligibilityResult> {
    logger.info(`Determining eligibility for ${initialItems.length} schedulable items...`);

    // 1. Fetch equipment for all technicians' vans at once
    const allVanIds = technicians
        .map(tech => tech.assigned_van_id)
        .filter((id): id is number => id !== null && id !== undefined); // Filter out null/undefined van IDs
    const vanEquipmentMap = await getEquipmentForVans(Array.from(new Set(allVanIds))); // Ensure unique IDs

    const eligibleItems: SchedulableItem[] = [];
    const ineligibleItems: IneligibleItem[] = [];

    for (const item of initialItems) {
        let requiredModels: string[] = [];
        let eligibleTechIds: number[] = [];
        const isJobBundle = 'jobs' in item;

        if (isJobBundle) {
            const bundle = item as JobBundle;
            logger.debug(`Processing Bundle for Order ID: ${bundle.order_id}`);
            // Aggregate required equipment from all jobs in the bundle
            const allRequired = new Set<string>();
            for (const job of bundle.jobs) {
                const jobReqs = await getRequiredEquipmentForJob(job);
                jobReqs.forEach(model => allRequired.add(model));
            }
            requiredModels = Array.from(allRequired);
            bundle.required_equipment_models = requiredModels;

            // Find eligible technicians for the *bundle*
            eligibleTechIds = findEligibleTechnicians(requiredModels, technicians, vanEquipmentMap);
            bundle.eligible_technician_ids = eligibleTechIds;

            if (eligibleTechIds.length === 0) {
                // No tech can handle the whole bundle
                logger.warn(`No eligible technicians found for Bundle Order ID ${bundle.order_id}. Required: [${requiredModels.join(', ')}]. Breaking into single jobs.`);

                // If bundle breaking is needed, process each job individually
                for (const job of bundle.jobs) {
                    const singleJobReqs = await getRequiredEquipmentForJob(job);
                    const singleJobEligibleTechs = findEligibleTechnicians(singleJobReqs, technicians, vanEquipmentMap);
                    
                    const schedulableJob: SchedulableJob = {
                        ...job,
                        eligibleTechnicians: singleJobEligibleTechs.map(id => 
                            technicians.find(t => t.id === id)
                        ).filter((t): t is Technician => !!t),
                        originalItem: job,
                    };

                    if (singleJobEligibleTechs.length > 0) {
                        eligibleItems.push(schedulableJob);
                        logger.debug(`  -> Added single Job ID ${job.id} (from bundle ${bundle.order_id}) individually. Eligible Techs: ${singleJobEligibleTechs.join(', ') || 'None'}`);
                    } else {
                        // This individual job from the broken bundle is ineligible
                        ineligibleItems.push({ 
                            item: schedulableJob, 
                            reason: FailureReason.NO_ELIGIBLE_TECHNICIAN_EQUIPMENT 
                        });
                        logger.debug(`  -> Marked single Job ID ${job.id} (from bundle ${bundle.order_id}) as INELIGIBLE. Required: [${singleJobReqs.join(', ')}].`);
                    }
                }
            } else {
                // Bundle is eligible as a whole
                logger.debug(`Bundle Order ID ${bundle.order_id} is ELIGIBLE. Required: [${requiredModels.join(', ')}]. Eligible Techs: ${eligibleTechIds.join(', ') || 'None'}`);
                eligibleItems.push(bundle); // Keep the valid bundle
            }

        } else {
            // Process a single SchedulableJob
            const schedJob = item as SchedulableJob;
            
            logger.debug(`Processing Single Job ID: ${schedJob.id}`);
            requiredModels = await getRequiredEquipmentForJob(schedJob);
            eligibleTechIds = findEligibleTechnicians(requiredModels, technicians, vanEquipmentMap);
            
            // Update the eligibleTechnicians property regardless, might be empty
            schedJob.eligibleTechnicians = eligibleTechIds.map(id => 
                technicians.find(t => t.id === id)
            ).filter((t): t is Technician => !!t);
            
            if (eligibleTechIds.length > 0) {
                logger.debug(`Single Job ID ${schedJob.id} is ELIGIBLE. Required: [${requiredModels.join(', ')}]. Eligible Techs: ${eligibleTechIds.join(', ') || 'None'}`);
                eligibleItems.push(schedJob);
            } else {
                // Single job is ineligible
                // Add more detailed logging for the failure reason
                const anyTechHasEquipment = checkEquipmentEligibilityIgnoringVans(requiredModels, technicians, vanEquipmentMap);
                let logReason = `Required: [${requiredModels.join(', ') || 'None'}]`;
                if (!anyTechHasEquipment) {
                    logReason += '. No technician possesses all required equipment.';
                } else {
                    logReason += '. Technicians possessing equipment may lack assigned vans or other constraints apply.';
                }
                logger.debug(`Single Job ID ${schedJob.id} is INELIGIBLE. ${logReason}`);
                
                ineligibleItems.push({ 
                    item: schedJob, 
                    // Keep the primary reason as EQUIPMENT for now, as that's the effective outcome for the item
                    reason: FailureReason.NO_ELIGIBLE_TECHNICIAN_EQUIPMENT 
                });
            }
        }
    }

    logger.info(`Finished eligibility check. Eligible items: ${eligibleItems.length}, Ineligible items: ${ineligibleItems.length}`);
    // Return the structured result
    return { eligibleItems, ineligibleItems };
}

/**
 * Checks if ANY technician in the list has the required equipment, regardless of van assignment.
 * Used for more specific logging when an item is ineligible.
 */
function checkEquipmentEligibilityIgnoringVans(
    requiredModels: string[],
    technicians: Technician[],
    vanEquipmentMap: Map<number, VanEquipment[]>
): boolean {
    if (requiredModels.length === 0) return true; // No specific equipment needed

    for (const tech of technicians) {
        // Check even if van is null, just to see if *anyone* has the gear
        const techEquipment = tech.assigned_van_id !== null 
            ? vanEquipmentMap.get(tech.assigned_van_id) || []
            : []; // If no van, they have no equipment from van perspective
        
        // Temporary Set for this tech's equipment (consider optimizing if needed)
        const techModels = new Set(techEquipment.map(e => e.equipment_model).filter(m => !!m));
        const hasAllRequired = requiredModels.every(reqModel => techModels.has(reqModel));
        if (hasAllRequired) {
            return true; // Found at least one technician with the equipment
        }
    }
    return false; // No technician found with all required equipment
}

// Example Usage
/*
import { getActiveTechnicians } from '../supabase/technicians';
import { getRelevantJobs } from '../supabase/jobs';
import { bundleQueuedJobs } from './bundling';

async function runEligibilityExample() {
    try {
        console.log('--- Running Eligibility Example ---');
        const technicians = await getActiveTechnicians();
        if (technicians.length === 0) {
            console.log('No technicians found. Exiting example.');
            return;
        }
        const allJobs = await getRelevantJobs();
        const queuedJobs = allJobs.filter(job => job.status === 'queued');
         if (queuedJobs.length === 0) {
            console.log('No queued jobs found. Exiting example.');
            return;
        }

        const initialBundledItems = bundleQueuedJobs(queuedJobs);
        console.log('\n--- Starting Eligibility Determination ---');
        const { eligibleItems, ineligibleItems } = await determineTechnicianEligibility(initialBundledItems, technicians);

        console.log('\n--- Eligible Schedulable Items ---');
        console.log(JSON.stringify(eligibleItems, null, 2));
        console.log('\n--- Ineligible Items ---');
        console.log(JSON.stringify(ineligibleItems, null, 2));

    } catch (error) {
        console.error('Eligibility example failed:', error);
    }
}

// runEligibilityExample();
*/ 