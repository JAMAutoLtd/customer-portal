import type { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import type { Database, Tables, Enums, TablesInsert } from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { insertData, logInfo, logError } from '../../../utils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Define types using the standard Supabase helpers
type OrderInsert = TablesInsert<'orders'>;
type JobInsert = TablesInsert<'jobs'>;
type AvailabilityExceptionInsert = TablesInsert<'technician_availability_exceptions'>;

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
 * Seeds data for the 'priority_conflict' scenario.
 * Creates high (P1) and low (P5) priority jobs requiring the same technician
 * and time, forcing the scheduler to choose based on priority due to limited capacity.
 * Expected outcome: High-priority job is scheduled, low-priority job is left unscheduled.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @param technicianDbIds - The DB IDs of technicians active in this scenario (ideally just one).
 * @returns Metadata object conforming to ScenarioSeedResult.
 */
export async function seedScenario_priority_conflict(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[]
): Promise<ScenarioSeedResult> {
  const scenarioName = 'priority_conflict';
  logInfo(`Starting scenario seeding: ${scenarioName}`);

  // Use the generic type from ScenarioSeedResult
  const insertedIds: ScenarioSeedResult['insertedIds'] = {
    orders: [],
    jobs: [],
    // Add specific keys dynamically
  };

  // Validate baseline refs
  if (
    !baselineRefs.customerIds?.length ||
    !baselineRefs.addressIds?.length ||
    !baselineRefs.customerVehicleIds?.length ||
    !baselineRefs.serviceIds?.length
  ) {
    throw new Error(`BaselineRefs is missing required data for ${scenarioName} scenario.`);
  }

  if (technicianDbIds.length === 0) {
    throw new Error(`No technicians provided for ${scenarioName} scenario.`);
  }
  // This scenario is most effective with limited capacity, ideally one technician.
  if (technicianDbIds.length > 1) {
      logInfo(`Warning: ${scenarioName} scenario designed for 1 technician to force conflict, but ${technicianDbIds.length} provided.`);
  }
  const targetTechId = technicianDbIds[0]; // Use the first available tech

  // --- Seed Orders and Jobs ---
  const customerId = getRandomElement(baselineRefs.customerIds);
  const addressId = baselineRefs.addressIds[faker.number.int({ min: 0, max: baselineRefs.addressIds.length - 1 })];
  const serviceId = baselineRefs.serviceIds[faker.number.int({ min: 0, max: baselineRefs.serviceIds.length - 1 })];
  // Get a vehicle ID from baseline refs
  if (!baselineRefs.customerVehicleIds || baselineRefs.customerVehicleIds.length === 0) {
    throw new Error('BaselineRefs is missing customerVehicleIds.');
  }
  const vehicleId = baselineRefs.customerVehicleIds[faker.number.int({ min: 0, max: baselineRefs.customerVehicleIds.length - 1 })];
  const jobDuration = 240; // 4 hours - likely to cause conflict in an 8-hour window

  // High Priority Order & Job
  const orderHigh: OrderInsert = { user_id: customerId, address_id: addressId, vehicle_id: vehicleId, notes: 'High priority conflict order' };
  // Pass as array
  const { data: insertedOrderHigh, error: orderHighError } = await insertData(supabaseAdmin, 'orders', [orderHigh], `Order for high priority job`);
  if (orderHighError || !insertedOrderHigh || insertedOrderHigh.length === 0) throw orderHighError || new Error('Failed to insert high priority order');
  const createdOrderHighId = insertedOrderHigh[0].id;

  const jobHigh: JobInsert = {
    order_id: createdOrderHighId,
    service_id: serviceId,
    address_id: addressId,
    status: 'queued' as Enums<'job_status'>,
    priority: 1, // High Priority
    notes: `High priority job (${jobDuration} min) for conflict test.`,
    job_duration: jobDuration,
    assigned_technician: null, // Let scheduler decide
    estimated_sched: null,
    fixed_assignment: false,
    fixed_schedule_time: null,
    requested_time: null,
    technician_notes: null,
  };
  // Pass as array
  const { data: insertedJobHigh, error: jobHighError } = await insertData(supabaseAdmin, 'jobs', [jobHigh], `High priority job`);
  if (jobHighError || !insertedJobHigh || insertedJobHigh.length === 0) throw jobHighError || new Error('Failed to insert high priority job');
  const createdJobHighId = insertedJobHigh[0].id;

  // Low Priority Order & Job
  const orderLow: OrderInsert = { user_id: customerId, address_id: addressId, vehicle_id: vehicleId, notes: 'Low priority conflict order' };
  // Pass as array
  const { data: insertedOrderLow, error: orderLowError } = await insertData(supabaseAdmin, 'orders', [orderLow], `Order for low priority job`);
  if (orderLowError || !insertedOrderLow || insertedOrderLow.length === 0) throw orderLowError || new Error('Failed to insert low priority order');
  const createdOrderLowId = insertedOrderLow[0].id;

  const jobLow: JobInsert = {
    order_id: createdOrderLowId,
    service_id: serviceId, // Same service, same location
    address_id: addressId,
    status: 'queued' as Enums<'job_status'>,
    priority: 5, // Low Priority
    notes: `Low priority job (${jobDuration} min) for conflict test. Should be dropped. `,
    job_duration: jobDuration,
    assigned_technician: null,
    estimated_sched: null,
    fixed_assignment: false,
    fixed_schedule_time: null,
    requested_time: null,
    technician_notes: null,
  };
  // Pass as array
  const { data: insertedJobLow, error: jobLowError } = await insertData(supabaseAdmin, 'jobs', [jobLow], `Low priority job`);
  if (jobLowError || !insertedJobLow || insertedJobLow.length === 0) throw jobLowError || new Error('Failed to insert low priority job');
  const createdJobLowId = insertedJobLow[0].id;

  logInfo(`Finished scenario seeding: ${scenarioName}. High Prio Job: ${createdJobHighId}, Low Prio Job: ${createdJobLowId}.`);

  insertedIds.orders = [createdOrderHighId, createdOrderLowId];
  insertedIds.jobs = [createdJobHighId, createdJobLowId];
  insertedIds.highPriorityJobId = [createdJobHighId];
  insertedIds.lowPriorityJobId = [createdJobLowId];

  // Link services
  const orderServicesData = [
      { order_id: createdOrderHighId, service_id: serviceId },
      { order_id: createdOrderLowId, service_id: serviceId },
  ];
  // Already an array
  await insertData(supabaseAdmin, 'order_services', orderServicesData, 'Link services for priority conflict');

  return {
    scenarioName: scenarioName,
    insertedIds,
  };
}
