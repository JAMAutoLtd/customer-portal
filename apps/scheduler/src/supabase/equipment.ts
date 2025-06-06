import { supabase } from './client';
import { VanEquipment, Equipment, Job, ServiceCategory, EquipmentRequirement } from '../types/database.types';
import { getYmmIdForOrder } from './orders'; // Import the helper function
import { logger } from '../utils/logger'; // Import logger

/**
 * Fetches the equipment inventory for a given list of van IDs.
 *
 * @param {number[]} vanIds - An array of van IDs to fetch equipment for.
 * @returns {Promise<Map<number, VanEquipment[]>>} A promise that resolves to a map where keys are van IDs
 *                                                  and values are arrays of VanEquipment for that van.
 */
export async function getEquipmentForVans(vanIds: number[]): Promise<Map<number, VanEquipment[]>> {
  const equipmentMap = new Map<number, VanEquipment[]>();
  if (vanIds.length === 0) {
    logger.warn('No van IDs provided to getEquipmentForVans.');
    return equipmentMap;
  }

  logger.info(`Fetching equipment for ${vanIds.length} vans...`);

  const response = await supabase
    .from('van_equipment')
    .select(`
      van_id,
      equipment_id,
      equipment!inner ( id, equipment_type, model )
    `)
    .in('van_id', vanIds);

  // Log the raw response to see what PostgREST returns for the implicit join
  logger.debug('Raw Supabase response (van_equipment):', JSON.stringify(response, null, 2));

  const { data, error } = response;

  if (error) {
    logger.error('Error fetching van equipment:', error);
    throw new Error(`Failed to fetch van equipment: ${error.message}`);
  }

  if (!data) {
    logger.warn('No equipment found for the specified vans.');
    return equipmentMap;
  }

  // Group equipment by van_id
  for (const item of data) {
    // Handle joined equipment data - PostgREST returns it as an object
    const equipmentData = (item.equipment && typeof item.equipment === 'object' && !Array.isArray(item.equipment))
      ? item.equipment as Equipment
      : undefined;

    // Make sure equipment data and model exist before accessing
    if (!equipmentData) {
        logger.warn(`Missing joined equipment data for van_id ${item.van_id}, equipment_id ${item.equipment_id}. Skipping.`);
        continue; 
    }

    const vanEquipment: VanEquipment = {
      van_id: item.van_id,
      equipment_id: item.equipment_id,
      equipment_model: equipmentData.model, // Get model from the joined equipment object
      equipment: equipmentData,
    };

    if (!equipmentMap.has(item.van_id)) {
      equipmentMap.set(item.van_id, []);
    }
    equipmentMap.get(item.van_id)?.push(vanEquipment);
  }

  logger.info(`Fetched equipment details for ${equipmentMap.size} vans.`);
  return equipmentMap;
}

/**
 * Determines the required equipment model(s) for a specific job.
 * Uses the unified equipment_requirements table instead of category-specific tables.
 *
 * @param {Job} job - The job object (must include service_id).
 * @returns {Promise<string[]>} A promise that resolves to an array of required equipment model strings, or an empty array if none are found or required.
 */
export async function getRequiredEquipmentForJob(job: Job): Promise<string[]> {
  if (!job.service_id) {
    logger.warn(`Job ${job.id} is missing service_id. Cannot determine equipment requirements.`);
    return [];
  }
  if (!job.order_id) {
     logger.warn(`Job ${job.id} is missing order_id. Cannot determine required equipment.`);
     return [];
  }

  logger.debug(`Determining required equipment for Job ID: ${job.id}, Service ID: ${job.service_id}`);

  // 1. Get the ymm_id for the order associated with the job
  const ymmId = await getYmmIdForOrder(job.order_id);
  if (ymmId === null) {
    logger.warn(`Could not determine ymm_id for order ${job.order_id} (Job ID: ${job.id}). Cannot fetch equipment requirements.`);
    return [];
  }

  logger.debug(`Fetching equipment requirements for ymm_id: ${ymmId}, service_id: ${job.service_id}`);

  // 2. Query the unified equipment_requirements table
  try {
    const { data, error } = await supabase
      .from('equipment_requirements') // Query the unified table
      .select('equipment_model') // Select the model name/identifier
      .eq('ymm_id', ymmId)
      .eq('service_id', job.service_id);

    if (error) {
      logger.error(`Error fetching equipment requirements for ymm_id ${ymmId}, service_id ${job.service_id}:`, error);
      return []; // Return empty array on error
    }

    if (!data || data.length === 0) {
      // No specific requirements found - check for generic category tool
      logger.debug(`No specific equipment requirements found for ymm_id ${ymmId}, service_id ${job.service_id}. Checking for generic category tool...`);
      
      // --- BEGIN FALLBACK LOGIC ---
      try {
        // Get service category for fallback
        const { data: serviceData, error: serviceError } = await supabase
          .from('services')
          .select('service_category')
          .eq('id', job.service_id)
          .single();

        if (serviceError || !serviceData?.service_category) {
          logger.warn(`Could not determine service category for service_id ${job.service_id}: ${serviceError?.message || 'No data'}`);
          return [];
        }

        const genericModelName = serviceData.service_category; // e.g., 'prog'
        const { data: genericData, error: genericError } = await supabase
            .from('equipment')
            .select('model')
            .eq('equipment_type', genericModelName)
            .eq('model', genericModelName) // Find where model AND type match category name
            .limit(1);

        if (genericError) {
            logger.warn(`Error checking for generic equipment '${genericModelName}': ${genericError.message}`);
            return []; // Return empty on error
        }

        if (genericData && genericData.length > 0) {
            logger.debug(`Found generic equipment requirement: ${genericModelName}`);
            return [genericModelName]; // Return the category name as the required model
        } else {
            logger.debug(`No generic equipment requirement found for category '${genericModelName}'.`);
            return []; // Return empty if no generic found either
        }
      } catch (fallbackError: any) {
        logger.error(`Error during generic equipment fallback check: ${fallbackError.message}`);
        return [];
      }
      // --- END FALLBACK LOGIC ---
    }

    // Extract the equipment model strings from the result
    const requiredModels = data.map(req => req.equipment_model).filter(model => !!model); // Filter out any null/empty strings
    logger.debug(`Required equipment models for Job ID ${job.id}: [${requiredModels.join(', ')}]`);
    return requiredModels;

  } catch (fetchError: any) {
     logger.error(`Exception during equipment requirement fetch for job ${job.id}:`, fetchError);
     return [];
  }
}

// Example usage (can be removed later)
/*
async function runRequirementExample() {
  try {
    // Fetch a relevant job first (ensure it includes service details)
    const jobs = await getRelevantJobs(); // Assuming getRelevantJobs is defined elsewhere
    if (jobs.length > 0) {
        const testJob = jobs.find(j => j.service?.service_category); // Find a job with a service
        if(testJob){
            logger.info(`Testing with Job ID: ${testJob.id}, Order ID: ${testJob.order_id}, Service ID: ${testJob.service_id}`);
            const requiredEquipment = await getRequiredEquipmentForJob(testJob);
            logger.info(`Successfully determined required equipment for job ${testJob.id}:`, requiredEquipment);
        } else {
             logger.info("Could not find a suitable job with service details for testing.");
        }
    } else {
      logger.info("No relevant jobs found to test requirement fetching.");
    }
  } catch (err) {
    logger.error('Failed to run requirement example:', err);
  }
}
// Assuming getRelevantJobs is available in this scope or imported
// import { getRelevantJobs } from './jobs'; 
// runRequirementExample(); 
*/ 