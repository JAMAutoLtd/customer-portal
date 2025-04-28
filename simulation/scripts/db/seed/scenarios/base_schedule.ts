import type { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
// Import types and utils from the central utils file
import type { Database, Tables, Enums, TablesInsert } from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { insertData, logInfo, logError, seedScenarioTechnicians } from '../../../utils';
// Import baseline data needed for tech creation
import { authUsersData, publicUsersData, techniciansData } from '../baseline-data'; 

// Define types using the standard Supabase helpers
type OrderRow = Tables<'orders'>;
type JobRow = Tables<'jobs'>;
type OrderInsert = TablesInsert<'orders'>;
type JobInsert = TablesInsert<'jobs'>;
type UserInsert = TablesInsert<'users'>;
type TechnicianInsert = TablesInsert<'technicians'>;

// Helper to pick a random element from an array
function getRandomElement<T>(arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot get random element from an empty array.');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// Explicitly define IDs for generally available, non-ADAS services
const BASIC_SERVICE_IDS = [6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19];

/**
 * Seeds data for the 'base_schedule' scenario.
 * Creates technicians based on count using utility function, then standard orders and associated jobs.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data (excluding technicians).
 * @param technicianCount - The number of technicians to create for this scenario.
 * @returns Metadata object conforming to ScenarioSeedResult.
 */
export async function seedScenario_base_schedule(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianCount: number // Parameter remains
): Promise<ScenarioSeedResult> {
  logInfo(`Starting scenario seeding: base_schedule with ${technicianCount} technicians`);
  const scenarioName = 'base_schedule';

  // Validate technicianCount (can be kept here or solely in utility)
  if (![1, 2, 3, 4].includes(technicianCount)) {
     throw new Error(`Invalid technicianCount (${technicianCount}). Must be 1, 2, 3, or 4.`);
  }

  // Validate baseline refs needed for this scenario (keep vanIds check)
  if (
    !baselineRefs.customerIds?.length ||
    !baselineRefs.addressIds?.length ||
    !baselineRefs.customerVehicleIds?.length ||
    !baselineRefs.serviceIds?.length ||
    !baselineRefs.equipmentIds?.length || 
    !baselineRefs.vanIds?.length // Need van IDs from baseline
  ) {
    throw new Error(
      'BaselineRefs is missing required data (customers, addresses, vehicles, services, equipment, vans) for base_schedule scenario.'
    );
  }

  // --- Seed Technicians using Utility Function --- 
  const techResult = await seedScenarioTechnicians(
      supabaseAdmin,
      technicianCount,
      baselineRefs.vanIds // Pass available van IDs from baseline
  );

  // --- Seed Orders and Jobs (using baseline customers/addresses/vehicles) --- 
  const ordersToCreate: OrderInsert[] = [];
  const jobTemplates: Omit<JobInsert, 'order_id'>[] = [];
  const numberOfOrders = 10; // Or make dynamic based on techCount?

  for (let i = 0; i < numberOfOrders; i++) {
    const customerId = getRandomElement(baselineRefs.customerIds);
    const addressId = getRandomElement(baselineRefs.addressIds);
    const vehicleId = getRandomElement(baselineRefs.customerVehicleIds);
    const serviceId = getRandomElement(BASIC_SERVICE_IDS);

    const order: OrderInsert = {
      user_id: customerId,
      address_id: addressId,
      vehicle_id: vehicleId,
      notes: `Base schedule order ${i + 1}`,
      earliest_available_time: null,
      repair_order_number: null,
      invoice: null,
    };
    ordersToCreate.push(order);

    const jobTemplate: Omit<JobInsert, 'order_id'> = {
      service_id: serviceId,
      address_id: addressId,
      status: 'queued' as Enums<'job_status'>,
      priority: 2,
      notes: faker.lorem.sentence(),
      job_duration: faker.number.int({ min: 60, max: 180 }),
      assigned_technician: null,
      estimated_sched: null,
      fixed_assignment: false,
      fixed_schedule_time: null,
      requested_time: null,
      technician_notes: null,
    };
    jobTemplates.push(jobTemplate);
  }

  // --- Insert Orders and capture returned data ---
  const { data: insertedOrdersData, error: orderError } = await insertData(
    supabaseAdmin,
    'orders',
    ordersToCreate,
    'Base scenario orders'
  );

  if (orderError) {
    logError('Error inserting orders', orderError);
    throw orderError;
  }
  const insertedOrders: OrderRow[] = insertedOrdersData ?? [];

  if (insertedOrders.length !== numberOfOrders) {
    logInfo(`Warning: Expected ${numberOfOrders} orders to be inserted, but received ${insertedOrders.length}`);
  }

  const createdOrderIds = insertedOrders.map(o => o.id).filter(id => id !== undefined && id !== null) as number[];

  // --- Construct and Insert Jobs using the returned Order IDs ---
  const jobsToCreate: JobInsert[] = [];
  for (let i = 0; i < numberOfOrders; i++) {
    const orderId = insertedOrders[i]?.id;
    if (orderId === undefined || orderId === null) {
      logInfo(`Warning: Order ID at index ${i} is missing from returned data. Skipping corresponding job.`);
      continue;
    }
    const jobTemplate = jobTemplates[i];
    const job: JobInsert = {
      ...jobTemplate,
      order_id: orderId,
      address_id: jobTemplate.address_id,
      service_id: jobTemplate.service_id,
      status: jobTemplate.status,
      priority: jobTemplate.priority,
      notes: jobTemplate.notes,
      job_duration: jobTemplate.job_duration,
      assigned_technician: jobTemplate.assigned_technician,
      estimated_sched: jobTemplate.estimated_sched,
      fixed_assignment: jobTemplate.fixed_assignment,
      fixed_schedule_time: jobTemplate.fixed_schedule_time,
      requested_time: jobTemplate.requested_time,
      technician_notes: jobTemplate.technician_notes,
    };
    jobsToCreate.push(job);
  }

  // --- Insert Jobs and capture returned data ---
  let { data: insertedJobsData, error: jobError } = await insertData(
    supabaseAdmin,
    'jobs',
    jobsToCreate,
    'Base scenario jobs'
  );

  if (jobError) {
    logError('Error inserting jobs', jobError);
    throw jobError;
  }
  let insertedJobs: JobRow[] = insertedJobsData ?? [];
  if (!insertedJobsData) {
    logInfo('No job data returned after insert call (potentially expected if no jobs were created).');
  }

  // Filter out potential null/undefined IDs
  const createdJobIds = insertedJobs.map(j => j.id).filter(id => id !== undefined && id !== null) as number[];

  logInfo(
    `Finished scenario seeding: ${scenarioName}. Created ${techResult.createdTechnicianAuthIds.length} techs, ${createdOrderIds.length} orders, ${createdJobIds.length} jobs.`
  );

  // Return metadata including created technician IDs and DB IDs
  return {
    scenarioName: scenarioName,
    insertedIds: {
      orders: createdOrderIds,
      jobs: createdJobIds,
      technicianIds: techResult.createdTechnicianAuthIds, // Auth IDs
      technicianDbIds: techResult.createdTechnicianDbIds, // DB IDs from utility result
      vanIds: techResult.assignedVanIds,
    },
  };
}
