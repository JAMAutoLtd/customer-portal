import { SupabaseClient } from '@supabase/supabase-js';
// Import types and utils from the central utils file
import {
  Database,
  Tables,
  TablesInsert,
  // BaselineRefs is defined in scenarios/types.ts
  insertData,
  logInfo,
  logError,
} from '../../utils';
// Import BaselineRefs from its actual location
import type { BaselineRefs } from './scenarios/types';
import { cleanupAllTestData } from '../cleanup-staging';
// It's good practice to move large static data arrays to a separate file
import {
  addressesData,
  authUsersData,
  publicUsersData,
  vansData,
  equipmentData,
  ymmRefData,
  servicesData,
  customerVehiclesData,
  diagRequirementsData,
  immoRequirementsData,
  progRequirementsData,
  airbagRequirementsData,
  adasRequirementsData,
  vanEquipmentData,
} from './baseline-data';

// --- Use Type Aliases from Imported Helpers ---
type Address = Tables<'addresses'>;
type PublicUser = Tables<'users'>;
type Van = Tables<'vans'>;
type Equipment = Tables<'equipment'>;
type YmmRef = Tables<'ymm_ref'>;
type Service = Tables<'services'>;
type CustomerVehicle = Tables<'customer_vehicles'>;
type Technician = Tables<'technicians'>;
// Explicitly use the Insert type helper for data being inserted
type TechnicianInsert = TablesInsert<'technicians'>;
type VanInsert = TablesInsert<'vans'>;
type UserInsert = TablesInsert<'users'>;


// --- Define Interface for Auth User Creation Data (Keep local if only used here) ---
interface AuthUserSeedData {
  id: string;
  email: string;
  password?: string;
}

/**
 * Seeds the staging database with baseline static data.
 * Seeds NO technicians, but seeds all vans and default van equipment.
 * @param supabaseAdmin Supabase client instance with service role privileges.
 * @returns An object containing references (actual IDs) to the created baseline entities (excluding technicians).
 */
