import { faker } from '@faker-js/faker';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type TablesInsert,
  insertData,
  logError,
  logInfo,
  type Enums,
} from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';

/**
 * Seeds the database for the 'fixed_time_today' scenario.
 *
 * Goal: Create a job that must be scheduled at a specific time today,
 * testing the scheduler's handling of fixed time constraints.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds Accept DB IDs, even if unused here
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_fixed_time_today(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept DB IDs, even if unused here
): Promise<ScenarioSeedResult> {
  const scenarioName = 'fixed_time_today';
  logInfo(`Seeding scenario: ${scenarioName} with ${technicianDbIds.length} technicians available...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds?.length) {
      throw new Error('BaselineRefs missing required customerIds');
    }
    if (!baselineRefs.addressIds?.length) {
      throw new Error('BaselineRefs missing required addressIds');
    }
    if (!baselineRefs.serviceIds?.length) {
        throw new Error('BaselineRefs missing required serviceIds');
    }
    const serviceId = baselineRefs.serviceIds[0];
    const customerUserId = baselineRefs.customerIds[0];
    const customerAddressId = baselineRefs.addressIds[0];

    // --- 1. Create Order ---
    const orderRecord: TablesInsert<'orders'> = {
        user_id: customerUserId,
        address_id: customerAddressId,
        repair_order_number: `RO-${faker.string.alphanumeric(8)}`,
        earliest_available_time: faker.date.soon({ days: 1 }).toISOString(), // Available starting within the next day
        notes: `Order for ${scenarioName}.`
    };
    const { data: orderData, error: orderError } = await insertData<'orders'>(supabase, 'orders', [orderRecord], 'id');
    if (orderError || !orderData || orderData.length === 0) {
      throw new Error(`Failed to insert order: ${orderError?.message}`);
    }
    const orderId = orderData[0].id;
    logInfo(`Created order (ID: ${orderId}) for ${scenarioName}.`);

    // --- 2. Create Fixed Time Job ---
    const fixedTime = new Date();
    fixedTime.setHours(10, 0, 0, 0); // Set fixed time to 10:00 AM today
    if (fixedTime.getHours() >= 17) {
        // If it's already past work hours, set for tomorrow 10 AM
        fixedTime.setDate(fixedTime.getDate() + 1);
    }

    const jobRecord: TablesInsert<'jobs'> = {
        order_id: orderId,
        address_id: customerAddressId,
        service_id: serviceId,
        status: 'fixed_time', // Status indicating it has a fixed time
        priority: 10, // High priority
        job_duration: 90, // Example duration
        fixed_schedule_time: fixedTime.toISOString(), // Set the fixed time constraint
        fixed_assignment: false, // Scheduler assigns technician
        notes: `Job for ${scenarioName}, fixed for ${fixedTime.toLocaleString()}`
    };

    const { data: jobData, error: jobError } = await insertData<'jobs'>(supabase, 'jobs', [jobRecord], 'id');
    if (jobError || !jobData || jobData.length === 0) {
      throw new Error(`Failed to insert fixed time job: ${jobError?.message}`);
    }
    const jobId = jobData[0].id;
    logInfo(`Created fixed time job (ID: ${jobId}) for ${scenarioName} at ${fixedTime.toLocaleString()}.`);

    // --- 3. Return Result ---
    logInfo(`Successfully seeded scenario: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds: {
        orders: [orderId],
        jobs: [jobId],
      },
    };

  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error;
  }
}
