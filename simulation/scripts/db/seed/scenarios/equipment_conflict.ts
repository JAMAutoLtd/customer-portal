import { faker } from '@faker-js/faker';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type TablesInsert,
  insertData,
  logError,
  logInfo,
  type Enums, // Import Enums if needed for status/priority
} from '../../../utils'; // Assuming utils/index.ts is two levels up
import type { BaselineRefs, ScenarioSeedResult } from './types';

/**
 * Seeds the database for the 'equipment_conflict' scenario.
 *
 * Goal: Create a job that requires a piece of equipment that no technician possesses,
 * forcing the scheduler to handle an unsolvable equipment constraint.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to baseline data (IDs, etc.).
 * @param technicianDbIds Accept DB IDs, even if unused here
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export async function seedScenario_equipment_conflict(
  supabase: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Accept DB IDs, even if unused here
): Promise<ScenarioSeedResult> {
  const scenarioName = 'equipment_conflict';
  logInfo(`Seeding scenario: ${scenarioName} with ${technicianDbIds.length} technicians available...`);

  try {
    // --- 1. Create Unique Equipment ---
    const newEquipmentName = `Conflict Equipment ${faker.string.uuid().substring(0, 4)}`;
    // For simplicity, assume the first service ID from baseline implies a need for 'diag' equipment.
    // A more robust approach would query service details or have richer baseline refs.
    const targetServiceId = baselineRefs.serviceIds?.[0];
    if (!targetServiceId) {
      throw new Error('Baseline data missing required service IDs.');
    }

    // Assume the service requires 'diag' type equipment for this scenario
    const newEquipmentRecord: TablesInsert<'equipment'> = {
        model: newEquipmentName,
        equipment_type: 'diag' // This type MUST NOT be assigned to any baseline technician's van equipment
    };
    const { data: newEquipmentData, error: equipmentError } = await insertData<'equipment'>( // Corrected Generic
        supabase,
        'equipment',
        [newEquipmentRecord],
        'id' // Return the id
    );
    if (equipmentError || !newEquipmentData || newEquipmentData.length === 0) {
        throw new Error(`Failed to insert unique equipment: ${equipmentError?.message}`);
    }
    const uniqueEquipmentId = newEquipmentData[0].id;
    logInfo(`Created unique equipment '${newEquipmentName}' (ID: ${uniqueEquipmentId}) not assigned to vans.`);

    // --- 2. Create Order ---
    const customerUserId = baselineRefs.customerIds?.[0]; // Corrected property name
    const customerAddressId = baselineRefs.addressIds?.[0]; // Corrected property name
     if (!customerUserId || !customerAddressId) {
      throw new Error('Baseline data missing required customer user ID or address ID.');
    }
    const orderRecord: TablesInsert<'orders'> = {
        user_id: customerUserId,
        address_id: customerAddressId,
        repair_order_number: `RO-${faker.string.alphanumeric(8)}`,
        earliest_available_time: faker.date.soon({ days: 1 }).toISOString(), // Corrected Date format
        notes: `Order for equipment conflict scenario.`
    };
     const { data: orderData, error: orderError } = await insertData<'orders'>( // Corrected Generic
      supabase,
      'orders',
      [orderRecord],
      'id' // Return the id
    );
    if (orderError || !orderData || orderData.length === 0) {
      throw new Error(`Failed to insert order: ${orderError?.message}`);
    }
    const orderId = orderData[0].id;
    logInfo(`Created order (ID: ${orderId}) for conflict scenario.`);


    // --- 3. Create Job Requiring Unique Equipment ---
    // This job uses the service ID which implies a need for the unique equipment type
    const jobRecord: TablesInsert<'jobs'> = {
        order_id: orderId,
        address_id: customerAddressId, // Job is at the order address
        service_id: targetServiceId, // Use the service ID requiring the unique equipment type
        status: 'pending_review', // Initial status - should remain this way if scheduler works correctly
        priority: 5, // Example priority
        job_duration: 60, // Example duration in minutes
        notes: `Job requiring equipment type 'diag' (via service ${targetServiceId}) which no technician has.`
        // Ensure vehicle_id is set on the order or job if required by FK constraints or scheduler logic
    };
     const { data: jobData, error: jobError } = await insertData<'jobs'>( // Corrected Generic
      supabase,
      'jobs',
      [jobRecord],
      'id' // Return the id
    );
    if (jobError || !jobData || jobData.length === 0) {
      throw new Error(`Failed to insert job: ${jobError?.message}`);
    }
    const jobId = jobData[0].id;
    logInfo(`Created job (ID: ${jobId}) requiring unique equipment.`);

    // --- 4. Return Result ---
    logInfo(`Successfully seeded scenario: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds: {
        equipment: [uniqueEquipmentId],
        orders: [orderId],
        jobs: [jobId],
      },
    };
  } catch (error) {
    logError(`Error seeding scenario ${scenarioName}:`, error);
    throw error; // Re-throw the error to be caught by the main seeding script
  }
}

// Original content (if any) can go here or be integrated above.
// Ensure the function signature matches expectations (supabaseAdmin, baselineRefs)
// and the return type is Promise<ScenarioSeedResult>
