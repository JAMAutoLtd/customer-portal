import { Job, JobBundle, SchedulableJob, SchedulableItem } from '../types/database.types';
import { logger } from '../utils/logger'; // Import logger

/**
 * Groups 'queued' jobs by order_id to create bundles and identify single jobs.
 * Calculates total duration and highest priority for bundles.
 *
 * @param {Job[]} jobsToProcess - An array of jobs with status 'queued'.
 * @returns {SchedulableItem[]} An array containing JobBundle objects and SchedulableJob objects.
 */
export function bundleQueuedJobs(jobsToProcess: Job[]): SchedulableItem[] {
  logger.info(`Processing ${jobsToProcess.length} jobs for bundling...`);
  const jobsByOrderId = new Map<number, Job[]>();
  const schedulableItems: SchedulableItem[] = [];
  const nonFixedTimeJobs: Job[] = [];

  // --- Start: Separate Fixed-Time Jobs --- 
  for (const job of jobsToProcess) {
    if (job.status === 'fixed_time') {
        // Fixed-time jobs are always treated as individual items
        const schedulableJob: SchedulableJob = {
            ...job,
            eligibleTechnicians: [], // To be filled later
            originalItem: job, // Reference original
        };
        schedulableItems.push(schedulableJob);
        logger.debug(`Identified fixed-time Job ID ${job.id} (Order ID ${job.order_id}). Treating as individual item.`);
    } else {
        // Collect non-fixed-time jobs for potential bundling
        nonFixedTimeJobs.push(job);
    }
  }
  logger.info(`Separated ${schedulableItems.length} fixed-time jobs. Processing ${nonFixedTimeJobs.length} remaining jobs for bundling.`);
  // --- End: Separate Fixed-Time Jobs --- 

  // --- Start: Group and Bundle NON-Fixed-Time Jobs --- 
  // Group remaining non-fixed-time jobs by order_id
  for (const job of nonFixedTimeJobs) {
    if (!jobsByOrderId.has(job.order_id)) {
      jobsByOrderId.set(job.order_id, []);
    }
    jobsByOrderId.get(job.order_id)?.push(job);
  }

  // Process each group of non-fixed-time jobs
  for (const [orderId, jobs] of jobsByOrderId.entries()) {
    if (jobs.length > 1) {
      // Create a bundle
      const totalDuration = jobs.reduce((sum, job) => sum + job.job_duration, 0);
      const highestPriority = Math.max(...jobs.map(job => job.priority)); // Higher number means higher priority
      // Assume all jobs in a bundle share the same address_id (as they belong to the same order)
      const addressId = jobs[0].address_id; 
      const address = jobs[0].address;

      const bundle: JobBundle = {
        order_id: orderId,
        jobs: jobs,
        total_duration: totalDuration,
        priority: highestPriority,
        address_id: addressId,
        address: address, // Carry over joined address if available
        required_equipment_models: [], // To be filled in later
        eligible_technician_ids: [], // To be filled in later
      };
      schedulableItems.push(bundle);
      // console.log(`Created bundle for Order ID ${orderId} with ${jobs.length} jobs. Priority: ${highestPriority}, Duration: ${totalDuration} mins.`);
      logger.debug(`Created bundle for Order ID ${orderId} with ${jobs.length} jobs. Priority: ${highestPriority}, Duration: ${totalDuration} mins.`);
    } else if (jobs.length === 1) {
      // Create a single schedulable job item
      const singleJob = jobs[0];
      const schedulableJob: SchedulableJob = {
        ...singleJob, // Extend the Job directly
        eligibleTechnicians: [], // This is defined in SchedulableJob
        originalItem: singleJob, // This is defined in SchedulableJob
      };
      schedulableItems.push(schedulableJob);
       //  console.log(`Identified single Job ID ${singleJob.id} (Order ID ${orderId}). Priority: ${singleJob.priority}, Duration: ${singleJob.job_duration} mins.`);
       logger.debug(`Identified single non-fixed Job ID ${singleJob.id} (Order ID ${orderId}). Priority: ${singleJob.priority}, Duration: ${singleJob.job_duration} mins.`);
    }
  }
  // --- End: Group and Bundle NON-Fixed-Time Jobs --- 

  logger.info(`Created ${schedulableItems.length} total schedulable items (fixed jobs, bundles, or single non-fixed jobs).`);
  return schedulableItems;
}

/**
 * Maps optimization item IDs (which can be 'job_{id}' or 'bundle_{order_id}')
 * back to their constituent job IDs using the provided SchedulableItem map.
 *
 * @param {string[]} itemIds - An array of optimization item IDs.
 * @param {Map<string, SchedulableItem>} eligibleItemMap - A map where keys are item IDs and values are the corresponding SchedulableItem.
 * @returns {Set<number>} A set of unique job IDs corresponding to the input item IDs.
 */
export function mapItemsToJobIds(itemIds: string[], eligibleItemMap: Map<string, SchedulableItem>): Set<number> {
    const jobIds = new Set<number>();
    for (const itemId of itemIds) {
        const item = eligibleItemMap.get(itemId);
        if (!item) {
            // console.warn(`Could not find item with ID '${itemId}' in eligibleItemMap during job ID mapping.`);
            logger.warn(`Could not find item with ID '${itemId}' in eligibleItemMap during job ID mapping.`);
            continue;
        }
        // Check if it's a JobBundle using 'jobs' property
        if ('jobs' in item) {
            item.jobs.forEach(job => jobIds.add(job.id));
        } 
        // Check if it's a SchedulableJob using 'service_id' (present in Job, not Bundle)
        else if ('service_id' in item) { 
            jobIds.add(item.id);
        }
    }
    return jobIds;
}

// Example Usage (requires fetched queued jobs)
/*
import { getRelevantJobs } from '../supabase/jobs'; // Assuming this exists

async function runBundlingExample() {
    try {
        const allJobs = await getRelevantJobs();
        const queuedJobs = allJobs.filter(job => job.status === 'queued');
        
        if (queuedJobs.length > 0) {
            const items = bundleQueuedJobs(queuedJobs);
            console.log('\nBundling Result:');
            console.log(JSON.stringify(items, null, 2));
        } else {
            console.log('No queued jobs found to demonstrate bundling.');
        }
    } catch (error) {
        // console.error('Bundling example failed:', error);
        logger.error('Bundling example failed:', error);
    }
}

// runBundlingExample();
*/ 