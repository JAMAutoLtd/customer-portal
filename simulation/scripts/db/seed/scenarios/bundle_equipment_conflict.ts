import { faker } from '@faker-js/faker';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type TablesInsert,
  insertData,
  logError,
  logInfo,
  type Enums,
} from '../../../utils'; // Assuming utils/index.ts is two levels up
import type { BaselineRefs, ScenarioSeedResult } from './types';

/**
 * Seeds the database for the 'bundle_equipment_conflict' scenario.
 *
 * Goal: Create a multi-job order where the required equipment for the jobs
 * is split across different technicians, making it impossible for a single
 * technician to handle the entire order/bundle.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds Accept DB IDs, even if unused here
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_bundle_equipment_conflict(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept DB IDs, even if unused here
): Promise<ScenarioSeedResult> {
  const scenarioName = 'bundle_equipment_conflict';
  logInfo(`Seeding scenario: ${scenarioName} with ${technicianDbIds.length} technicians available...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds?.length) {
      throw new Error('BaselineRefs missing required customerIds');
    }
    if (!baselineRefs.addressIds?.length) {
      throw new Error('BaselineRefs missing required addressIds');
    }
    // Need at least two distinct services that imply different equipment types.
    // We'll assume the first two service IDs meet this criteria based on baseline.
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 2) {
        throw new Error('BaselineRefs missing required serviceIds (need >= 2)');
    }
    const serviceId1 = baselineRefs.serviceIds[0]; // Implies Equipment Type A
    const serviceId2 = baselineRefs.serviceIds[1]; // Implies Equipment Type B
    const customerUserId = baselineRefs.customerIds[0];
    const customerAddressId = baselineRefs.addressIds[0];

    // --- 1. Create Order ---
    const orderRecord: TablesInsert<'orders'> = {
        user_id: customerUserId,
        address_id: customerAddressId,
        repair_order_number: `RO-${faker.string.alphanumeric(8)}`,
        earliest_available_time: faker.date.soon({ days: 1 }).toISOString(),
        notes: `Order for ${scenarioName}. Requires services ${serviceId1} & ${serviceId2}.`
    };
    const { data: orderData, error: orderError } = await insertData<'orders'>(supabase, 'orders', [orderRecord], 'id');
    if (orderError || !orderData || orderData.length === 0) {
      throw new Error(`Failed to insert order: ${orderError?.message}`);
    }
    const orderId = orderData[0].id;
    logInfo(`Created order (ID: ${orderId}) for ${scenarioName}.`);

    // --- 2. Create Jobs with Conflicting Equipment Needs ---
    // Job 1 requires Service 1 (implying Equipment Type A)
    const jobRecord1: TablesInsert<'jobs'> = {
        order_id: orderId,
        address_id: customerAddressId,
        service_id: serviceId1,
        status: 'pending_review',
        priority: 5,
        job_duration: 45,
        notes: `Job 1 for ${scenarioName}, requires equip for service ${serviceId1}`
    };

    // Job 2 requires Service 2 (implying Equipment Type B)
    const jobRecord2: TablesInsert<'jobs'> = {
        order_id: orderId,
        address_id: customerAddressId,
        service_id: serviceId2,
        status: 'pending_review',
        priority: 5,
        job_duration: 55,
        notes: `Job 2 for ${scenarioName}, requires equip for service ${serviceId2}`
    };

    // Insert both jobs
    const { data: jobData, error: jobError } = await insertData<'jobs'>(supabase, 'jobs', [jobRecord1, jobRecord2], 'id');
    if (jobError || !jobData || jobData.length < 2) {
      throw new Error(`Failed to insert jobs: ${jobError?.message || 'Did not insert expected number of jobs'}`);
    }
    const jobIds = jobData.map(j => j.id);
    logInfo(`Created jobs (IDs: ${jobIds.join(', ')}) for ${scenarioName}.`);

    // --- 3. Return Result ---
    // Note: This script relies on the external technician seeding (`seedScenarioTechnicians`)
    // ensuring that equipment implied by serviceId1 and serviceId2 is assigned to
    // DIFFERENT technicians/vans, creating the conflict.
    logInfo(`Successfully seeded scenario: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds: {
        orders: [orderId],
        jobs: jobIds,
        // No equipment or technicians created directly by this script
      },
    };

  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error;
  }
}
