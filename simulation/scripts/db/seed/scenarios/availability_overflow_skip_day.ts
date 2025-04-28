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
 * Seeds the database for the 'availability_overflow_skip_day' scenario.
 *
 * Goal: Make all technicians unavailable for the entire day tomorrow,
 * forcing the scheduler to skip scheduling for tomorrow and push jobs to Day+2.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds The actual DB IDs of the technicians to make unavailable.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_availability_overflow_skip_day(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept the actual DB IDs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'availability_overflow_skip_day';
  logInfo(`Seeding scenario: ${scenarioName}...`);

  // Use the passed-in technician DB IDs directly
  if (!technicianDbIds || technicianDbIds.length === 0) {
    // technicianCount is no longer available, check length directly
    throw new Error(`Scenario ${scenarioName} requires technician DB IDs. None were provided.`);
  }

  try {
    // --- Prerequisite Checks ---
    if (!baselineRefs.customerIds?.length) {
      throw new Error('BaselineRefs missing required customerIds');
    }
    if (!baselineRefs.addressIds?.length) {
      throw new Error('BaselineRefs missing required addressIds');
    }
    if (!baselineRefs.serviceIds?.length) {
        throw new Error('BaselineRefs missing required serviceIds');
    }
    const customerUserId = baselineRefs.customerIds[0];
    const customerAddressId = baselineRefs.addressIds[0];
    const serviceId = baselineRefs.serviceIds[0];

    // --- 1. Create Unavailability for All Technicians Tomorrow ---
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateString = tomorrow.toISOString().split('T')[0]; // Format as YYYY-MM-DD

    const unavailabilityRecords: TablesInsert<'technician_availability_exceptions'>[] = technicianDbIds.map(techId => ({
        technician_id: techId,
        exception_type: 'time_off', // Or 'custom_hours' with is_available=false
        date: tomorrowDateString,
        is_available: false,
        // start_time and end_time are NULL when is_available is false for the whole day
        reason: `${scenarioName} - Unavailable all day tomorrow`,
    }));

    const { data: unavailabilityData, error: unavailabilityError } = await insertData<'technician_availability_exceptions'>(
        supabase,
        'technician_availability_exceptions',
        unavailabilityRecords,
        'id'
    );

    if (unavailabilityError || !unavailabilityData || unavailabilityData.length !== technicianDbIds.length) {
      throw new Error(`Failed to insert unavailability records: ${unavailabilityError?.message}`);
    }
    const unavailabilityIds = unavailabilityData.map(u => u.id);
    logInfo(`Created unavailability for technicians ${technicianDbIds.join(', ')} for ${tomorrowDateString}.`);

    // --- 2. Create Order ---
    const orderRecord: TablesInsert<'orders'> = {
        user_id: customerUserId,
        address_id: customerAddressId,
        repair_order_number: `RO-${faker.string.alphanumeric(8)}`,
        earliest_available_time: faker.date.soon({ days: 1 }).toISOString(), // Available tomorrow, but techs won't be
        notes: `Order for ${scenarioName}.`
    };
    const { data: orderData, error: orderError } = await insertData<'orders'>(supabase, 'orders', [orderRecord], 'id');
    if (orderError || !orderData || orderData.length === 0) {
      throw new Error(`Failed to insert order: ${orderError?.message}`);
    }
    const orderId = orderData[0].id;
    logInfo(`Created order (ID: ${orderId}) for ${scenarioName}.`);

    // --- 3. Create Jobs That Need Scheduling ---
    const jobsToCreate: TablesInsert<'jobs'>[] = [];
    const numberOfJobs = 5; // Create several jobs to ensure overflow

    for (let i = 0; i < numberOfJobs; i++) {
        jobsToCreate.push({
            order_id: orderId,
            address_id: customerAddressId,
            service_id: baselineRefs.serviceIds![i % baselineRefs.serviceIds!.length], // Cycle through services
            status: 'pending_review',
            priority: faker.number.int({ min: 1, max: 5 }),
            job_duration: faker.number.int({ min: 30, max: 90 }),
            fixed_assignment: false,
            notes: `Job ${i + 1} for ${scenarioName}, expected to be scheduled on Day+2.`
        });
    }

    const { data: jobData, error: jobError } = await insertData<'jobs'>(supabase, 'jobs', jobsToCreate, 'id');
    if (jobError || !jobData || jobData.length !== numberOfJobs) {
      throw new Error(`Failed to insert jobs: ${jobError?.message}`);
    }
    const jobIds = jobData.map(j => j.id);
    logInfo(`Created ${jobIds.length} jobs (IDs: ${jobIds.join(', ')}) for ${scenarioName}.`);

    // --- 4. Return Result ---
    logInfo(`Successfully seeded scenario: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds: {
        technician_availability_exceptions: unavailabilityIds,
        orders: [orderId],
        jobs: jobIds,
        technicianDbIds: technicianDbIds,
      },
    };

  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error;
  }
}
