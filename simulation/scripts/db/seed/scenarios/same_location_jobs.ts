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
 * Seeds the database for the 'same_location_jobs' scenario.
 *
 * Goal: Create multiple jobs for the same order at the same address,
 * testing the scheduler's potential for location-based optimization.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds The DB IDs of the technicians seeded for this run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_same_location_jobs(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept DB IDs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'same_location_jobs';
  logInfo(`Seeding scenario: ${scenarioName} with ${technicianDbIds.length} technicians available...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds?.length) {
      throw new Error('BaselineRefs missing required customerIds');
    }
    if (!baselineRefs.addressIds?.length) {
      throw new Error('BaselineRefs missing required addressIds');
    }
    // Need at least 3 services for variety, or allow reuse if fewer
    if (!baselineRefs.serviceIds?.length) {
        throw new Error('BaselineRefs missing required serviceIds');
    }
    const customerUserId = baselineRefs.customerIds[0];
    const targetAddressId = baselineRefs.addressIds[0]; // Use the same address for all jobs

    // --- 1. Create Order ---
    const orderRecord: TablesInsert<'orders'> = {
        user_id: customerUserId,
        address_id: targetAddressId, // Single address for the order
        repair_order_number: `RO-${faker.string.alphanumeric(8)}`,
        earliest_available_time: faker.date.soon({ days: 1 }).toISOString(),
        notes: `Order for ${scenarioName} at address ID ${targetAddressId}.`
    };
    const { data: orderData, error: orderError } = await insertData<'orders'>(supabase, 'orders', [orderRecord], 'id');
    if (orderError || !orderData || orderData.length === 0) {
      throw new Error(`Failed to insert order: ${orderError?.message}`);
    }
    const orderId = orderData[0].id;
    logInfo(`Created order (ID: ${orderId}) for ${scenarioName} at address ${targetAddressId}.`);

    // --- 2. Create Multiple Jobs at the Same Location ---
    const jobsToCreate: TablesInsert<'jobs'>[] = [];
    const numberOfJobs = 3; // Create 3 jobs at the same location

    for (let i = 0; i < numberOfJobs; i++) {
        // Cycle through available baseline service IDs
        const serviceId = baselineRefs.serviceIds![i % baselineRefs.serviceIds!.length];
        jobsToCreate.push({
            order_id: orderId,
            address_id: targetAddressId, // Same address ID for all jobs
            service_id: serviceId,
            status: 'pending_review',
            priority: faker.number.int({ min: 1, max: 5 }),
            job_duration: faker.number.int({ min: 30, max: 75 }), // Shorter jobs potentially
            fixed_assignment: false,
            notes: `Job ${i + 1} for ${scenarioName} at address ${targetAddressId}.`
        });
    }

    const { data: jobData, error: jobError } = await insertData<'jobs'>(supabase, 'jobs', jobsToCreate, 'id');
    if (jobError || !jobData || jobData.length !== numberOfJobs) {
      throw new Error(`Failed to insert all jobs: ${jobError?.message || 'Incorrect number of jobs inserted'}`);
    }
    const jobIds = jobData.map(j => j.id);
    logInfo(`Created ${jobIds.length} jobs (IDs: ${jobIds.join(', ')}) for ${scenarioName} at address ${targetAddressId}.`);

    // --- 3. Return Result ---
    logInfo(`Successfully seeded scenario: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds: {
        orders: [orderId],
        jobs: jobIds,
        technicianDbIds: technicianDbIds, // Include technician IDs for context
      },
    };

  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error;
  }
}
