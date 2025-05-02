import { supabase } from './client';
import { Job, JobStatus, Address, Service } from '../types/database.types';
import { logger } from '../utils/logger';

// Define the job statuses relevant for the replanning process
const RELEVANT_JOB_STATUSES: JobStatus[] = [
  'queued',
  'en_route',
  'in_progress',
  'fixed_time',
];

/**
 * Fetches jobs with statuses relevant to the replanning process.
 * Includes 'queued', 'en_route', 'in_progress', and 'fixed_time' jobs.
 * Joins address and service details for convenience.
 *
 * @returns {Promise<Job[]>} A promise that resolves to an array of relevant jobs.
 */
export async function getRelevantJobs(): Promise<Job[]> {
  if (!supabase) throw new Error("Supabase client not initialized");

  console.log(`Fetching jobs with statuses: ${RELEVANT_JOB_STATUSES.join(', ')}...`);

  let data: any[] | null = null;
  let error: any = null;

  try {
    const response = await supabase
      .from('jobs')
      .select(`
        id,
        order_id,
        assigned_technician,
        address_id,
        priority,
        status,
        requested_time,
        estimated_sched,
        job_duration,
        notes,
        technician_notes,
        service_id,
        fixed_assignment,
        fixed_schedule_time,
        addresses ( id, street_address, lat, lng ),
        services ( id, service_name, service_category ),
        order_details:orders ( 
          earliest_available_time,
          vehicle_id, 
          customer_vehicles ( make, model, year ) 
        )
      `)
      // Filter for statuses IN the list OR status IS NULL
      .or(`status.in.(${RELEVANT_JOB_STATUSES.map(s => `"${s}"`).join(',')}),status.is.null`);

    console.log('Raw Supabase response (jobs):', JSON.stringify(response, null, 2)); // Log raw response
    data = response.data;
    error = response.error;

  } catch (fetchError) {
    logger.error('Error during Supabase fetch operation (jobs):', fetchError);
    throw fetchError;
  }

  if (error) {
    logger.error('Error object details from Supabase response (jobs):', JSON.stringify(error, null, 2));
    // It seems error.message might be undefined, let's provide a fallback
    const errorMessage = error.message || 'Unknown error structure';
    throw new Error(`Failed to fetch jobs: ${errorMessage}`);
  }

  if (!data || data.length === 0) {
    logger.warn('No relevant jobs found.');
    return [];
  }

  console.log(`Fetched ${data.length} relevant jobs.`);

  // Map the raw data to the Job interface, handling joined data
  const jobs: Job[] = data.map((job: any) => {
    // PostgREST returns joined one-to-one relations as objects, not arrays.
    // Handle potential null/undefined object before casting.
    const address = (job.addresses && typeof job.addresses === 'object' && !Array.isArray(job.addresses))
        ? job.addresses as Address
        : undefined;
    const service = (job.services && typeof job.services === 'object' && !Array.isArray(job.services))
        ? job.services as Service
        : undefined;
    const orderData = (job.order_details && typeof job.order_details === 'object' && !Array.isArray(job.order_details))
        ? job.order_details as { earliest_available_time: string | null; created_at?: string }
        : undefined;

    // Add logging to check mapped values
    // console.log(`Job ${job.id} Mapped Address: ${JSON.stringify(address)}`);
    // console.log(`Job ${job.id} Mapped Service: ${JSON.stringify(service)}`);

    return {
      id: job.id,
      order_id: job.order_id,
      assigned_technician: job.assigned_technician,
      address_id: job.address_id,
      priority: job.priority,
      status: job.status as JobStatus, // Assume status matches our enum
      requested_time: job.requested_time,
      estimated_sched: job.estimated_sched,
      job_duration: job.job_duration,
      notes: job.notes,
      technician_notes: job.technician_notes,
      service_id: job.service_id,
      fixed_assignment: job.fixed_assignment,
      fixed_schedule_time: job.fixed_schedule_time,
      address: address,
      service: service,
      order_details: orderData,
    };
  });

  return jobs;
}

/**
 * Fetches jobs based on a specific list of statuses.
 * Joins address and service details for convenience.
 *
 * @param {JobStatus[]} statuses - An array of job statuses to filter by.
 * @returns {Promise<Job[]>} A promise that resolves to an array of jobs matching the statuses.
 */
export async function getJobsByStatus(statuses: JobStatus[]): Promise<Job[]> {
  if (!supabase) throw new Error("Supabase client not initialized");
  if (!statuses || statuses.length === 0) {
    logger.warn('getJobsByStatus called with empty status list. Returning empty array.');
    return [];
  }
  console.log(`Fetching jobs with statuses: ${statuses.join(', ')}...`);

  const { data, error } = await supabase
    .from('jobs')
    .select(`
      id,
      order_id,
      assigned_technician,
      address_id,
      priority,
      status,
      requested_time,
      estimated_sched,
      job_duration,
      notes,
      technician_notes,
      service_id,
      fixed_assignment,
      fixed_schedule_time,
      addresses ( id, street_address, lat, lng ),
      services ( id, service_name, service_category ),
      order_details:orders ( 
        earliest_available_time,
        vehicle_id, 
        customer_vehicles ( make, model, year ) 
      )
    `)
    // Use the provided statuses array for filtering
    .in('status', statuses);

  if (error) {
    logger.error(`Error fetching jobs with statuses [${statuses.join(', ')}]:`, error);
    throw new Error(`Failed to fetch jobs by status: ${error.message}`);
  }

  if (!data || data.length === 0) {
    logger.warn(`No jobs found with statuses: ${statuses.join(', ')}.`);
    return [];
  }

  console.log(`Fetched ${data.length} jobs with statuses: ${statuses.join(', ')}.`);

  // Map the raw data to the Job interface, handling joined data (same logic as getRelevantJobs)
  const jobs: Job[] = data.map((job: any) => {
    // PostgREST returns joined one-to-one relations as objects, not arrays.
    // Handle potential null/undefined object before casting.
     const address = (job.addresses && typeof job.addresses === 'object' && !Array.isArray(job.addresses))
        ? job.addresses as Address
        : undefined;
    const service = (job.services && typeof job.services === 'object' && !Array.isArray(job.services))
        ? job.services as Service
        : undefined;
    const orderData = (job.order_details && typeof job.order_details === 'object' && !Array.isArray(job.order_details))
        ? job.order_details as { earliest_available_time: string | null; created_at?: string }
        : undefined;

    return {
      id: job.id,
      order_id: job.order_id,
      assigned_technician: job.assigned_technician,
      address_id: job.address_id,
      priority: job.priority,
      status: job.status as JobStatus, // Assume status matches our enum
      requested_time: job.requested_time,
      estimated_sched: job.estimated_sched,
      job_duration: job.job_duration,
      notes: job.notes,
      technician_notes: job.technician_notes,
      service_id: job.service_id,
      fixed_assignment: job.fixed_assignment,
      fixed_schedule_time: job.fixed_schedule_time,
      address: address,
      service: service,
      order_details: orderData,
    };
  });

  return jobs;
}

// Example usage (can be removed later)
/*
getRelevantJobs()
  .then(jobs => {
    console.log('Successfully fetched relevant jobs:');
    console.log(JSON.stringify(jobs, null, 2));
  })
  .catch(err => {
    console.error('Failed to run example:', err);
  });
*/ 