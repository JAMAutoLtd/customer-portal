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
 * Scenario: Creates a single job that must be scheduled at a specific
 *           time today (e.g., 10:00 AM).
 *
 * Expected Outcome: The scheduler should schedule this job exactly at the
 *                   specified `fixed_schedule_time` for today,
 *                   respecting the `fixed_assignment` flag.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_fixed_time_today(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'fixed_time_today';
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
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length === 0) {
      throw new Error('No service IDs found in baseline references.');
    }
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
      throw new Error('No address IDs found in baseline references.');
    }
    const userId = baselineRefs.customerIds[0];
    const serviceId = baselineRefs.serviceIds[0];
    const addressId = baselineRefs.addressIds[0];

    // --- 1. Create the Order ---
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
      'Order for fixed time job'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);

    // --- 2. Calculate Fixed Time for Today ---
    const today = new Date();
    today.setHours(10, 0, 0, 0); // Set time to 10:00:00.000 today
    const fixedTimeTodayISO = today.toISOString();
    logInfo(`Calculated fixed time for today: ${fixedTimeTodayISO}`);

    // --- 3. Create the Fixed Time Job ---
    const jobData: TablesInsert<'jobs'>[] = [
      {
        order_id: orderId,
        service_id: serviceId,
        address_id: addressId,
        status: 'fixed_time' as Enums<'job_status'>, // Use 'fixed_time' status
        priority: 1, // Example priority
        job_duration: 90,
        fixed_assignment: true,
        fixed_schedule_time: fixedTimeTodayISO,
        notes: `Job must be done exactly at ${fixedTimeTodayISO}`,
      },
    ];

    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      jobData,
      'Fixed time job for today'
    );

    if (jobError || !newJobs || newJobs.length === 0) {
      throw new Error(
        `Failed to insert fixed time job: ${jobError?.message || 'No data returned'}`
      );
    }
    insertedIds.jobs = newJobs.map(job => job.id);
    logInfo(`Created fixed time job with ID: ${insertedIds.jobs[0]}`);

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
