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
 * Scenario: Creates several regular jobs for tomorrow and one additional
 *           job fixed for a specific time tomorrow (e.g., 11:00 AM).
 *           Aims to test scheduler behavior when capacity is constrained
 *           and a fixed-time job is introduced.
 *
 * Expected Outcome: The scheduler should prioritize the fixed-time job at its
 *                   specified time. Other jobs for tomorrow might be pushed
 *                   back or rescheduled based on capacity and the fixed constraint.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_fixed_time_future_overflow(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'fixed_time_future_overflow';
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
    // Need multiple services to create diverse jobs
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 3) {
      throw new Error('Insufficient service IDs (< 3) found in baseline references for this scenario.');
    }
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
      throw new Error('No address IDs found in baseline references.');
    }
    const userId = baselineRefs.customerIds[0];
    const serviceId1 = baselineRefs.serviceIds[0];
    const serviceId2 = baselineRefs.serviceIds[1];
    const serviceId3 = baselineRefs.serviceIds[2]; // For the fixed job
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
      'Order for fixed time future overflow'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);

    // --- 2. Calculate Times for Tomorrow ---
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Start of day tomorrow
    const tomorrowStartISO = tomorrow.toISOString();

    tomorrow.setHours(11, 0, 0, 0); // Set time to 11:00:00.000 tomorrow
    const fixedTimeTomorrowISO = tomorrow.toISOString();
    logInfo(`Calculated fixed time for tomorrow: ${fixedTimeTomorrowISO}`);

    // --- 3. Create Jobs (Regular + Fixed) ---
    const allJobsData: TablesInsert<'jobs'>[] = [
      // Regular jobs for tomorrow
      {
        order_id: orderId,
        service_id: serviceId1,
        address_id: addressId,
        status: 'queued',
        priority: 3, // Lower priority
        job_duration: 120,
        requested_time: tomorrowStartISO, // Request for tomorrow
        notes: 'Regular job 1 for tomorrow (overflow scenario)',
        fixed_assignment: false,
      },
      {
        order_id: orderId,
        service_id: serviceId2,
        address_id: addressId,
        status: 'queued',
        priority: 3, // Lower priority
        job_duration: 90,
        requested_time: tomorrowStartISO, // Request for tomorrow
        notes: 'Regular job 2 for tomorrow (overflow scenario)',
        fixed_assignment: false,
      },
      // Fixed time job for tomorrow
      {
        order_id: orderId,
        service_id: serviceId3,
        address_id: addressId,
        status: 'fixed_time',
        priority: 1, // Higher priority
        job_duration: 60,
        fixed_assignment: true,
        fixed_schedule_time: fixedTimeTomorrowISO,
        notes: `Fixed time job for tomorrow @ ${fixedTimeTomorrowISO}`,
      },
    ];

    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      allJobsData,
      'Jobs for fixed time future overflow'
    );

    if (jobError || !newJobs || newJobs.length < allJobsData.length) {
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
