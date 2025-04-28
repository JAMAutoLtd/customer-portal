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
 * Seeds the database for the 'fixed_time_future_overflow' scenario.
 *
 * Goal: Create several jobs for tomorrow, including one with a fixed time,
 * potentially causing scheduling overflow or conflicts due to capacity constraints.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds Accept DB IDs, even if unused here
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_fixed_time_future_overflow(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept DB IDs, even if unused here
): Promise<ScenarioSeedResult> {
  const scenarioName = 'fixed_time_future_overflow';
  logInfo(`Seeding scenario: ${scenarioName} with ${technicianDbIds.length} technicians available...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds?.length) {
      throw new Error('BaselineRefs missing required customerIds');
    }
    if (!baselineRefs.addressIds?.length) {
      throw new Error('BaselineRefs missing required addressIds');
    }
    // Need several service IDs for variety
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 3) {
        throw new Error('BaselineRefs missing required serviceIds (need >= 3)');
    }
    const customerUserId = baselineRefs.customerIds[0];
    const customerAddressId = baselineRefs.addressIds[0];
    const serviceId1 = baselineRefs.serviceIds[0];
    const serviceId2 = baselineRefs.serviceIds[1];
    const serviceId3 = baselineRefs.serviceIds[2]; // For the fixed time job

    // --- 1. Create Order ---
    const orderRecord: TablesInsert<'orders'> = {
        user_id: customerUserId,
        address_id: customerAddressId,
        repair_order_number: `RO-${faker.string.alphanumeric(8)}`,
        // Earliest available is tomorrow, aligning with job scheduling
        earliest_available_time: faker.date.soon({ days: 1 }).toISOString(),
        notes: `Order for ${scenarioName}.`
    };
    const { data: orderData, error: orderError } = await insertData<'orders'>(supabase, 'orders', [orderRecord], 'id');
    if (orderError || !orderData || orderData.length === 0) {
      throw new Error(`Failed to insert order: ${orderError?.message}`);
    }
    const orderId = orderData[0].id;
    logInfo(`Created order (ID: ${orderId}) for ${scenarioName}.`);

    // --- 2. Create Jobs for Tomorrow (to potentially fill capacity) ---
    const jobsToCreate: TablesInsert<'jobs'>[] = [];
    const numberOfFillerJobs = 3; // Adjust as needed based on expected capacity

    for (let i = 0; i < numberOfFillerJobs; i++) {
        jobsToCreate.push({
            order_id: orderId,
            address_id: customerAddressId,
            service_id: i % 2 === 0 ? serviceId1 : serviceId2, // Alternate services
            status: 'pending_review',
            priority: faker.number.int({ min: 1, max: 5 }), // Vary priority
            job_duration: faker.number.int({ min: 45, max: 120 }), // Vary duration
            fixed_assignment: false, // Explicitly set default value
            notes: `Filler job ${i + 1} for ${scenarioName}. Scheduled for tomorrow.`
            // Request time could be set to tomorrow explicitly if needed by scheduler logic
            // requested_time: faker.date.soon({ days: 1, refDate: new Date(Date.now() + 86400000) }).toISOString()
        });
    }

    // --- 3. Create Fixed Time Job for Tomorrow ---
    const fixedTimeTomorrow = new Date();
    fixedTimeTomorrow.setDate(fixedTimeTomorrow.getDate() + 1); // Set to tomorrow
    fixedTimeTomorrow.setHours(11, 0, 0, 0); // Set fixed time to 11:00 AM tomorrow

    jobsToCreate.push({
        order_id: orderId,
        address_id: customerAddressId,
        service_id: serviceId3,
        status: 'fixed_time',
        priority: 10, // High priority
        job_duration: 75,
        fixed_schedule_time: fixedTimeTomorrow.toISOString(),
        fixed_assignment: false, // Explicitly set default value (even for fixed time)
        notes: `Job for ${scenarioName}, fixed for TOMORROW ${fixedTimeTomorrow.toLocaleString()}`
    });

    // --- 4. Insert All Jobs ---
    const { data: jobData, error: jobError } = await insertData<'jobs'>(supabase, 'jobs', jobsToCreate, 'id');
    if (jobError || !jobData || jobData.length !== jobsToCreate.length) {
      throw new Error(`Failed to insert all jobs: ${jobError?.message || 'Incorrect number of jobs inserted'}`);
    }
    const jobIds = jobData.map(j => j.id);
    logInfo(`Created ${jobIds.length} jobs (IDs: ${jobIds.join(', ')}) for ${scenarioName}.`);

    // --- 5. Return Result ---
    logInfo(`Successfully seeded scenario: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds: {
        orders: [orderId],
        jobs: jobIds,
      },
    };

  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error;
  }
}
