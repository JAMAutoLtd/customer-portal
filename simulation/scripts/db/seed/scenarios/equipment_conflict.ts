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
 * Scenario: Creates a job that requires a piece of equipment
 *           that no technician possesses in the baseline data.
 *
 * Expected Outcome: The scheduler should identify this job as unschedulable
 *                   due to the equipment constraint.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data (e.g., customer IDs).
 * @returns A promise resolving to the ScenarioSeedResult object.
 */
export async function seedScenario_equipment_conflict(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
): Promise<ScenarioSeedResult> {
  const scenarioName = 'equipment_conflict';
  const insertedIds: ScenarioSeedResult['insertedIds'] = {
    equipment: [],
    orders: [],
    jobs: [],
  };

  logInfo(`Starting scenario seeding: ${scenarioName}...`);

  try {
    // 1. Create a new equipment type not assigned to any technician
    const newEquipmentData: TablesInsert<'equipment'>[] = [
      {
        model: `Conflict Generator ${faker.commerce.productAdjective()} ${faker.commerce.productMaterial()}`,
      },
    ];

    const { data: newEquipment, error: equipmentError } = await insertData(
      supabaseAdmin,
      'equipment',
      newEquipmentData,
      'New conflict equipment'
    );

    if (equipmentError || !newEquipment || newEquipment.length === 0) {
      throw new Error(
        `Failed to insert conflict equipment: ${equipmentError?.message || 'No data returned'}`
      );
    }
    const conflictEquipmentId = newEquipment[0].id;
    insertedIds.equipment!.push(conflictEquipmentId);
    logInfo(`Created conflict equipment with ID: ${conflictEquipmentId}`);

    // Ensure we have a user ID (assuming customerIds are user UUIDs)
    if (!baselineRefs.customerIds || baselineRefs.customerIds.length === 0) {
      throw new Error('No user/customer IDs found in baseline references.');
    }
    const userId = baselineRefs.customerIds[0]; // Use the first user/customer ID

    // 2. Create an Order for the job
    const orderData: TablesInsert<'orders'>[] = [
      {
        user_id: userId,
        notes: 'Order for the equipment conflict scenario.',
      }
    ];

    const { data: newOrders, error: orderError } = await insertData(
      supabaseAdmin,
      'orders',
      orderData,
      'Order for conflict job'
    );

     if (orderError || !newOrders || newOrders.length === 0) {
      throw new Error(
        `Failed to insert order: ${orderError?.message || 'No data returned'}`
      );
    }
    const orderId = (newOrders[0] as any).id;
    insertedIds.orders!.push(orderId);
    logInfo(`Created order with ID: ${orderId}`);


    // 3. Create a job
    // Note: The requirement for specific equipment is handled by the scheduler/optimizer,
    // not by a direct field in the jobs table according to the current types.
    // This scenario relies on the service_id potentially implying equipment needs,
    // or the test setup asserting the conflict based on the created equipment ID.
    const newJobData: TablesInsert<'jobs'>[] = [
      {
        order_id: orderId,
        service_id: baselineRefs.serviceIds?.[0], // This service might implicitly require equipment
        status: 'queued',
        priority: 2,
        job_duration: 60,
        notes: 'Job intended for equipment conflict scenario.',
      },
    ];

    const { data: newJobs, error: jobError } = await insertData(
      supabaseAdmin,
      'jobs',
      newJobData,
      'Job requiring conflict equipment'
    );

    if (jobError || !newJobs || newJobs.length === 0) {
      throw new Error(
        `Failed to insert conflict job: ${jobError?.message || 'No data returned'}`
      );
    }
    insertedIds.jobs!.push(newJobs[0].id);
    logInfo(`Created conflict job with ID: ${newJobs[0].id}`);


    logInfo(`Scenario seeding completed: ${scenarioName}`);
    return {
      scenarioName,
      insertedIds,
    };
  } catch (error) {
    logError(`Error during scenario seeding (${scenarioName}):`, error);
    // Re-throw the error to be caught by the main seeding script
    throw error;
  }
}

// Original content (if any) can go here or be integrated above.
// Ensure the function signature matches expectations (supabaseAdmin, baselineRefs)
// and the return type is Promise<ScenarioSeedResult>
