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

// Helper to format Date object to YYYY-MM-DD string
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Seeds the database for the 'availability_overflow_skip_day' scenario.
 *
 * Scenario: Makes all baseline technicians unavailable for the entire day tomorrow.
 *           Creates several jobs requested for tomorrow.
 *
 * Expected Outcome: The scheduler should be unable to schedule any jobs for tomorrow
 *                   due to lack of technician availability and should push them to
 *                   the next available day (Day+2).
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_availability_overflow_skip_day(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'availability_overflow_skip_day';
  const insertedIds: ScenarioSeedResult['insertedIds'] = {
    orders: [],
    jobs: [],
    technician_availability_exceptions: [],
  };

  logInfo(`Starting scenario seeding: ${scenarioName}...`);

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.technicianIds || baselineRefs.technicianIds.length === 0) {
      throw new Error('No technician IDs found in baseline references.');
    }
    if (!baselineRefs.customerIds || baselineRefs.customerIds.length === 0) {
      throw new Error('No user/customer IDs found in baseline references.');
    }
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length < 2) {
      throw new Error('Insufficient service IDs (< 2) found for this scenario.');
    }
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
      throw new Error('No address IDs found in baseline references.');
    }
    const technicianIds = baselineRefs.technicianIds.map(id => parseInt(id, 10));
    const userId = baselineRefs.customerIds[0];
    const serviceId1 = baselineRefs.serviceIds[0];
    const serviceId2 = baselineRefs.serviceIds[1];
    const addressId = baselineRefs.addressIds[0];

    if (technicianIds.some(isNaN)) {
      throw new Error('Invalid technician ID(s) found in baseline references.');
    }

    // --- 1. Calculate Tomorrow's Date ---
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = formatDate(tomorrow);

    logInfo(`Making all ${technicianIds.length} technicians unavailable for ${tomorrowDate}`);

    // --- 2. Create Unavailability Records for All Technicians Tomorrow ---
    const unavailabilityData: TablesInsert<'technician_availability_exceptions'>[] = technicianIds.map(techId => ({
      technician_id: techId,
      exception_type: 'time_off' as Enums<'availability_exception_type'>,
      date: tomorrowDate,
      is_available: false,
      start_time: '00:00:00', // Full day
      end_time: '23:59:59',   // Full day
      reason: 'Scenario: All Techs Unavailable Tomorrow',
    }));

    const { data: newExceptions, error: exceptionError } = await insertData(
      supabaseAdmin,
      'technician_availability_exceptions',
      unavailabilityData,
      'All technicians unavailable tomorrow'
    );

    if (exceptionError || !newExceptions || newExceptions.length !== unavailabilityData.length) {
      throw new Error(
        `Failed to insert all unavailability records: ${exceptionError?.message || 'Incorrect data returned'}`
      );
    }
    insertedIds.technician_availability_exceptions = newExceptions.map(ex => ex.id);
    logInfo(`Created ${newExceptions.length} unavailability exceptions for tomorrow.`);

    // --- 3. Create Order ---
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
      'Order for skip day scenario'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);

    // --- 4. Create Jobs Requested for Tomorrow ---
    const tomorrowMorning = new Date(tomorrow); // Copy tomorrow's date
    tomorrowMorning.setHours(9, 30, 0, 0); // 9:30 AM tomorrow

    const jobData: TablesInsert<'jobs'>[] = [
      {
        order_id: orderId,
        service_id: serviceId1,
        address_id: addressId,
        status: 'queued',
        priority: 2,
        job_duration: 60,
        requested_time: tomorrowMorning.toISOString(), // Request for unavailable day
        notes: 'Job 1 requested for day when all techs are unavailable.',
        fixed_assignment: false,
      },
      {
        order_id: orderId,
        service_id: serviceId2,
        address_id: addressId,
        status: 'queued',
        priority: 2,
        job_duration: 90,
        requested_time: tomorrowMorning.toISOString(), // Request for unavailable day
        notes: 'Job 2 requested for day when all techs are unavailable.',
        fixed_assignment: false,
      },
    ];

    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      jobData,
      'Jobs requested for unavailable day'
    );

    if (jobError || !newJobs || newJobs.length < jobData.length) {
      throw new Error(
        `Failed to insert all jobs for skip day scenario: ${jobError?.message || 'Incorrect data returned'}`
      );
    }
    insertedIds.jobs = newJobs.map(job => job.id);
    logInfo(`Created jobs requested for unavailable day: ${insertedIds.jobs.join(', ')}`);

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
