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
 * Seeds the database for the 'long_duration_job' scenario.
 *
 * Goal: Create one job with an unusually long duration (e.g., 4+ hours)
 * alongside several normal-duration jobs to test capacity impact.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds The DB IDs of the technicians seeded for this run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_long_duration_job(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept DB IDs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'long_duration_job';
  logInfo(`Seeding scenario: ${scenarioName} with ${technicianDbIds.length} technicians available...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds?.length) {
      throw new Error('BaselineRefs missing required customerIds');
    }
    if (!baselineRefs.addressIds?.length) {
      throw new Error('BaselineRefs missing required addressIds');
    }
    // Need at least 2 services for variety
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 2) {
        throw new Error('BaselineRefs missing required serviceIds (need >= 2)');
    }
    const customerUserId = baselineRefs.customerIds[0];
    const customerAddressId = baselineRefs.addressIds[0];
    const serviceIdLong = baselineRefs.serviceIds[0]; // Service for the long job
    const serviceIdNormal = baselineRefs.serviceIds[1]; // Service for normal jobs

    // --- 1. Create Order ---
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

    // --- 2. Create Long Duration Job and Normal Jobs ---
    const jobsToCreate: TablesInsert<'jobs'>[] = [];
    const LONG_DURATION_MINUTES = 240; // 4 hours
    const numberOfNormalJobs = 2;

    // Long duration job
    jobsToCreate.push({
        order_id: orderId,
        address_id: customerAddressId,
        service_id: serviceIdLong,
        status: 'pending_review',
        priority: 5,
        job_duration: LONG_DURATION_MINUTES,
        fixed_assignment: false,
        notes: `LONG DURATION job (${LONG_DURATION_MINUTES} min) for ${scenarioName}.`
    });

    // Normal duration jobs
    for (let i = 0; i < numberOfNormalJobs; i++) {
        jobsToCreate.push({
            order_id: orderId,
            address_id: customerAddressId,
            service_id: serviceIdNormal,
            status: 'pending_review',
            priority: faker.number.int({ min: 1, max: 3 }), // Lower priority
            job_duration: faker.number.int({ min: 45, max: 90 }),
            fixed_assignment: false,
            notes: `Normal duration job ${i + 1} for ${scenarioName}.`
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
        technicianDbIds: technicianDbIds,
      },
    };

  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error;
  }
}
