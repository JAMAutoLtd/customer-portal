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
 * Scenario: Creates one job with an unusually long duration (e.g., 4+ hours)
 *           alongside several normal-duration jobs.
 *
 * Expected Outcome: The long-duration job should significantly impact scheduling
 *                   capacity for the day it's placed, potentially pushing other
 *                   jobs to later times or different days.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_long_duration_job(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'long_duration_job';
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
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 3) {
      throw new Error('Insufficient service IDs (< 3) found for this scenario.');
    }
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
      throw new Error('No address IDs found in baseline references.');
    }
    const userId = baselineRefs.customerIds[0];
    const serviceIdLong = baselineRefs.serviceIds[0]; // Service for the long job
    const serviceIdReg1 = baselineRefs.serviceIds[1];
    const serviceIdReg2 = baselineRefs.serviceIds[2];
    const addressId = baselineRefs.addressIds[0];

    // --- 1. Create the Order ---
    // Using one order for simplicity, but could use multiple
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
      'Order for long duration job scenario'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);

    // --- 2. Create Long and Regular Duration Jobs ---
    const allJobsData: TablesInsert<'jobs'>[] = [
      // The long duration job
      {
        order_id: orderId,
        service_id: serviceIdLong,
        address_id: addressId,
        status: 'queued',
        priority: 2,
        job_duration: 240, // 4 hours
        notes: 'Very long duration job (4 hours).',
        fixed_assignment: false,
      },
      // Regular duration jobs
      {
        order_id: orderId,
        service_id: serviceIdReg1,
        address_id: addressId, // Can be same or different address if needed
        status: 'queued',
        priority: 2,
        job_duration: 60,
        notes: 'Regular duration job 1 (long duration scenario)',
        fixed_assignment: false,
      },
      {
        order_id: orderId,
        service_id: serviceIdReg2,
        address_id: addressId,
        status: 'queued',
        priority: 3,
        job_duration: 90,
        notes: 'Regular duration job 2 (long duration scenario)',
        fixed_assignment: false,
      },
    ];

    // --- 3. Insert Jobs ---
    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      allJobsData,
      'Long duration and regular jobs'
    );

    if (jobError || !newJobs || newJobs.length < allJobsData.length) {
      throw new Error(
        `Failed to insert all jobs for long duration scenario: ${jobError?.message || 'Incorrect data returned'}`
      );
    }
    insertedIds.jobs = newJobs.map(job => job.id);
    logInfo(`Created ${allJobsData.length} jobs (incl. long duration): ${insertedIds.jobs.join(', ')}`);

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
