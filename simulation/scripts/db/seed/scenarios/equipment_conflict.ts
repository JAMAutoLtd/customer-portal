import type { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
// Import types and utils from the central utils file
import type { Database, Tables, Enums, TablesInsert } from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { insertData, logInfo, logError, getEquipmentForVans } from '../../../utils'; // Removed getRequiredEquipmentForJob as it's not used directly here

// Define types using the standard Supabase helpers
type OrderInsert = TablesInsert<'orders'>;
type JobInsert = TablesInsert<'jobs'>;

// Helper to pick a random element from an array
function getRandomElement<T>(arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot get random element from an empty array.');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Seeds data for the 'equipment_conflict' scenario.
 * Creates a job requiring specific equipment (via service/YMM lookup)
 * that NO available technicians possess.
 * Expected outcome: The job should end up in 'pending_review' status.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data.
 * @param technicianDbIds - The DB IDs of technicians active in this scenario.
 * @returns Metadata object conforming to ScenarioSeedResult.
 * @description Tests the scheduler's handling of a job that cannot be scheduled due to lack of required equipment. It identifies a specific equipment model needed for a service/vehicle combination that no active technician possesses, then seeds a job with this requirement. Verifies the job is marked 'pending_review'.
 */
export async function seedScenario_equipment_conflict(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[]
): Promise<ScenarioSeedResult> {
  const scenarioName = 'equipment_conflict';
  logInfo(`Starting scenario seeding: ${scenarioName}`);

  // Validate baseline refs needed for this scenario
  if (
    !baselineRefs.customerIds?.length ||
    !baselineRefs.addressIds?.length ||
    !baselineRefs.customerVehicleIds?.length ||
    !baselineRefs.serviceIds?.length ||
    !baselineRefs.equipmentIds?.length ||
    !baselineRefs.vanIds?.length ||
    !baselineRefs.ymmIds?.length // Changed from ymmRefIds
  ) {
    throw new Error(
      `BaselineRefs is missing required data for ${scenarioName} scenario.`
    );
  }

  if (technicianDbIds.length === 0) {
    throw new Error('No technicians provided for equipment_conflict scenario.');
  }

  // --- Determine Equipment Conflict ---
  // 1. Get equipment assigned to the vans of the active technicians
  const techVanAssignments = await supabaseAdmin
    .from('technicians')
    .select('id, assigned_van_id')
    .in('id', technicianDbIds)
    .not('assigned_van_id', 'is', null);

  if (techVanAssignments.error) {
    logError('Failed to fetch technician van assignments', techVanAssignments.error);
    throw techVanAssignments.error;
  }

  const assignedVanIds = techVanAssignments.data.map(t => t.assigned_van_id as number);
  if (assignedVanIds.length === 0) {
      logInfo('Warning: No technicians have assigned vans in this baseline setup.');
      // Decide how to handle this - maybe error, maybe create a van? For now, error.
      throw new Error('Cannot run equipment_conflict scenario: No technicians have assigned vans.');
  }
  const techEquipmentMap = await getEquipmentForVans(supabaseAdmin, assignedVanIds);
  const allTechEquipmentModels = new Set<string>();
  techEquipmentMap.forEach(equipList => {
      // Ensure eq and eq.model are not null before adding
      equipList.forEach(eq => {
          if (eq && eq.model) {
              allTechEquipmentModels.add(eq.model)
          }
      });
  });
  logInfo(`Technicians in this scenario collectively possess equipment models: ${Array.from(allTechEquipmentModels).join(', ')}`);


  // 2. Find a service/YMM combination that requires equipment *not* held by any tech
  //    We need to query the unified equipment_requirements table.
  //    Need correct types for the join
  type EquipmentReqWithDetails = Tables<'equipment_requirements'> & {
      services: Pick<Tables<'services'>, 'service_name'> | null;
      ymm_ref: Pick<Tables<'ymm_ref'>, 'year' | 'make' | 'model'> | null;
  }

  const { data: equipmentReqs, error: equipmentReqError } = await supabaseAdmin
      .from('equipment_requirements')
      .select(`
          service_id,
          ymm_id,
          equipment_model,
          services ( service_name ),
          ymm_ref ( year, make, model )
      `)
      .limit(100) // Limit to avoid pulling too much
      .returns<EquipmentReqWithDetails[]>(); // Specify the return type


  if (equipmentReqError) {
      logError('Failed to query equipment requirements', equipmentReqError);
      throw equipmentReqError;
  }

  let conflictingServiceId: number | null = null;
  let conflictingYmmId: number | null = null;
  let requiredModelNotFound: string | null = null;

  for (const req of equipmentReqs ?? []) {
      // Check if equipment_model exists and is not null
      if (req.equipment_model && !allTechEquipmentModels.has(req.equipment_model)) {
          conflictingServiceId = req.service_id;
          conflictingYmmId = req.ymm_id;
          requiredModelNotFound = req.equipment_model;
          logInfo(`Found conflict: Service ID ${conflictingServiceId} for YMM ID ${conflictingYmmId} requires '${requiredModelNotFound}', which no active tech has.`);
          break;
      }
  }

  // No need to check other tables since all requirements are now in equipment_requirements

  if (!conflictingServiceId || !conflictingYmmId || !requiredModelNotFound) {
      logError('Failed to find a suitable service/YMM combination with an equipment conflict against the current technician pool.', { allTechEquipmentModels });
      throw new Error('Could not establish an equipment conflict for this scenario.');
  }

  // --- Seed Order and Job ---
  const customerId = getRandomElement(baselineRefs.customerIds);
  const addressId = baselineRefs.addressIds[0];

  // --- Find Vehicle ID corresponding to conflictingYmmId (Revised Logic) ---
  // 1. Find the specific requirement object again to safely access its details
  const conflictingReq = equipmentReqs?.find(r => r.ymm_id === conflictingYmmId);

  if (!conflictingReq) {
      // This shouldn't happen if the previous loop found one, but good practice to check
      throw new Error(`Consistency Error: Could not re-find conflicting requirement for YMM ID ${conflictingYmmId}`);
  }
  if (!conflictingReq.ymm_ref || !conflictingReq.ymm_ref.year || !conflictingReq.ymm_ref.make || !conflictingReq.ymm_ref.model) {
      logError('Conflicting requirement found, but missing critical ymm_ref details', conflictingReq);
      throw new Error(`Conflicting requirement for YMM ID ${conflictingYmmId} is missing year/make/model details.`);
  }

  // 2. Now query customer_vehicles using the guaranteed non-null values
  const { data: vehicleForYmm, error: vehicleError } = await supabaseAdmin
      .from('customer_vehicles')
      .select('id')
      .eq('year', conflictingReq.ymm_ref.year)   // Use guaranteed value
      .eq('make', conflictingReq.ymm_ref.make)   // Use guaranteed value
      .eq('model', conflictingReq.ymm_ref.model) // Use guaranteed value
      .limit(1)
      .maybeSingle(); // Use maybeSingle as it's possible no matching vehicle exists in baseline

  if (vehicleError) {
      logError(`Database error querying for vehicle matching YMM ID ${conflictingYmmId}`, vehicleError);
      throw vehicleError; // Rethrow DB errors
  }
  if (!vehicleForYmm) {
      // It's possible the baseline doesn't contain a vehicle for every YMM in requirements
      logError(`Failed to find a vehicle in customer_vehicles matching YMM ID ${conflictingYmmId} (Year: ${conflictingReq.ymm_ref.year}, Make: ${conflictingReq.ymm_ref.make}, Model: ${conflictingReq.ymm_ref.model})`);
      throw new Error(`Could not find suitable vehicle for YMM ${conflictingYmmId}. Check baseline data.`);
  }

  const vehicleId = vehicleForYmm.id;
  logInfo(`Using Vehicle ID ${vehicleId} which corresponds to YMM ID ${conflictingYmmId}`);
  // --- End Finding Vehicle ID ---

  const orderData: TablesInsert<'orders'> = {
    user_id: customerId,
    address_id: addressId,
    vehicle_id: vehicleId, // <-- Add vehicle ID
    notes: `Equipment conflict order requiring '${requiredModelNotFound}'`,
  };

  const { data: insertedOrderData, error: orderError } = await insertData(
    supabaseAdmin,
    'orders',
    [orderData],
    `Order for ${scenarioName} scenario`
  );
  if (orderError || !insertedOrderData || insertedOrderData.length === 0) {
    throw orderError || new Error('Failed to insert order');
  }
  const createdOrderId = insertedOrderData[0].id;

  const job: JobInsert = {
    order_id: createdOrderId,
    service_id: conflictingServiceId, // The service requiring the missing equipment
    address_id: addressId, // Use same address as order
    status: 'queued' as Enums<'job_status'>,
    priority: 1, // High priority to ensure it gets evaluated
    notes: `Job requiring ${requiredModelNotFound} which no tech has. Should become pending_review.`,
    job_duration: faker.number.int({ min: 60, max: 120 }),
    // other fields null or default
    assigned_technician: null,
    estimated_sched: null,
    fixed_assignment: false,
    fixed_schedule_time: null,
    requested_time: null,
    technician_notes: null,
  };

  const { data: insertedJobData, error: jobError } = await insertData(
    supabaseAdmin,
    'jobs',
    [job],
    `Job for ${scenarioName} scenario`
  );
  if (jobError || !insertedJobData || insertedJobData.length === 0) {
    throw jobError || new Error('Failed to insert job');
  }
  const createdJobId = insertedJobData[0].id;

  logInfo(`Finished scenario seeding: ${scenarioName}. Created Order ID: ${createdOrderId}, Job ID: ${createdJobId}.`);

  // Verification step (optional but recommended)
  // Query the DB after seeding to ensure the conflict exists as expected.
  // e.g., fetch the job, get its requirements, check against tech equipment again.

  const insertedIds: ScenarioSeedResult['insertedIds'] = {
    orders: [createdOrderId],
    jobs: [createdJobId],
    equipment: [],
    services: [],
    ymm_ref: [],
    equipment_requirements: [],
  };

  return {
    scenarioName: scenarioName,
    insertedIds,
  };
}