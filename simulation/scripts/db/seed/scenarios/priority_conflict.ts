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
 * Scenario: Creates multiple jobs with varying priorities (high and low)
 *           requested for the same general timeframe, potentially exceeding
 *           available capacity for a single day.
 *
 * Expected Outcome: The scheduler should prioritize scheduling the high-priority
 *                   jobs before the low-priority jobs when capacity is limited.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_priority_conflict(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'priority_conflict';
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
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 2) {
      throw new Error('Insufficient service IDs (< 2) found for this scenario.');
    }
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
      throw new Error('No address IDs found in baseline references.');
    }
    const userId = baselineRefs.customerIds[0];
    const serviceIdHigh = baselineRefs.serviceIds[0]; // Service for high priority
    const serviceIdLow = baselineRefs.serviceIds[1]; // Service for low priority
    const addressId = baselineRefs.addressIds[0];

    // --- 1. Create Order ---
    // Create one order to hold all conflicting priority jobs
    const orderData: TablesInsert<'orders'>[] = [
      {
        user_id: userId,
        address_id: addressId,
        notes: `Order for ${scenarioName} scenario.`,
      }
    ];

    const { data: newOrders, error: orderError } = await insertData(
      supabaseAdmin,
      'orders',
      orderData,
      'Order for priority conflict'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);

    // --- 2. Define High and Low Priority Jobs ---
    const highPriorityJobs: TablesInsert<'jobs'>[] = [];
    const lowPriorityJobs: TablesInsert<'jobs'>[] = [];

    // Create enough jobs to likely cause a capacity issue
    const numHighPriority = 3;
    const numLowPriority = 3;

    for (let i = 0; i < numHighPriority; i++) {
      highPriorityJobs.push({
        order_id: orderId,
        service_id: serviceIdHigh,
        address_id: addressId,
        status: 'queued',
        priority: 1, // High priority
        job_duration: 60 + i * 15, // Vary duration slightly
        notes: `High priority job #${i + 1}`,
        fixed_assignment: false,
      });
    }

    for (let i = 0; i < numLowPriority; i++) {
      lowPriorityJobs.push({
        order_id: orderId,
        service_id: serviceIdLow,
        address_id: addressId,
        status: 'queued',
        priority: 3, // Low priority
        job_duration: 45 + i * 15, // Vary duration slightly
        notes: `Low priority job #${i + 1}`,
        fixed_assignment: false,
      });
    }

    const allJobsData = [...highPriorityJobs, ...lowPriorityJobs];

    // --- 3. Insert Jobs ---
    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      allJobsData,
      'High and Low priority jobs'
    );

    if (jobError || !newJobs || newJobs.length < allJobsData.length) {
      throw new Error(
        `Failed to insert all jobs for priority conflict: ${jobError?.message || 'Incorrect data returned'}`
      );
    }
    insertedIds.jobs = newJobs.map(job => job.id);
    logInfo(`Created ${allJobsData.length} jobs with IDs: ${insertedIds.jobs.join(', ')}`);

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
