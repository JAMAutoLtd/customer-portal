import type { SupabaseClient } from '@supabase/supabase-js';
import dayjs from 'dayjs'; // Added dayjs
import utc from 'dayjs/plugin/utc'; // Added utc plugin
import { faker } from '@faker-js/faker'; // Added faker
// Assuming Database type might be needed for SupabaseClient, and other types for BaselineRefs/ScenarioSeedResult
import type { Database, Tables, Enums, TablesInsert } from '../../../utils'; // Adjust if not all are needed later
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { logInfo, logError, insertData } from '../../../utils'; // Added logError and insertData
// import { insertData, logError } from '../../../utils'; // Will uncomment when needed

dayjs.extend(utc); // Extend dayjs with utc plugin

/**
 * @file comprehensive_scheduler_test.ts
 * @description Seeds data for the comprehensive scheduler integration test scenario. This script will set up a complex state including various technician configurations, equipment, availability exceptions, and a series of jobs designed to test multiple facets of the scheduling and optimization logic.
 */

// Placeholder for insertedIds structure, to be defined more concretely
// It will mirror the testDataIds structure from the proposal's Jest example.
// interface ComprehensiveInsertedIds {
//   technicianDbIds?: number[];
//   technicianAuthIds?: string[];
//   technician_availability_exceptions?: number[];
//   jobs?: number[];
//   fillerJobIds?: number[];
//   // ... other specific IDs as needed by scenarios e.g. jobZ1, exceptionH etc.
// }

// Define types using the standard Supabase helpers (similar to base_schedule.ts)
type OrderInsert = TablesInsert<'orders'>;
type JobInsert = TablesInsert<'jobs'>;

