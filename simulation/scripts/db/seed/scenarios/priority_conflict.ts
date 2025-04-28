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
 * Seeds the database for the 'priority_conflict' scenario.
 *
 * Goal: Create several high-priority and low-priority jobs competing for
 * limited technician capacity within the same timeframe, testing the scheduler's
 * priority handling.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds The DB IDs of the technicians seeded for this run (used to gauge capacity).
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_priority_conflict(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept DB IDs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'priority_conflict';
  logInfo(`Seeding scenario: ${scenarioName} with ${technicianDbIds.length} technicians available...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds?.length) {
      throw new Error('BaselineRefs missing required customerIds');
    }
    if (!baselineRefs.addressIds?.length) {
      throw new Error('BaselineRefs missing required addressIds');
    }
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 2) {
        throw new Error('BaselineRefs missing required serviceIds (need >= 2)');
    }
    const customerUserId = baselineRefs.customerIds[0];
    const customerAddressId = baselineRefs.addressIds[0];
    const serviceIdHigh = baselineRefs.serviceIds[0];
    const serviceIdLow = baselineRefs.serviceIds[1];

    // --- 1. Create Order ---
    // One order can hold all jobs for simplicity
    const orderRecord: TablesInsert<'orders'> = {
        user_id: customerUserId,
        address_id: customerAddressId,
        repair_order_number: `RO-${faker.string.alphanumeric(8)}`,
        earliest_available_time: faker.date.soon({ days: 1 }).toISOString(),
        notes: `Order for ${scenarioName}.`
    };
    const { data: orderData, error: orderError } = await insertData<'orders'>(supabase, 'orders', [orderRecord], 'id');
    if (orderError || !orderData || orderData.length === 0) {
      throw new Error(`Failed to insert order: ${orderError?.message}`);
    }
    const orderId = orderData[0].id;
    logInfo(`Created order (ID: ${orderId}) for ${scenarioName}.`);

    // --- 2. Create High and Low Priority Jobs ---
    const jobsToCreate: TablesInsert<'jobs'>[] = [];
    // Create slightly more jobs than available technicians to force conflict
    const numHighPriority = Math.ceil(technicianDbIds.length / 2) + 1;
    const numLowPriority = Math.ceil(technicianDbIds.length / 2) + 1;
    const HIGH_PRIORITY_VALUE = 10;
    const LOW_PRIORITY_VALUE = 1;

    // High priority jobs
    for (let i = 0; i < numHighPriority; i++) {
        jobsToCreate.push({
            order_id: orderId,
            address_id: customerAddressId,
            service_id: serviceIdHigh,
            status: 'pending_review',
            priority: HIGH_PRIORITY_VALUE,
            job_duration: faker.number.int({ min: 45, max: 90 }),
            fixed_assignment: false,
            notes: `High priority job ${i + 1} for ${scenarioName}.`
        });
    }

    // Low priority jobs
    for (let i = 0; i < numLowPriority; i++) {
        jobsToCreate.push({
            order_id: orderId,
            address_id: customerAddressId,
            service_id: serviceIdLow,
            status: 'pending_review',
            priority: LOW_PRIORITY_VALUE,
            job_duration: faker.number.int({ min: 60, max: 120 }),
            fixed_assignment: false,
            notes: `Low priority job ${i + 1} for ${scenarioName}.`
        });
    }

    // --- 3. Insert All Jobs ---
    const { data: jobData, error: jobError } = await insertData<'jobs'>(supabase, 'jobs', jobsToCreate, 'id');
    if (jobError || !jobData || jobData.length !== jobsToCreate.length) {
      throw new Error(`Failed to insert all jobs: ${jobError?.message || 'Incorrect number of jobs inserted'}`);
    }
    const jobIds = jobData.map(j => j.id);
    logInfo(`Created ${jobIds.length} jobs (IDs: ${jobIds.join(', ')}) for ${scenarioName}.`);

    // --- 4. Return Result ---
    logInfo(`Successfully seeded scenario: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds: {
        orders: [orderId],
        jobs: jobIds,
        // Include technician IDs for test verification context
        technicianDbIds: technicianDbIds,
      },
    };

  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error;
  }
}