export async function seedBaseline(
  supabaseAdmin: SupabaseClient<Database>
): Promise<BaselineRefs> {
  logInfo(`Starting baseline database seeding (NO technicians, seeding vans + equipment)...`);

  // 1. Call Cleanup
  logInfo('Cleaning up existing test data...');
  try {
    // Pass true to skip the internal confirmation prompts in the cleanup function
    await cleanupAllTestData(supabaseAdmin, true); 
    logInfo('Cleanup function executed successfully.');
  } catch (cleanupError) {
    logError('Error during cleanup phase. Halting seeding.', cleanupError);
    throw cleanupError;
  }

  // 2. Prepare Data (No technician filtering needed)
  logInfo(`Using baseline customer users, addresses, vehicles, vans, equipment, services, requirements...`);
  const customerUserSeedData = authUsersData.filter((u) => !u.email.startsWith('tech'));
  const customerUserAuthIds = customerUserSeedData.map((u) => u.id);
  const filteredPublicUsersInput: UserInsert[] = publicUsersData.filter((u) => customerUserAuthIds.includes(u.id));
  // Use ALL vans
  const filteredVansInput: VanInsert[] = vansData; 

  // 3. Insert Customer Auth Users ONLY
  logInfo(`Creating/Verifying ${customerUserSeedData.length} customer auth users...`);
  for (const user of customerUserSeedData) {
    try {
      const { error: authError } = await supabaseAdmin.auth.admin.createUser({
        user_metadata: { full_name: publicUsersData.find((pu) => pu.id === user.id)?.full_name ?? 'Test User' },
        email: user.email,
        password: user.password || 'password',
        email_confirm: true,
        app_metadata: { provider: 'email' },
        id: user.id,
      });
      if (authError) {
        if ( authError.message.includes('User already registered') || authError.message.includes('duplicate key value violates unique constraint') || (authError as any).code === 'user_already_exists') {
          logInfo(`Auth user ${user.email} (ID: ${user.id}) already exists. Skipping creation.`);
        } else {
          logError(`Error creating auth user ${user.email}: ${authError.message}`, authError);
        }
      } else {
        logInfo(`Auth user ${user.email} created successfully.`);
      }
    } catch (error) {
      logError(`Critical error during auth user processing for ${user.email}: ${(error as Error).message}`, error);
      throw error; // Re-throw critical errors
    }
  }

  // 4. Insert Public Data & Capture Actual IDs
  const refs: Partial<BaselineRefs> = {
    customerIds: customerUserAuthIds,
  };

  try {
    logInfo('Inserting public table data (excluding technicians)...');

    const addressesResult = await insertData(supabaseAdmin, 'addresses', addressesData, 'Static addresses');
    if (addressesResult.error) throw addressesResult.error;
    refs.addressIds = addressesResult.data?.map((r) => r.id) ?? [];

    const equipmentResult = await insertData(supabaseAdmin, 'equipment', equipmentData, 'Static equipment');
    if (equipmentResult.error) throw equipmentResult.error;
    refs.equipmentIds = equipmentResult.data?.map((r) => r.id) ?? [];

    const ymmResult = await insertData(supabaseAdmin, 'ymm_ref', ymmRefData, 'YMM references');
    if (ymmResult.error) throw ymmResult.error;
    refs.ymmIds = ymmResult.data?.map((r) => r.ymm_id) ?? [];

    const servicesResult = await insertData(supabaseAdmin, 'services', servicesData, 'Service definitions');
    if (servicesResult.error) throw servicesResult.error;
    refs.serviceIds = servicesResult.data?.map((r) => r.id) ?? [];

    const validPublicUsersInput = filteredPublicUsersInput.filter(user =>
        customerUserAuthIds.includes(user.id)
    );
    const usersResult = await insertData(supabaseAdmin, 'users', validPublicUsersInput, 'Public user profiles');
    if (usersResult.error) throw usersResult.error;

    // Insert ALL customer vehicles (including vans, for FK constraints with `vans` table)
    const allVehiclesResult = await insertData(supabaseAdmin, 'customer_vehicles', customerVehiclesData, 'All customer vehicles (incl. vans)');
    if (allVehiclesResult.error) throw allVehiclesResult.error;
    const allInsertedVehiclesFromDB = allVehiclesResult.data ?? [];

    // Filter for BaselineRefs.customerVehicleIds: only vehicles with a matching YMM entry
    logInfo('Filtering customer vehicles for BaselineRefs: ensuring matching ymm_ref entry...');
    const ymmStringSet = new Set(
      ymmRefData.map(ymm => `${ymm.year}-${String(ymm.make).toUpperCase()}-${String(ymm.model).toUpperCase()}`)
    );
    // Log a sample of ymmStringSet for verification
    const ymmStringSetSample = Array.from(ymmStringSet).slice(0, 5);
    logInfo(`Sample of ymmStringSet: ${JSON.stringify(ymmStringSetSample)} (Total: ${ymmStringSet.size})`);

    const filteredVehicleIdsForJobs = allInsertedVehiclesFromDB
      .filter(cv => {
        if (cv.year && cv.make && cv.model) {
          const vehicleYmmString = `${cv.year}-${String(cv.make).toUpperCase()}-${String(cv.model).toUpperCase()}`;
          const hasMatch = ymmStringSet.has(vehicleYmmString);
          // Log each vehicle being checked
          logInfo(`Checking vehicle ID ${cv.id} (${cv.year} ${cv.make} ${cv.model}): YMM string '${vehicleYmmString}', Match in ymmStringSet: ${hasMatch}`);
          return hasMatch;
        }
        logInfo(`Skipping vehicle ID ${cv.id} due to missing year, make, or model.`);
        return false;
      })
      .map(cv => cv.id as number); // Ensure the IDs are numbers

    refs.customerVehicleIds = filteredVehicleIdsForJobs;
    logInfo(`Populated BaselineRefs.customerVehicleIds with ${filteredVehicleIdsForJobs.length} vehicles that have matching ymm_ref entries.`);
    if (filteredVehicleIdsForJobs.length === 0 && allInsertedVehiclesFromDB.length > 0) {
        logInfo('Warning: No customer vehicles found with matching YMM entries for job seeding. This might be an issue if scenarios expect to create jobs.');
    }

    const vansResult = await insertData(supabaseAdmin, 'vans', filteredVansInput, 'Van(s)');
    if (vansResult.error) throw vansResult.error;
    refs.vanIds = vansResult.data?.map((r) => r.id) ?? [];

    // Insert requirements data
    await insertData(supabaseAdmin, 'diag_equipment_requirements', diagRequirementsData, 'Diag requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'immo_equipment_requirements', immoRequirementsData, 'Immo requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'prog_equipment_requirements', progRequirementsData, 'Prog requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'airbag_equipment_requirements', airbagRequirementsData, 'Airbag requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'adas_equipment_requirements', adasRequirementsData, 'ADAS requirements').then(r => { if (r.error) throw r.error; });

    // Insert default van equipment associations
    await insertData(supabaseAdmin, 'van_equipment', vanEquipmentData, 'Default van equipment').then(r => { if (r.error) throw r.error; });

  } catch (error) {
    logError('Halting baseline seeding due to public table insertion error.', error);
    throw error;
  }

  // 6. Manually update sequences for tables where scenarios might add new items
  try {
    logInfo('Updating ID sequences for services and equipment tables...');
    await supabaseAdmin.rpc('execute_sql', { 
      sql: `SELECT setval(pg_get_serial_sequence('services', 'id'), COALESCE((SELECT MAX(id) FROM services), 1), true);`
    });
    await supabaseAdmin.rpc('execute_sql', { 
      sql: `SELECT setval(pg_get_serial_sequence('equipment', 'id'), COALESCE((SELECT MAX(id) FROM equipment), 1), true);`
    });
    // Add for other tables if scenarios insert into them without explicit IDs and they have baseline data with explicit IDs
    logInfo('Successfully updated ID sequences.');
  } catch (sequenceError) {
    logError('Error updating ID sequences', sequenceError);
    throw sequenceError; // Critical if sequences are not right
  }

  logInfo('Baseline database seeding completed successfully.');

  // Validate and Return Final Refs
  const finalRefs: BaselineRefs = {
    addressIds: refs.addressIds ?? [],
    customerIds: refs.customerIds ?? [],
    vanIds: refs.vanIds ?? [],
    equipmentIds: refs.equipmentIds ?? [],
    serviceIds: refs.serviceIds ?? [],
    ymmIds: refs.ymmIds ?? [],
    customerVehicleIds: refs.customerVehicleIds ?? [],
  };

  // Final validation
  if (!(finalRefs.vanIds?.length)) {
    logError(`Baseline seeding inconsistency: No Van IDs collected.`);
  }
  if (!(finalRefs.addressIds?.length) || !(finalRefs.customerIds?.length) || !(finalRefs.equipmentIds?.length) || !(finalRefs.serviceIds?.length)) {
      logInfo('Warning: Some essential baseline reference ID arrays are empty. This might affect scenario seeding.');
  }

  return finalRefs;
}

// NOTE: Assumes baseline-data.ts exists and exports all the required data arrays.