// Helper to pick a random element from an array (from base_schedule.ts)
function getRandomElement<T>(arr: T[]): T {
  if (!arr || arr.length === 0) { // Added !arr check
    throw new Error('Cannot get random element from an empty or undefined array.');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// Explicitly define IDs for generally available, non-ADAS services (from base_schedule.ts)
const BASIC_SERVICE_IDS = [6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19];

// Define an interface for the technician details expected from the main seeder
interface ComprehensiveTestTechnician {
  dbId: number;
  authId: string;
  assignedVanId: number;
}

/**
 * Seeds all necessary data for the comprehensive scheduler integration test.
 *
 * @param supabaseAdmin - The Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data (customers, addresses, etc.).
 * @param seededTechnicians - Array of pre-seeded technician details.
 * @returns A Promise that resolves to a ScenarioSeedResult containing the IDs of all created entities.
 */
export async function seedComprehensiveSchedulerTest(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  // Accept the array of pre-seeded technician details
  seededTechnicians: ComprehensiveTestTechnician[] 
): Promise<ScenarioSeedResult> {
  logInfo('Starting scenario seeding: comprehensive_scheduler_test');
  // Log the received customerVehicleIds for verification
  if (baselineRefs.customerVehicleIds) {
    logInfo(`Received baselineRefs.customerVehicleIds (count: ${baselineRefs.customerVehicleIds.length}): ${JSON.stringify(baselineRefs.customerVehicleIds.slice(0, 10))}...`);
  } else {
    logInfo('Received baselineRefs.customerVehicleIds is undefined or null.');
  }

  const scenarioName = 'comprehensive_scheduler_test';

  const insertedIds: ScenarioSeedResult['insertedIds'] = {
    orders: [],
    jobs: [],
    equipment: [],
    technician_availability_exceptions: [],
    technicianIds: [],
    technicianDbIds: [],
    vanIds: [],
    fillerJobIds: [],
  };

  // --- Use pre-seeded technicians ---
  if (!seededTechnicians || seededTechnicians.length !== 4) {
    const errorMsg = `Comprehensive test expected 4 pre-seeded technicians, but received ${seededTechnicians?.length || 0}.`;
    logError(errorMsg);
    throw new Error(errorMsg);
  }
  logInfo(`Using ${seededTechnicians.length} pre-seeded technicians for comprehensive test.`);

  const techDbIds: number[] = seededTechnicians.map(t => t.dbId);
  const techAuthIds: string[] = seededTechnicians.map(t => t.authId);
  const techVanIds: number[] = seededTechnicians.map(t => t.assignedVanId);

  // (Subtask 2.2: Clear van equipment using techVanIds)
  try {
    if (techVanIds.length > 0) {
      logInfo(`Clearing default van equipment for van IDs: ${techVanIds.join(', ')}...`);
      const { error: deleteError } = await supabaseAdmin
        .from('van_equipment')
        .delete()
        .in('van_id', techVanIds);

      if (deleteError) {
        throw deleteError;
      }
      logInfo('Successfully cleared default van equipment.');
    } else {
      logInfo('No van IDs found for technicians, skipping van equipment clearing.');
    }
  } catch (error) {
    logError('Error clearing default van equipment', error);
    throw error; // Re-throw to halt execution
  }

  // (Subtask 2.3: Query equipment and prepare van-specific data)
  const requiredEquipmentModels = ['prog', 'immo', 'diag', 'airbag', 'rare_tool'];
  const equipmentModelToIdMap = new Map<string, number>();
  let vanEquipmentInserts: TablesInsert<'van_equipment'>[] = [];

  try {
    logInfo(`Querying equipment IDs for models: ${requiredEquipmentModels.join(', ')}...`);
    const { data: equipmentData, error: equipmentError } = await supabaseAdmin
      .from('equipment')
      .select('id, model')
      .in('model', requiredEquipmentModels);

    if (equipmentError) throw equipmentError;
    if (!equipmentData || equipmentData.length === 0) {
      logInfo('No equipment found for the required models. This might be an issue if scenarios depend on them.');
      // Not throwing an error here as 'rare_tool' might be seeded by Scenario C later.
      // Other tools are generally expected to be in baseline.
    } else {
      equipmentData.forEach(eq => {
        if (eq.id && eq.model) {
          equipmentModelToIdMap.set(eq.model, eq.id);
        }
      });
      logInfo('Successfully queried equipment IDs.');
    }

    // Prepare van_equipment inserts based on plan
    // Tech 1 (Van 1 - techVanIds[0]): 'prog'
    if (techVanIds[0] && equipmentModelToIdMap.has('prog')) {
      vanEquipmentInserts.push({ van_id: techVanIds[0], equipment_id: equipmentModelToIdMap.get('prog')! });
    }
    // Tech 2 (Van 2 - techVanIds[1]): 'immo'
    if (techVanIds[1] && equipmentModelToIdMap.has('immo')) {
      vanEquipmentInserts.push({ van_id: techVanIds[1], equipment_id: equipmentModelToIdMap.get('immo')! });
    }
    // Tech 3 (Van 3 - techVanIds[2]): 'prog'
    if (techVanIds[2] && equipmentModelToIdMap.has('prog')) {
      vanEquipmentInserts.push({ van_id: techVanIds[2], equipment_id: equipmentModelToIdMap.get('prog')! });
    }
    // Tech 4 (Van 4 - techVanIds[3]): 'diag', 'prog', 'immo', 'airbag'
    const tech4Equipment = ['diag', 'prog', 'immo', 'airbag'];
    if (techVanIds[3]) {
      tech4Equipment.forEach(model => {
        if (equipmentModelToIdMap.has(model)) {
          vanEquipmentInserts.push({ van_id: techVanIds[3]!, equipment_id: equipmentModelToIdMap.get(model)! });
        }
      });
    }

    if (vanEquipmentInserts.length > 0) {
      logInfo(`Inserting ${vanEquipmentInserts.length} van_equipment records...`);
      const { error: insertVanEqError } = await insertData(
        supabaseAdmin,
        'van_equipment',
        vanEquipmentInserts,
        'Comprehensive Test Van Equipment'
      );
      if (insertVanEqError) throw insertVanEqError;
      logInfo('Successfully inserted van-specific equipment.');
    } else {
      logInfo('No van-specific equipment to insert. This might be due to missing equipment models in DB or no tech vans.');
    }

  } catch (error) {
    logError('Error in Subtask 2.3 (Querying/Inserting Van Equipment)', error);
    throw error; // Re-throw
  }

  // (Subtask 2.4: Store techDbIds, techAuthIds, and techVanIds into insertedIds)
  insertedIds.technicianDbIds = techDbIds;
  insertedIds.technicianAuthIds = techAuthIds;
  insertedIds.vanIds = techVanIds;

  // --- Fetch Generic Service IDs needed by multiple scenarios ---
  let genericProgServiceId: number;
  let genericImmoServiceId: number;

  try {
    const { data: progServiceData, error: progServiceError } = await supabaseAdmin
      .from('services')
      .select('id')
      .eq('service_name', 'Other') // Assuming 'Other' with category 'prog' is our generic prog service
      .eq('service_category', 'prog')
      .single();
    if (progServiceError || !progServiceData) {
      throw new Error(`Could not find generic 'prog' service (name: 'Other', category: 'prog'). Error: ${progServiceError?.message}`);
    }
    genericProgServiceId = progServiceData.id;

    const { data: immoServiceData, error: immoServiceError } = await supabaseAdmin
      .from('services')
      .select('id')
      .eq('service_name', 'Immobilizer R&R') // Generic immo service
      .single();
    if (immoServiceError || !immoServiceData) {
      throw new Error(`Could not find generic 'immo' service (name: 'Immobilizer R&R'). Error: ${immoServiceError?.message}`);
    }
    genericImmoServiceId = immoServiceData.id;
    logInfo(`Using genericProgServiceId: ${genericProgServiceId}, genericImmoServiceId: ${genericImmoServiceId}`);
  } catch (serviceFetchError) {
    logError('Critical error fetching generic service IDs', serviceFetchError);
    throw serviceFetchError;
  }
  // --- End Fetch Generic Service IDs ---

  // --- Technician Availability Exceptions (Task 3) ---
  logInfo('Preparing technician availability exceptions (Task 3)...');

  // Subtask 3.1: Calculate date/time values using dayjs
  const todayUtc = dayjs.utc().format('YYYY-MM-DD');
  // For Tech 1 (e.g., techDbIds[0]): works 14:00-18:30 UTC today
  const tech1ExceptionDate = todayUtc;
  const tech1ExceptionStartTime = '14:00:00';
  const tech1ExceptionEndTime = '18:30:00'; // Default end time for Tech 1

  // For Tech 4 (e.g., techDbIds[3]): unavailable for the full day today
  const tech4ExceptionDate = todayUtc;

  logInfo(`Calculated dates for exceptions: Today is ${todayUtc}. Tech1 late start: ${tech1ExceptionStartTime}-${tech1ExceptionEndTime}`);

  // Subtask 3.2: Prepare technician_availability_exceptions data structure
  const exceptionsToCreate: TablesInsert<'technician_availability_exceptions'>[] = [];

  // Tech 1 (e.g., techDbIds[0] - for exceptionI)
  if (techDbIds[0]) {
    exceptionsToCreate.push({
      technician_id: techDbIds[0],
      exception_type: 'custom_hours',
      date: tech1ExceptionDate,
      is_available: true, // Tech 1 IS available during these custom hours
      start_time: tech1ExceptionStartTime,
      end_time: tech1ExceptionEndTime,
      reason: 'Late start - Scenario I',
    });
  } else {
    logError('Tech 1 DB ID not found, cannot create exception I.');
  }

  // Tech 4 (e.g., techDbIds[3] - for exceptionH)
  if (techDbIds[3]) {
    exceptionsToCreate.push({
      technician_id: techDbIds[3],
      exception_type: 'time_off', // Or 'custom_hours' with is_available: false
      date: tech4ExceptionDate,
      is_available: false, // Plan: "is_available = false (full day)"
      start_time: null, // Must be null if is_available is false, per DB constraint
      end_time: null,   // Must be null if is_available is false, per DB constraint
      reason: 'Test Exception H - Full Day Off',
    });
  } else {
    logError('Tech 4 DB ID not found, cannot create exception H.');
    // Potentially throw an error if this is critical
  }

  logInfo(`Prepared ${exceptionsToCreate.length} technician availability exceptions for insertion.`);

  // Subtask 3.3: Insert data and store IDs in insertedIds
  try {
    if (exceptionsToCreate.length > 0) {
      logInfo(`Inserting ${exceptionsToCreate.length} technician availability exceptions...`);
      const { data: insertedExceptionsData, error: insertError } = await insertData(
        supabaseAdmin,
        'technician_availability_exceptions',
        exceptionsToCreate,
        'Comprehensive Test Technician Exceptions'
      );

      if (insertError) throw insertError;

      if (insertedExceptionsData && insertedExceptionsData.length > 0) {
        const createdExceptionIds = insertedExceptionsData.map(ex => ex.id).filter(id => id !== null) as number[];
        insertedIds.technician_availability_exceptions = createdExceptionIds;
        logInfo(`Successfully inserted ${createdExceptionIds.length} exceptions. IDs: ${createdExceptionIds.join(', ')}`);

        // Store the ID for Tech 1's late start as exceptionI_Id
        const tech1LateStartRecord = exceptionsToCreate.find(ex => ex.technician_id === techDbIds[0]);
        if (tech1LateStartRecord) {
          const indexOfTech1Exception = exceptionsToCreate.indexOf(tech1LateStartRecord);
          if (createdExceptionIds[indexOfTech1Exception]) {
            insertedIds.exceptionI_Id = [createdExceptionIds[indexOfTech1Exception]]; 
          }
        }

        // Store the ID for Tech 4's full day off as exceptionH_Id
        const tech4FullDayOffRecord = exceptionsToCreate.find(ex => ex.technician_id === techDbIds[3]);
        if (tech4FullDayOffRecord) {
          const indexOfTech4Exception = exceptionsToCreate.indexOf(tech4FullDayOffRecord);
          if (createdExceptionIds[indexOfTech4Exception]) {
            insertedIds.exceptionH_Id = [createdExceptionIds[indexOfTech4Exception]]; 
          }
        }
      } else {
        logInfo('No data returned from exception insertion, though no error was thrown.');
      }
    } else {
      logInfo('No technician exceptions to create.');
    }
  } catch (error) {
    logError('Error inserting technician availability exceptions', error);
    // If Tech 1 exception fails due to schema constraint, this will catch it.
    // The test plan might need adjustment or the schema understanding clarified for partial day 'time_off'.
    throw error; 
  }

  // --- Address ID Filtering (Task 4) ---
  logInfo('Preparing job address pool (Task 4)...');

  // Subtask 4.1: Implement address filtering logic
  // Filter baselineRefs.addressIds to exclude IDs 1, 2, 3, and 4 for job locations.
  // Technician home addresses (IDs 1-4) are assumed to be handled by seedScenarioTechnicians
  // and technician-data.ts as per the comprehensive-test-plan.md.
  const jobAddressPool: number[] = (baselineRefs.addressIds?.filter(id => id > 4) ?? []);
  logInfo(`Created jobAddressPool with ${jobAddressPool.length} addresses.`);

  // Subtask 4.2: Add validation for sufficient non-technician addresses
  if (jobAddressPool.length === 0) {
    const errorMsg = 'Not enough non-technician addresses available in baselineRefs for job seeding. Ensure baseline data provides addresses with ID > 4.';
    logError(errorMsg);
    throw new Error(errorMsg);
  }

  logInfo('Comprehensive scheduler test seeding - INCOMPLETE - ... job address pool created and validated.');

  // --- Scenario A: Baseline Schedule with filler jobs (Subtask 5.1) ---
  logInfo('Implementing Scenario A: Baseline Schedule with filler jobs (Subtask 5.1)...');
  const numberOfFillerJobs = 7; // Between 5-10
  const fillerOrdersToCreate: OrderInsert[] = [];
  const fillerJobTemplates: Omit<JobInsert, 'order_id'>[] = [];

  try {
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || !BASIC_SERVICE_IDS.length) {
      throw new Error('Missing baseline data (customerIds, customerVehicleIds, or basic services) for Scenario A filler jobs.');
    }

    for (let i = 0; i < numberOfFillerJobs; i++) {
      const customerId = getRandomElement(baselineRefs.customerIds!);
      const addressId = getRandomElement(jobAddressPool); // Use the filtered pool
      const vehicleId = getRandomElement(baselineRefs.customerVehicleIds!);
      const serviceId = getRandomElement(BASIC_SERVICE_IDS);

      const order: OrderInsert = {
        user_id: customerId,
        address_id: addressId,
        vehicle_id: vehicleId,
        notes: `Scenario A - Filler Order ${i + 1}`,
      };
      fillerOrdersToCreate.push(order);

      const jobTemplate: Omit<JobInsert, 'order_id'> = {
        service_id: serviceId,
        address_id: addressId,
        status: 'queued' as Enums<'job_status'>,
        priority: 2, // Default priority
        notes: faker.lorem.sentence(),
        job_duration: faker.number.int({ min: 60, max: 180 }),
      };
      fillerJobTemplates.push(jobTemplate);
    }

    // Insert Orders
    const { data: insertedFillerOrdersData, error: fillerOrderError } = await insertData(
      supabaseAdmin,
      'orders',
      fillerOrdersToCreate,
      'Scenario A Filler Orders'
    );
    if (fillerOrderError) throw fillerOrderError;
    const insertedFillerOrders = insertedFillerOrdersData ?? [];
    if (insertedFillerOrders.length !== numberOfFillerJobs) {
      logInfo(`Warning: Expected ${numberOfFillerJobs} filler orders, but received ${insertedFillerOrders.length}`);
    }

    // Construct and Insert Jobs
    const fillerJobsToCreate: JobInsert[] = [];
    for (let i = 0; i < insertedFillerOrders.length; i++) {
      const orderId = insertedFillerOrders[i]?.id;
      if (!orderId) {
        logInfo(`Warning: Filler Order ID at index ${i} is missing. Skipping corresponding job.`);
        continue;
      }
      fillerJobsToCreate.push({
        ...fillerJobTemplates[i],
        order_id: orderId,
      });
    }

    if (fillerJobsToCreate.length > 0) {
      const { data: insertedFillerJobsData, error: fillerJobError } = await insertData(
        supabaseAdmin,
        'jobs',
        fillerJobsToCreate,
        'Scenario A Filler Jobs'
      );
      if (fillerJobError) throw fillerJobError;
      const createdFillerJobIds = (insertedFillerJobsData ?? []).map(j => j.id).filter(id => id !== null) as number[];
      insertedIds.fillerJobIds = createdFillerJobIds;
      logInfo(`Successfully inserted ${createdFillerJobIds.length} filler jobs for Scenario A. IDs: ${createdFillerJobIds.join(', ')}`);
    } else {
      logInfo('No filler jobs were created for Scenario A (possibly due to order insertion issues).');
    }

  } catch (error) {
    logError('Error implementing Scenario A (Filler Jobs)', error);
    throw error; // Re-throw
  }

  // --- Scenario B: Bundle Equipment Conflict (Subtask 5.2) ---
  logInfo('Implementing Scenario B: Bundle Equipment Conflict (Subtask 5.2)...');
  try {
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0) {
      throw new Error('Missing baseline data (customers, vehicles, or addresses) for Scenario B.');
    }

    const orderZ_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: getRandomElement(jobAddressPool),
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario B - Order Z',
    };

    const { data: insertedOrderZData, error: orderZError } = await insertData(
      supabaseAdmin,
      'orders',
      [orderZ_ToCreate],
      'Scenario B Order Z'
    );
    if (orderZError || !insertedOrderZData || insertedOrderZData.length === 0) {
      throw new Error('Failed to insert Order Z for Scenario B. Error: ' + orderZError?.message);
    }
    const orderZ_Id = insertedOrderZData[0].id;
    insertedIds.orderZ_Id = [orderZ_Id]; // Store as array
    if (insertedIds.orders) insertedIds.orders.push(orderZ_Id); else insertedIds.orders = [orderZ_Id];

    const jobZ1_ToCreate: JobInsert = {
      order_id: orderZ_Id,
      service_id: genericProgServiceId,
      address_id: orderZ_ToCreate.address_id,
      status: 'queued',
      priority: 2,
      notes: 'Scenario B - Job Z1 (prog/BCM)',
      job_duration: 60,
    };

    const jobZ2_ToCreate: JobInsert = {
      order_id: orderZ_Id,
      service_id: genericImmoServiceId,
      address_id: orderZ_ToCreate.address_id,
      status: 'queued',
      priority: 2,
      notes: 'Scenario B - Job Z2 (immo/Immobilizer R&R)',
      job_duration: 60,
    };

    const jobsZ_ToCreate = [jobZ1_ToCreate, jobZ2_ToCreate];
    const { data: insertedJobsZData, error: jobsZError } = await insertData(
      supabaseAdmin,
      'jobs',
      jobsZ_ToCreate,
      'Scenario B Jobs Z1 & Z2'
    );

    if (jobsZError || !insertedJobsZData || insertedJobsZData.length < 2) {
      throw new Error('Failed to insert Jobs Z1 & Z2 for Scenario B. Error: ' + jobsZError?.message);
    }
    
    const jobZ1_Id = insertedJobsZData.find(j => j.service_id === genericProgServiceId)?.id;
    const jobZ2_Id = insertedJobsZData.find(j => j.service_id === genericImmoServiceId)?.id;

    if (jobZ1_Id) {
        insertedIds.jobZ1_Id = [jobZ1_Id];
        if (insertedIds.jobs) insertedIds.jobs.push(jobZ1_Id); else insertedIds.jobs = [jobZ1_Id];
    }
    if (jobZ2_Id) {
        insertedIds.jobZ2_Id = [jobZ2_Id];
        if (insertedIds.jobs) insertedIds.jobs.push(jobZ2_Id); else insertedIds.jobs = [jobZ2_Id];
    }

    logInfo(`Scenario B: Successfully seeded Order Z (ID: ${orderZ_Id}), Job Z1 (ID: ${jobZ1_Id}, service: ${genericProgServiceId}), Job Z2 (ID: ${jobZ2_Id}, service: ${genericImmoServiceId}).`);

  } catch (error) {
    logError('Error implementing Scenario B: Bundle Equipment Conflict', error);
    throw error; // Re-throw
  }

  // --- Scenario C: Equipment Conflict (Single Job) (Subtask 5.3) ---
  logInfo('Implementing Scenario C: Equipment Conflict (Single Job) (Subtask 5.3)...');
  try {
    let rareToolEquipmentId: number;
    let rareServiceId: number;

    // 1. Ensure 'rare_tool' equipment exists or create it
    const { data: existingRareTool, error: fetchRareToolError } = await supabaseAdmin
      .from('equipment')
      .select('id')
      .eq('model', 'rare_tool')
      .single();

    if (fetchRareToolError && fetchRareToolError.code !== 'PGRST116') { // PGRST116: no rows found
      throw new Error('Error checking for existing rare_tool: ' + fetchRareToolError.message);
    }

    if (existingRareTool) {
      rareToolEquipmentId = existingRareTool.id;
      logInfo(`Found existing 'rare_tool' equipment with ID: ${rareToolEquipmentId}`);
    } else {
      const { data: newRareToolData, error: newRareToolError } = await insertData(
        supabaseAdmin,
        'equipment',
        [{ model: 'rare_tool', equipment_type: 'diag' as Enums<'service_category'> }],
        'Scenario C Rare Tool Equipment'
      );
      if (newRareToolError || !newRareToolData || newRareToolData.length === 0) {
        throw new Error(`Failed to insert 'rare_tool' equipment: ${newRareToolError?.message}`);
      }
      rareToolEquipmentId = newRareToolData[0].id;
      if (insertedIds.equipment) insertedIds.equipment.push(rareToolEquipmentId); else insertedIds.equipment = [rareToolEquipmentId];
      logInfo(`Created new 'rare_tool' equipment with ID: ${rareToolEquipmentId}`);
    }
    insertedIds.rareToolEquipmentId = [rareToolEquipmentId];

    // 2. Ensure 'Rare Service' service exists or create it
    const RARE_SERVICE_NAME = 'Rare Service';
    const { data: existingRareService, error: fetchRareServiceError } = await supabaseAdmin
      .from('services')
      .select('id')
      .eq('service_name', RARE_SERVICE_NAME)
      .single();
    
    if (fetchRareServiceError && fetchRareServiceError.code !== 'PGRST116') {
        throw new Error('Error checking for existing Rare Service: ' + fetchRareServiceError.message);
    }

    if (existingRareService) {
        rareServiceId = existingRareService.id;
        logInfo(`Found existing '${RARE_SERVICE_NAME}' service with ID: ${rareServiceId}`);
    } else {
        const { data: newRareServiceData, error: newRareServiceError } = await insertData(
            supabaseAdmin,
            'services',
            [{ service_name: RARE_SERVICE_NAME, service_category: 'diag' as Enums<'service_category'>, slug: 'rare-service' }],
            'Scenario C Rare Service'
        );
        if (newRareServiceError || !newRareServiceData || newRareServiceData.length === 0) {
            throw new Error('Failed to insert Rare Service: ' + newRareServiceError?.message);
        }
        rareServiceId = newRareServiceData[0].id;
        // if (insertedIds.services) insertedIds.services.push(rareServiceId); else insertedIds.services = [rareServiceId]; // Optional if tracking all services
        logInfo(`Created new '${RARE_SERVICE_NAME}' service with ID: ${rareServiceId}`);
    }
    insertedIds.rareServiceId = [rareServiceId];

    // 3. Insert into equipment_requirements (unified table)
    if (!baselineRefs.ymmIds?.length) {
      throw new Error('Missing baseline YMM IDs for Scenario C.');
    }
    const ymmIdForRareService = getRandomElement(baselineRefs.ymmIds);
    const equipmentRequirement: TablesInsert<'equipment_requirements'> = {
      ymm_id: ymmIdForRareService,
      service_id: rareServiceId,
      equipment_model: 'rare_tool', // This must match the equipment model
    };
    // Check if requirement exists before inserting to avoid duplicates if script re-run
    const { data: existingEquipmentReq, error: fetchEquipmentReqError } = await supabaseAdmin
        .from('equipment_requirements')
        .select('id')
        .match({ ymm_id: ymmIdForRareService, service_id: rareServiceId, equipment_model: 'rare_tool' })
        .maybeSingle(); // Use maybeSingle to handle 0 or 1 row

    if (fetchEquipmentReqError) {
        throw new Error('Error checking existing equipment_requirements: ' + fetchEquipmentReqError.message);
    }
    if (!existingEquipmentReq) {
        const { error: equipmentReqError } = await insertData(
            supabaseAdmin,
            'equipment_requirements',
            [equipmentRequirement],
            'Scenario C Equipment Requirement'
        );
        if (equipmentReqError) {
            throw new Error('Failed to insert equipment_requirement for Scenario C: ' + equipmentReqError.message);
        }
        logInfo(`Created new equipment_requirement for rare_tool and Rare Service.`);
    } else {
        logInfo(`Equipment_requirement for rare_tool and Rare Service already exists (ID: ${existingEquipmentReq.id}).`);
    }
    
    // 4. Create Order E
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0) {
      throw new Error('Missing baseline data (customers, vehicles, addresses) for Order E.');
    }
    // Find a vehicle that matches the YMM ID used for the rare service requirement
    // This is a simplification; in a real scenario, you'd ensure vehicle_id matches a vehicle with this ymm_id.
    // For now, we'll just use a random vehicle, assuming the YMM exists in the customer_vehicles table.
    const orderE_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: getRandomElement(jobAddressPool),
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario C - Order E (Rare Service)',
    };
    const { data: insertedOrderEData, error: orderEError } = await insertData(
      supabaseAdmin,
      'orders',
      [orderE_ToCreate],
      'Scenario C Order E'
    );
    if (orderEError || !insertedOrderEData || insertedOrderEData.length === 0) {
      throw new Error('Failed to insert Order E for Scenario C. Error: ' + orderEError?.message);
    }
    const orderE_Id = insertedOrderEData[0].id;
    insertedIds.orderE_Id = [orderE_Id];
    if (insertedIds.orders) insertedIds.orders.push(orderE_Id); else insertedIds.orders = [orderE_Id];

    // 5. Create Job E
    const jobE_ToCreate: JobInsert = {
      order_id: orderE_Id,
      service_id: rareServiceId,
      address_id: orderE_ToCreate.address_id,
      status: 'queued',
      priority: 1, // High priority to ensure it gets considered
      notes: 'Scenario C - Job E (Requires rare_tool)',
      job_duration: 90,
    };
    const { data: insertedJobEData, error: jobEError } = await insertData(
      supabaseAdmin,
      'jobs',
      [jobE_ToCreate],
      'Scenario C Job E'
    );
    if (jobEError || !insertedJobEData || insertedJobEData.length === 0) {
      throw new Error('Failed to insert Job E for Scenario C. Error: ' + jobEError?.message);
    }
    const jobE_Id = insertedJobEData[0].id;
    insertedIds.jobE_Id = [jobE_Id];
    if (insertedIds.jobs) insertedIds.jobs.push(jobE_Id); else insertedIds.jobs = [jobE_Id];

    logInfo(`Scenario C: Successfully seeded Rare Tool (ID: ${rareToolEquipmentId}), Rare Service (ID: ${rareServiceId}), Order E (ID: ${orderE_Id}), Job E (ID: ${jobE_Id}).`);

  } catch (error) {
    logError('Error implementing Scenario C: Equipment Conflict (Single Job)', error);
    throw error; // Re-throw
  }
  // --- End Scenario C ---

  // --- Scenario D: Fixed Time Future Overflow (Subtask 5.4) ---
  logInfo('Implementing Scenario D: Fixed Time Future Overflow (Subtask 5.4)...');
  try {
    if (!techDbIds[0]) {
      throw new Error('Tech 1 DB ID not found for Scenario D.');
    }
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0 || !BASIC_SERVICE_IDS.length) {
      throw new Error('Missing baseline data for Scenario D.');
    }

    const tomorrowAt10AM_UTC = dayjs.utc().add(1, 'day').hour(10).minute(0).second(0).millisecond(0).toISOString();

    const orderF_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: getRandomElement(jobAddressPool),
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario D - Order F (Fixed Time Tomorrow)',
    };
    const { data: insertedOrderFData, error: orderFError } = await insertData(
      supabaseAdmin,
      'orders',
      [orderF_ToCreate],
      'Scenario D Order F'
    );
    if (orderFError || !insertedOrderFData || insertedOrderFData.length === 0) {
      throw new Error('Failed to insert Order F for Scenario D. Error: ' + orderFError?.message);
    }
    const orderF_Id = insertedOrderFData[0].id;
    insertedIds.orderF_Id = [orderF_Id];
    if (insertedIds.orders) insertedIds.orders.push(orderF_Id); else insertedIds.orders = [orderF_Id];

    const jobF_ToCreate: JobInsert = {
      order_id: orderF_Id,
      service_id: getRandomElement(BASIC_SERVICE_IDS),
      address_id: orderF_ToCreate.address_id,
      status: 'fixed_time',
      priority: 1, // High priority often for fixed jobs
      notes: 'Scenario D - Job F (Fixed Time Tomorrow @ 10:00 UTC for Tech 1)',
      job_duration: 60,
      fixed_assignment: true,
      assigned_technician: techDbIds[0], // Tech 1
      fixed_schedule_time: tomorrowAt10AM_UTC,
    };
    const { data: insertedJobFData, error: jobFError } = await insertData(
      supabaseAdmin,
      'jobs',
      [jobF_ToCreate],
      'Scenario D Job F'
    );
    if (jobFError || !insertedJobFData || insertedJobFData.length === 0) {
      throw new Error('Failed to insert Job F for Scenario D. Error: ' + jobFError?.message);
    }
    const jobF_Id = insertedJobFData[0].id;
    insertedIds.jobF_Id = [jobF_Id];
    if (insertedIds.jobs) insertedIds.jobs.push(jobF_Id); else insertedIds.jobs = [jobF_Id];

    logInfo(`Scenario D: Successfully seeded Order F (ID: ${orderF_Id}), Job F (ID: ${jobF_Id}) fixed for Tech 1 tomorrow at 10:00 UTC.`);

  } catch (error) {
    logError('Error implementing Scenario D: Fixed Time Future Overflow', error);
    throw error; // Re-throw
  }
  // --- End Scenario D ---

  // --- Scenario E: Fixed Time Today (Subtask 5.5) ---
  logInfo('Implementing Scenario E: Fixed Time Today (Subtask 5.5)...');
  try {
    if (!techDbIds[1]) { // Tech 2 for this scenario
      throw new Error('Tech 2 DB ID not found for Scenario E.');
    }
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0 || !BASIC_SERVICE_IDS.length) {
      throw new Error('Missing baseline data for Scenario E.');
    }

    const todayAt15PM_UTC = dayjs.utc().hour(15).minute(0).second(0).millisecond(0).toISOString();

    const orderT_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: getRandomElement(jobAddressPool),
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario E - Order T (Fixed Time Today)',
    };
    const { data: insertedOrderTData, error: orderTError } = await insertData(
      supabaseAdmin,
      'orders',
      [orderT_ToCreate],
      'Scenario E Order T'
    );
    if (orderTError || !insertedOrderTData || insertedOrderTData.length === 0) {
      throw new Error('Failed to insert Order T for Scenario E. Error: ' + orderTError?.message);
    }
    const orderT_Id = insertedOrderTData[0].id;
    insertedIds.orderT_Id = [orderT_Id];
    if (insertedIds.orders) insertedIds.orders.push(orderT_Id); else insertedIds.orders = [orderT_Id];

    const jobT_ToCreate: JobInsert = {
      order_id: orderT_Id,
      service_id: getRandomElement(BASIC_SERVICE_IDS),
      address_id: orderT_ToCreate.address_id,
      status: 'fixed_time',
      priority: 1, 
      notes: 'Scenario E - Job T (Fixed Time Today @ 15:00 UTC for Tech 2)',
      job_duration: 60,
      fixed_assignment: true,
      assigned_technician: techDbIds[1], // Tech 2
      fixed_schedule_time: todayAt15PM_UTC,
    };
    const { data: insertedJobTData, error: jobTError } = await insertData(
      supabaseAdmin,
      'jobs',
      [jobT_ToCreate],
      'Scenario E Job T'
    );
    if (jobTError || !insertedJobTData || insertedJobTData.length === 0) {
      throw new Error('Failed to insert Job T for Scenario E. Error: ' + jobTError?.message);
    }
    const jobT_Id = insertedJobTData[0].id;
    insertedIds.jobT_Id = [jobT_Id];
    if (insertedIds.jobs) insertedIds.jobs.push(jobT_Id); else insertedIds.jobs = [jobT_Id];

    logInfo(`Scenario E: Successfully seeded Order T (ID: ${orderT_Id}), Job T (ID: ${jobT_Id}) fixed for Tech 2 today at 15:00 UTC.`);

  } catch (error) {
    logError('Error implementing Scenario E: Fixed Time Today', error);
    throw error; // Re-throw
  }
  // --- End Scenario E ---

  // --- Scenario F: Long Duration Job (Subtask 6.1) ---
  logInfo('Implementing Scenario F: Long Duration Job (Subtask 6.1)...');
  try {
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0 || !BASIC_SERVICE_IDS.length) {
      throw new Error('Missing baseline data for Scenario F.');
    }

    const orderL_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: getRandomElement(jobAddressPool),
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario F - Order L (Long Duration Job)',
    };
    const { data: insertedOrderLData, error: orderLError } = await insertData(
      supabaseAdmin,
      'orders',
      [orderL_ToCreate],
      'Scenario F Order L'
    );
    if (orderLError || !insertedOrderLData || insertedOrderLData.length === 0) {
      throw new Error('Failed to insert Order L for Scenario F. Error: ' + orderLError?.message);
    }
    const orderL_Id = insertedOrderLData[0].id;
    insertedIds.orderL_Id = [orderL_Id];
    if (insertedIds.orders) insertedIds.orders.push(orderL_Id); else insertedIds.orders = [orderL_Id];

    const jobL_ToCreate: JobInsert = {
      order_id: orderL_Id,
      service_id: getRandomElement(BASIC_SERVICE_IDS),
      address_id: orderL_ToCreate.address_id,
      status: 'queued',
      priority: 3, // Normal priority
      notes: 'Scenario F - Job L (Long Duration - NOW 60 mins)',
      job_duration: 60,
    };
    const { data: insertedJobLData, error: jobLError } = await insertData(
      supabaseAdmin,
      'jobs',
      [jobL_ToCreate],
      'Scenario F Job L'
    );
    if (jobLError || !insertedJobLData || insertedJobLData.length === 0) {
      throw new Error('Failed to insert Job L for Scenario F. Error: ' + jobLError?.message);
    }
    const jobL_Id = insertedJobLData[0].id;
    insertedIds.jobL_Id = [jobL_Id];
    if (insertedIds.jobs) insertedIds.jobs.push(jobL_Id); else insertedIds.jobs = [jobL_Id];

    logInfo(`Scenario F: Successfully seeded Order L (ID: ${orderL_Id}), Job L (ID: ${jobL_Id}) with duration 60 mins.`);

  } catch (error) {
    logError('Error implementing Scenario F: Long Duration Job', error);
    throw error; // Re-throw
  }
  // --- End Scenario F ---

  // --- Scenario G: Same Location (Priority & Equipment) (Subtask 6.2) ---
  logInfo('Implementing Scenario G: Same Location (Priority & Equipment) (Subtask 6.2)...');
  try {
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0) {
      throw new Error('Missing baseline data (customers, vehicles, or addresses) for Scenario G.');
    }
    if (!techDbIds[2]) { // Tech 3 for this scenario as per PRD equipment setup
        throw new Error('Tech 3 DB ID not found for Scenario G.');
    }

    const addressS_Id = getRandomElement(jobAddressPool);

    const orderS_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: addressS_Id,
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario G - Order S (Same Location)',
    };
    const { data: insertedOrderSData, error: orderSError } = await insertData(
      supabaseAdmin,
      'orders',
      [orderS_ToCreate],
      'Scenario G Order S'
    );
    if (orderSError || !insertedOrderSData || insertedOrderSData.length === 0) {
      throw new Error('Failed to insert Order S for Scenario G. Error: ' + orderSError?.message);
    }
    const orderS_Id = insertedOrderSData[0].id;
    insertedIds.orderS_Id = [orderS_Id];
    if (insertedIds.orders) insertedIds.orders.push(orderS_Id); else insertedIds.orders = [orderS_Id];

    const jobS1_ToCreate: JobInsert = {
      order_id: orderS_Id,
      service_id: genericProgServiceId,
      address_id: addressS_Id,
      status: 'queued',
      priority: 1,
      notes: 'Scenario G - Job S1 (prog, priority 1)',
      job_duration: 60,
    };

    const jobS2_ToCreate: JobInsert = {
      order_id: orderS_Id,
      service_id: genericProgServiceId,
      address_id: addressS_Id,
      status: 'queued',
      priority: 2,
      notes: 'Scenario G - Job S2 (prog, priority 2)',
      job_duration: 60,
    };

    const jobsS_ToCreate = [jobS1_ToCreate, jobS2_ToCreate];
    const { data: insertedJobsSData, error: jobsSError } = await insertData(
      supabaseAdmin,
      'jobs',
      jobsS_ToCreate,
      'Scenario G Jobs S1 & S2'
    );
    if (jobsSError || !insertedJobsSData || insertedJobsSData.length < 2) {
      throw new Error('Failed to insert Jobs S1 & S2 for Scenario G. Error: ' + jobsSError?.message);
    }
    
    const jobS1_Id = insertedJobsSData.find(j => j.priority === 1)?.id;
    const jobS2_Id = insertedJobsSData.find(j => j.priority === 2)?.id;

    if (jobS1_Id) {
        insertedIds.jobS1_Id = [jobS1_Id];
        if (insertedIds.jobs) insertedIds.jobs.push(jobS1_Id); else insertedIds.jobs = [jobS1_Id];
    }
    if (jobS2_Id) {
        insertedIds.jobS2_Id = [jobS2_Id];
        if (insertedIds.jobs) insertedIds.jobs.push(jobS2_Id); else insertedIds.jobs = [jobS2_Id];
    }
    
    logInfo(`Scenario G: Successfully seeded Order S (ID: ${orderS_Id}), Job S1 (ID: ${jobS1_Id}, service ${genericProgServiceId}), Job S2 (ID: ${jobS2_Id}, service ${genericProgServiceId}) at same address.`);

  } catch (error) {
    logError('Error implementing Scenario G: Same Location', error);
    throw error; // Re-throw
  }
  // --- End Scenario G ---

  // --- Scenario J: Unschedulable Fixed (Subtask 6.5) ---
  logInfo('Implementing Scenario J: Unschedulable Fixed (Subtask 6.5)...');
  try {
    if (!techDbIds[0]) { // Tech 1 for this scenario
      throw new Error('Tech 1 DB ID not found for Scenario J.');
    }
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0 || !BASIC_SERVICE_IDS.length) {
      throw new Error('Missing baseline data for Scenario J.');
    }

    // Tech 1 is available from 14:00 UTC today due to Exception I.
    // This job is fixed for 13:00 UTC, making it unschedulable for Tech 1.
    const todayAt13PM_UTC = dayjs.utc().hour(13).minute(0).second(0).millisecond(0).toISOString();

    const orderU_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: getRandomElement(jobAddressPool),
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario J - Order U (Unschedulable Fixed Time)',
    };
    const { data: insertedOrderUData, error: orderUError } = await insertData(
      supabaseAdmin,
      'orders',
      [orderU_ToCreate],
      'Scenario J Order U'
    );
    if (orderUError || !insertedOrderUData || insertedOrderUData.length === 0) {
      throw new Error('Failed to insert Order U for Scenario J. Error: ' + orderUError?.message);
    }
    const orderU_Id = insertedOrderUData[0].id;
    insertedIds.orderU_Id = [orderU_Id];
    if (insertedIds.orders) insertedIds.orders.push(orderU_Id); else insertedIds.orders = [orderU_Id];

    const jobU_ToCreate: JobInsert = {
      order_id: orderU_Id,
      service_id: getRandomElement(BASIC_SERVICE_IDS),
      address_id: orderU_ToCreate.address_id,
      status: 'fixed_time',
      priority: 1,
      notes: 'Scenario J - Job U (Unschedulable Fixed for Tech 1 @ 13:00 UTC)',
      job_duration: 60,
      fixed_assignment: true,
      assigned_technician: techDbIds[0], // Tech 1
      fixed_schedule_time: todayAt13PM_UTC,
    };
    const { data: insertedJobUData, error: jobUError } = await insertData(
      supabaseAdmin,
      'jobs',
      [jobU_ToCreate],
      'Scenario J Job U'
    );
    if (jobUError || !insertedJobUData || insertedJobUData.length === 0) {
      throw new Error('Failed to insert Job U for Scenario J. Error: ' + jobUError?.message);
    }
    const jobU_Id = insertedJobUData[0].id;
    insertedIds.jobU_Id = [jobU_Id];
    if (insertedIds.jobs) insertedIds.jobs.push(jobU_Id); else insertedIds.jobs = [jobU_Id];

    logInfo(`Scenario J: Successfully seeded Order U (ID: ${orderU_Id}), Job U (ID: ${jobU_Id}) fixed for Tech 1 today at 13:00 UTC (unschedulable).`);

  } catch (error) {
    logError('Error implementing Scenario J: Unschedulable Fixed', error);
    throw error; // Re-throw
  }
  // --- End Scenario J ---

  // --- Scenario M: Locked Job - In Progress (Subtask 7.1) ---
  logInfo('Implementing Scenario M: Locked Job - In Progress (Subtask 7.1)...');
  try {
    if (!techDbIds[0]) { // Tech 1 for this scenario
      throw new Error('Tech 1 DB ID not found for Scenario M.');
    }
    if (!baselineRefs.customerIds?.length || !baselineRefs.customerVehicleIds?.length || jobAddressPool.length === 0 || !BASIC_SERVICE_IDS.length) {
      throw new Error('Missing baseline data for Scenario M.');
    }

    const todayAt09AM_UTC = dayjs.utc().hour(9).minute(0).second(0).millisecond(0).toISOString();

    // Order for Job LCKD
    const orderLCKD_ToCreate: OrderInsert = {
      user_id: getRandomElement(baselineRefs.customerIds!),
      address_id: getRandomElement(jobAddressPool),
      vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
      notes: 'Scenario M - Order for Job LCKD',
    };
    const { data: insertedOrderLCKDData, error: orderLCKDError } = await insertData(supabaseAdmin, 'orders', [orderLCKD_ToCreate], 'Scenario M Order LCKD');
    if (orderLCKDError || !insertedOrderLCKDData || insertedOrderLCKDData.length === 0) {
      throw new Error('Failed to insert Order for Job LCKD (Scenario M). Error: ' + orderLCKDError?.message);
    }
    const orderLCKD_Id = insertedOrderLCKDData[0].id;
    // Not storing orderLCKD_Id in insertedIds unless specifically needed by tests, just its job.
    if (insertedIds.orders) insertedIds.orders.push(orderLCKD_Id); else insertedIds.orders = [orderLCKD_Id];

    // Job LCKD
    const jobLCKD_ToCreate: JobInsert = {
      order_id: orderLCKD_Id,
      service_id: getRandomElement(BASIC_SERVICE_IDS),
      address_id: orderLCKD_ToCreate.address_id,
      status: 'in_progress',
      priority: 1, // Typically high as it's active
      notes: 'Scenario M - Job LCKD (In Progress @ 09:00 UTC for Tech 1)',
      job_duration: 90,
      assigned_technician: techDbIds[0], // Tech 1
      estimated_sched: todayAt09AM_UTC, // This is key for the scenario
      // fixed_assignment and fixed_schedule_time are not typically set for 'in_progress' from field
    };
    const { data: insertedJobLCKDData, error: jobLCKDError } = await insertData(supabaseAdmin, 'jobs', [jobLCKD_ToCreate], 'Scenario M Job LCKD');
    if (jobLCKDError || !insertedJobLCKDData || insertedJobLCKDData.length === 0) {
      throw new Error('Failed to insert Job LCKD for Scenario M. Error: ' + jobLCKDError?.message);
    }
    const jobLCKD_Id = insertedJobLCKDData[0].id;
    insertedIds.jobLCKD_Id = [jobLCKD_Id];
    if (insertedIds.jobs) insertedIds.jobs.push(jobLCKD_Id); else insertedIds.jobs = [jobLCKD_Id];

    // Jobs Q1M and Q2M
    const jobsQM_ToCreate: JobInsert[] = [];
    const ordersQM_ToCreate: OrderInsert[] = [];
    const jobQM_Ids: number[] = [];

    for (let i = 1; i <= 2; i++) {
      const orderQM_ToCreate: OrderInsert = {
        user_id: getRandomElement(baselineRefs.customerIds!),
        address_id: getRandomElement(jobAddressPool),
        vehicle_id: getRandomElement(baselineRefs.customerVehicleIds!),
        notes: `Scenario M - Order for Job Q${i}M`,
      };
      ordersQM_ToCreate.push(orderQM_ToCreate);
    }
    const { data: insertedOrdersQMData, error: ordersQMError } = await insertData(supabaseAdmin, 'orders', ordersQM_ToCreate, 'Scenario M Orders Q1M_Q2M');
    if (ordersQMError || !insertedOrdersQMData || insertedOrdersQMData.length < 2) {
      throw new Error('Failed to insert Orders for Jobs Q1M/Q2M (Scenario M). Error: ' + ordersQMError?.message);
    }

    for (let i = 0; i < insertedOrdersQMData.length; i++) {
      const jobQM_ToCreate: JobInsert = {
        order_id: insertedOrdersQMData[i].id,
        service_id: getRandomElement(BASIC_SERVICE_IDS),
        address_id: ordersQM_ToCreate[i].address_id, // Use address from its own order
        status: 'queued',
        priority: 3, // Normal priority
        notes: `Scenario M - Job Q${i + 1}M (Queued for Tech 1 consideration)`,
        job_duration: 60,
        // earliest_available_time can be set if needed, defaults to now
      };
      jobsQM_ToCreate.push(jobQM_ToCreate);
    }
    const { data: insertedJobsQMData, error: jobsQMError } = await insertData(supabaseAdmin, 'jobs', jobsQM_ToCreate, 'Scenario M Jobs Q1M_Q2M');
    if (jobsQMError || !insertedJobsQMData || insertedJobsQMData.length < 2) {
      throw new Error('Failed to insert Jobs Q1M/Q2M for Scenario M. Error: ' + jobsQMError?.message);
    }
    
    insertedJobsQMData.forEach((job, index) => {
        jobQM_Ids.push(job.id);
        if (index === 0) insertedIds.jobQ1M_Id = [job.id];
        if (index === 1) insertedIds.jobQ2M_Id = [job.id];
        if (insertedIds.jobs) insertedIds.jobs.push(job.id); else insertedIds.jobs = [job.id];
    });

    logInfo(`Scenario M: Successfully seeded Job LCKD (ID: ${jobLCKD_Id}), Q1M (ID: ${insertedIds.jobQ1M_Id?.[0]}), Q2M (ID: ${insertedIds.jobQ2M_Id?.[0]}).`);

  } catch (error) {
    logError('Error implementing Scenario M: Locked Job - In Progress', error);
    throw error; // Re-throw
  }
  // --- End Scenario M ---

  logInfo('Comprehensive scheduler test seeding - ALL SCENARIOS A-M IMPLEMENTED.');

  return { scenarioName, insertedIds };
} 