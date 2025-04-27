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

// Helper to format Date object to HH:MM:SS string (local time)
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Seeds the database for the 'technician_unavailable_today' scenario.
 *
 * Scenario: Creates an unavailability record for a specific technician
 *           for a block of time today (e.g., 1 PM - 3 PM).
 *           Also creates jobs that would normally fall into this time slot.
 *
 * Expected Outcome: The scheduler should not assign the created jobs to the
 *                   unavailable technician during their specified time off.
 *                   Jobs should be assigned to other technicians or rescheduled.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_technician_unavailable_today(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'technician_unavailable_today';
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
    if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length === 0) {
      throw new Error('No service IDs found in baseline references.');
    }
    if (!baselineRefs.addressIds || baselineRefs.addressIds.length === 0) {
      throw new Error('No address IDs found in baseline references.');
    }
    const targetTechnicianId = parseInt(baselineRefs.technicianIds[0], 10); // Use the first tech
    const userId = baselineRefs.customerIds[0];
    const serviceId = baselineRefs.serviceIds[0];
    const addressId = baselineRefs.addressIds[0];

    if (isNaN(targetTechnicianId)) {
      throw new Error('Invalid technician ID found in baseline references.');
    }

    // --- 1. Calculate Unavailability Time for Today ---
    const today = new Date();
    const startTime = new Date(today);
    startTime.setHours(13, 0, 0, 0); // 1:00 PM today

    const endTime = new Date(today);
    endTime.setHours(15, 0, 0, 0); // 3:00 PM today

    const exceptionDate = formatDate(today);
    const exceptionStartTime = formatTime(startTime);
    const exceptionEndTime = formatTime(endTime);

    logInfo(`Creating unavailability for tech ${targetTechnicianId} on ${exceptionDate} from ${exceptionStartTime} to ${exceptionEndTime}`);

    // --- 2. Create Unavailability Record ---
    const unavailabilityData: TablesInsert<'technician_availability_exceptions'>[] = [
      {
        technician_id: targetTechnicianId,
        exception_type: 'time_off' as Enums<'availability_exception_type'>,
        date: exceptionDate,
        is_available: false,
        start_time: exceptionStartTime,
        end_time: exceptionEndTime,
        reason: 'Scenario: Technician Unavailable Today',
      }
    ];

    const { data: newExceptions, error: exceptionError } = await insertData(
      supabaseAdmin,
      'technician_availability_exceptions',
      unavailabilityData,
      'Technician unavailability exception'
    );

    if (exceptionError || !newExceptions || newExceptions.length === 0) {
      throw new Error(
        `Failed to insert unavailability: ${exceptionError?.message || 'No data returned'}`
      );
    }
    const exceptionId = newExceptions[0].id;
    insertedIds.technician_availability_exceptions!.push(exceptionId);
    logInfo(`Created unavailability exception with ID: ${exceptionId}`);

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
      'Order for tech unavailable scenario'
    );

    if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = newOrders[0].id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);

    // --- 4. Create Job that falls into unavailable time ---
    // Use a requested_time that falls within the 1-3 PM block
    const requestedTime = new Date(today);
    requestedTime.setHours(13, 30, 0, 0); // 1:30 PM today

    const jobData: TablesInsert<'jobs'>[] = [
      {
        order_id: orderId,
        service_id: serviceId,
        address_id: addressId,
        status: 'queued',
        priority: 2,
        job_duration: 60,
        requested_time: requestedTime.toISOString(),
        notes: `Job that should conflict with tech ${targetTechnicianId} unavailability.`,
        fixed_assignment: false, // Not fixed, so scheduler should reassign
      },
    ];

    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      jobData,
      'Job conflicting with unavailability'
    );

    if (jobError || !newJobs || newJobs.length === 0) {
      throw new Error(
        `Failed to insert job for unavailability scenario: ${jobError?.message || 'No data returned'}`
      );
    }
    insertedIds.jobs = newJobs.map(job => job.id);
    logInfo(`Created potentially conflicting job with ID: ${insertedIds.jobs[0]}`);

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
