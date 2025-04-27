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
 * Scenario: Creates a single order with multiple jobs where the equipment
 *           required for each job (implied by service_id) is available
 *           in the baseline, but split across different technicians/vans.
 *
 * Expected Outcome: The scheduler should face difficulty scheduling these jobs
 *                   as a single bundle to one technician due to equipment constraints.
 *                   It might need to split the bundle or schedule jobs sequentially.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_bundle_equipment_conflict(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'bundle_equipment_conflict';
  const insertedIds: ScenarioSeedResult['insertedIds'] = {
    orders: [],
    jobs: [],
  };

  logInfo(`Starting scenario seeding: ${scenarioName}...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds || baselineRefs.customerIds.length === 0) {
      throw new Error('No user/customer IDs found in baseline references.');
    }
    // We need at least two services that imply different equipment
    // assigned to different vans/technicians in the baseline.
    // This script *assumes* the first two service IDs in baselineRefs
    // meet this criteria based on how baseline was seeded.
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 2) {
      throw new Error('Insufficient service IDs (< 2) found in baseline references for this scenario.');
    }
    const userId = baselineRefs.customerIds[0];
    const serviceId1 = baselineRefs.serviceIds[0];
    const serviceId2 = baselineRefs.serviceIds[1];
    // We also assume an address is available
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
        throw new Error('No address IDs found in baseline references.');
    }
    const addressId = baselineRefs.addressIds[0];

    // --- 1. Create the Order ---
    const orderData: TablesInsert<'orders'>[] = [
      {
        user_id: userId,
        address_id: addressId, // Use a common address for the jobs
        notes: `Order for ${scenarioName} scenario. Requires services ${serviceId1} & ${serviceId2}.`,
      }
    ];

    const { data: newOrders, error: orderError } = await insertData(
      supabaseAdmin,
      'orders',
      orderData,
      'Order for bundle conflict'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);

    // --- 2. Create Multiple Jobs for the Order ---
    const jobData: TablesInsert<'jobs'>[] = [
      {
        order_id: orderId,
        service_id: serviceId1, // Requires equipment set 1 (assumed from baseline)
        address_id: addressId, // Same address as order
        status: 'queued',
        priority: 2,
        job_duration: 60,
        notes: `Job 1 for bundle conflict, service ${serviceId1}`,
      },
      {
        order_id: orderId,
        service_id: serviceId2, // Requires equipment set 2 (assumed from baseline)
        address_id: addressId, // Same address as order
        status: 'queued',
        priority: 2,
        job_duration: 75, // Slightly different duration
        notes: `Job 2 for bundle conflict, service ${serviceId2}`,
      },
    ];

    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      jobData,
      'Jobs for bundle conflict'
    );

    if (jobError || !newJobs || newJobs.length < jobData.length) {
      throw new Error(
        `Failed to insert all jobs: ${jobError?.message || 'Incorrect data returned'}`
      );
    }
    insertedIds.jobs = newJobs.map(job => job.id);
    logInfo(`Created jobs with IDs: ${insertedIds.jobs.join(', ')}`);

    // --- Completion ---
    logInfo(`Scenario seeding completed: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds,
    };

  } catch (error) {
    logError(`Error during scenario seeding (${scenarioName}):`, error);
    throw error; // Re-throw for the main script
  }
}
