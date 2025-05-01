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
 * Seeds data for the 'technician_unavailable_today' scenario.
 * Creates an availability exception for one technician today, making them unavailable
 * for a specific time block (e.g., mid-day time off).
 * Seeds jobs that *could* be assigned to this tech during that block.
 * Expected outcome: The scheduler respects the exception and schedules jobs around it
 * or assigns them to other available technicians.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @param technicianDbIds - The DB IDs of technicians active in this scenario.
 * @returns Metadata object conforming to ScenarioSeedResult.
 */
export async function seedScenario_technician_unavailable_today(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[]
): Promise<ScenarioSeedResult> {
  const scenarioName = 'technician_unavailable_today';
  logInfo(`Starting scenario seeding: ${scenarioName}`);

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

  // --- Define Unavailability ---
  const techToMakeUnavailable = getRandomElement(technicianDbIds);
  const today = dayjs.utc().format('YYYY-MM-DD'); // Format for DB date field

  // Example: Make tech unavailable from 13:00 to 15:00 UTC today
  const timeOffStart = '13:00:00';
  const timeOffEnd = '15:00:00';

  // NOTE: The check constraint requires start/end to be NULL when is_available=false.
  // The scheduler logic MUST correctly interpret 'time_off' for a date without start/end as a full-day off
  // or potentially infer the intended block from elsewhere if needed.
  // For testing a specific block, using 'custom_hours' with is_available=false might be needed if the constraint isn't updated.
  // Let's stick to the PRD/subtask intent for now and use time_off with nulls.
  const exception: AvailabilityExceptionInsert = {
    technician_id: techToMakeUnavailable,
    exception_type: 'time_off',
    date: today,
    is_available: false, // Explicitly unavailable
    start_time: null,    // Per check constraint for is_available=false
    end_time: null,      // Per check constraint for is_available=false
    reason: `Scenario ${scenarioName}: Mid-day break (intended ${timeOffStart}-${timeOffEnd})`,
  };

  // TODO: Implement Case 2 from subtask details: multi-window unavailability using 'custom_hours'

  const { data: insertedExceptionData, error: exceptionError } = await insertData(
    supabaseAdmin,
    'technician_availability_exceptions',
    [exception],
    `${scenarioName} exception`
  );

  if (exceptionError) {
    logError('Error inserting availability exception', exceptionError);
    throw exceptionError;
  }

  const createdExceptionIds = (insertedExceptionData ?? []).map(e => e.id);
  logInfo(`Created time_off exception for Tech ID ${techToMakeUnavailable} on ${today} (Intended ${timeOffStart}-${timeOffEnd} UTC)`);

  // --- Seed Jobs that could fall into the unavailable window ---
  const jobsToCreate: JobInsert[] = [];
  const fillerOrderIds: number[] = [];
  const numberOfJobs = 5; // Create a few jobs

  for (let i = 0; i < numberOfJobs; i++) {
    const customerId = getRandomElement(baselineRefs.customerIds);
    const addressId = getRandomElement(baselineRefs.addressIds);
    const vehicleId = getRandomElement(baselineRefs.customerVehicleIds);
    const serviceId = getRandomElement(BASIC_SERVICE_IDS);

    const order: OrderInsert = { user_id: customerId, address_id: addressId, vehicle_id: vehicleId, notes: `Order for unavailable tech test ${i + 1}` };
    const { data: orderData, error: orderErr } = await insertData(supabaseAdmin, 'orders', [order], `${scenarioName} order ${i + 1}`);
    if (orderErr || !orderData || orderData.length === 0) {
      logError(`Failed to insert order ${i+1}`, orderErr);
      continue;
    }
    const orderId = orderData[0].id;
    fillerOrderIds.push(orderId);

    const job: JobInsert = {
      order_id: orderId,
      service_id: serviceId,
      address_id: addressId,
      status: 'queued' as Enums<'job_status'>,
      priority: 3,
      notes: `Job ${i+1} potentially conflicting with Tech ${techToMakeUnavailable}'s time off.`,
      job_duration: 60,
      // Let the scheduler assign the technician
      assigned_technician: null,
      estimated_sched: null,
      fixed_assignment: false,
      fixed_schedule_time: null,
      requested_time: null,
      technician_notes: null,
    };
    jobsToCreate.push(job);
  }

  const { data: insertedJobsData, error: jobError } = await insertData(
    supabaseAdmin, 'jobs', jobsToCreate, `${scenarioName} jobs`
  );
  if (jobError) {
      logError('Error inserting jobs, but continuing...', jobError);
  }
  const createdJobIds = (insertedJobsData ?? []).map(j => j.id);

  logInfo(`Finished scenario seeding: ${scenarioName}. Tech ${techToMakeUnavailable} unavailable today (intended ${timeOffStart}-${timeOffEnd} UTC). Created Jobs: ${createdJobIds.length}.`);

  return {
    scenarioName: scenarioName,
    insertedIds: {
      jobs: createdJobIds,
      technician_availability_exceptions: createdExceptionIds,
      orders: fillerOrderIds,
    },
  };
}