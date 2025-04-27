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
 * Scenario: Creates a single order with multiple jobs scheduled for the
 *           same address, potentially offering optimization opportunities.
 *
 * Expected Outcome: The scheduler might group these jobs together for a single
 *                   technician visit to minimize travel time, depending on
 *                   other constraints like equipment and technician availability.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_same_location_jobs(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'same_location_jobs';
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
    // Need at least 3 services for variety
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 3) {
      throw new Error('Insufficient service IDs (< 3) found for this scenario.');
    }
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
      throw new Error('No address IDs found in baseline references.');
    }
    const userId = baselineRefs.customerIds[0];
    const serviceId1 = baselineRefs.serviceIds[0];
    const serviceId2 = baselineRefs.serviceIds[1];
    const serviceId3 = baselineRefs.serviceIds[2];
    const targetAddressId = baselineRefs.addressIds[0]; // Use the first address

    // --- 1. Create the Order ---
    const orderData: TablesInsert<'orders'>[] = [
      {
        user_id: userId,
        address_id: targetAddressId, // Use the specific address
        notes: `Order for ${scenarioName} scenario at address ${targetAddressId}.`,
      }
    ];

    const { data: newOrders, error: orderError } = await insertData(
      supabaseAdmin,
      'orders',
      orderData,
      'Order for same location jobs'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId} for address ${targetAddressId}`);

    // --- 2. Create Multiple Jobs for the Same Location/Order ---
    const jobData: TablesInsert<'jobs'>[] = [
      {
        order_id: orderId,
        service_id: serviceId1,
        address_id: targetAddressId, // Same address
        status: 'queued',
        priority: 2,
        job_duration: 60,
        notes: `Job 1 for same location, service ${serviceId1}`,
        fixed_assignment: false,
      },
      {
        order_id: orderId,
        service_id: serviceId2,
        address_id: targetAddressId, // Same address
        status: 'queued',
        priority: 3, // Different priority
        job_duration: 45,
        notes: `Job 2 for same location, service ${serviceId2}`,
        fixed_assignment: false,
      },
      {
        order_id: orderId,
        service_id: serviceId3,
        address_id: targetAddressId, // Same address
        status: 'queued',
        priority: 2,
        job_duration: 75,
        notes: `Job 3 for same location, service ${serviceId3}`,
        fixed_assignment: false,
      },
    ];

    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      jobData,
      'Jobs for same location'
    );

    if (jobError || !newJobs || newJobs.length < jobData.length) {
      throw new Error(
        `Failed to insert all jobs for same location: ${jobError?.message || 'Incorrect data returned'}`
      );
    }
    insertedIds.jobs = newJobs.map(job => job.id);
    logInfo(`Created ${jobData.length} jobs at same location (Address ID: ${targetAddressId}), IDs: ${insertedIds.jobs.join(', ')}`);

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
