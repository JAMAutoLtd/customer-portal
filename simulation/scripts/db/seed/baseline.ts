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
  techniciansData,
  diagRequirementsData,
  immoRequirementsData,
  progRequirementsData,
  airbagRequirementsData,
  adasRequirementsData,
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
 * @param supabaseAdmin Supabase client instance with service role privileges.
 * @param technicianCount The number of technicians (1-4) to include in the baseline.
 * @returns An object containing references (actual IDs) to the created baseline entities.
 */
export async function seedBaseline(
  supabaseAdmin: SupabaseClient<Database>,
  technicianCount: 1 | 2 | 3 | 4
): Promise<BaselineRefs> {
  logInfo(`Starting baseline database seeding with ${technicianCount} technician(s)...`);

  if (![1, 2, 3, 4].includes(technicianCount)) {
    logError('Invalid technicianCount. Must be 1, 2, 3, or 4.');
    throw new Error('Invalid technicianCount. Must be 1, 2, 3, or 4.');
  }

  // 1. Call Cleanup
  logInfo('Cleaning up existing test data...');
  try {
    await cleanupAllTestData(supabaseAdmin);
    logInfo('Cleanup function executed successfully.');
  } catch (cleanupError) {
    logError('Error during cleanup phase. Halting seeding.', cleanupError);
    throw cleanupError;
  }

  // 2. Filter Data based on technicianCount
  logInfo(`Filtering data for ${technicianCount} technician(s)...`);
  const techUserSeedData = authUsersData
    .filter((u) => u.email.startsWith('tech'))
    .slice(0, technicianCount);
  const customerUserSeedData = authUsersData.filter((u) => !u.email.startsWith('tech'));
  const filteredAuthUserSeedData = [...techUserSeedData, ...customerUserSeedData];
  const filteredAuthUserIds = filteredAuthUserSeedData.map((u) => u.id);
  const customerUserAuthIds = customerUserSeedData.map((u) => u.id);
  const filteredPublicUsersInput: UserInsert[] = publicUsersData.filter((u) => filteredAuthUserIds.includes(u.id));
  const filteredTechniciansInput: TechnicianInsert[] = techniciansData.filter((t) => techUserSeedData.some((techUser) => techUser.id === t.user_id));
  const techVanIds = filteredTechniciansInput.map((t) => t.assigned_van_id).filter((id): id is number => id != null);
  const filteredVansInput: VanInsert[] = vansData.filter((v) => techVanIds.includes(v.id));


  // 3. Insert Auth Users
  logInfo(`Creating/Verifying ${filteredAuthUserSeedData.length} auth users...`);
  const createdTechnicianAuthIds: string[] = [];
  for (const user of filteredAuthUserSeedData) {
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
          // Log specific error but continue if possible, maybe just this user fails
          logError(`Error creating auth user ${user.email}: ${authError.message}`, authError);
          // Decide if this should be a fatal error: throw authError;
        }
      } else {
        logInfo(`Auth user ${user.email} created successfully.`);
      }
      // Collect successfully created/verified technician IDs
      if (techUserSeedData.some((techUser) => techUser.id === user.id)) {
        // We assume if no error or "already exists", the ID is valid
         createdTechnicianAuthIds.push(user.id);
      }
    } catch (error) {
      logError(`Critical error during auth user processing for ${user.email}: ${(error as Error).message}`, error);
      throw error; // Re-throw critical errors
    }
  }
   // Validate if the number of collected technician IDs matches the requested count
  if (createdTechnicianAuthIds.length !== technicianCount) {
    logError(`Mismatch: Expected ${technicianCount} technicians, but only processed/verified ${createdTechnicianAuthIds.length} auth users.`);
     // Decide if this should be fatal: throw new Error("Technician auth user count mismatch");
  }


  // 4. Insert Public Data & Capture Actual IDs
  const refs: Partial<BaselineRefs> = {
    technicianIds: createdTechnicianAuthIds, // Use successfully processed IDs
    customerIds: customerUserAuthIds, // Use IDs from filtered input data
  };

  try {
    logInfo('Inserting public table data...');

    const addressesResult = await insertData(supabaseAdmin, 'addresses', addressesData, 'Static addresses');
    if (addressesResult.error) throw addressesResult.error;
    refs.addressIds = addressesResult.data?.map((r) => r.id) ?? [];

    const equipmentResult = await insertData(supabaseAdmin, 'equipment', equipmentData, 'Static equipment');
    if (equipmentResult.error) throw equipmentResult.error;
    refs.equipmentIds = equipmentResult.data?.map((r) => r.id) ?? [];

    const ymmResult = await insertData(supabaseAdmin, 'ymm_ref', ymmRefData, 'YMM references');
    if (ymmResult.error) throw ymmResult.error;
    refs.ymmRefIds = ymmResult.data?.map((r) => r.ymm_id) ?? [];

    const servicesResult = await insertData(supabaseAdmin, 'services', servicesData, 'Service definitions');
    if (servicesResult.error) throw servicesResult.error;
    refs.serviceIds = servicesResult.data?.map((r) => r.id) ?? [];

    // Ensure the public user IDs being inserted actually exist in the auth table
    const validPublicUsersInput = filteredPublicUsersInput.filter(user =>
        customerUserAuthIds.includes(user.id) || createdTechnicianAuthIds.includes(user.id)
    );
    const usersResult = await insertData(supabaseAdmin, 'users', validPublicUsersInput, 'Public user profiles');
    if (usersResult.error) throw usersResult.error;

    const vehiclesResult = await insertData(supabaseAdmin, 'customer_vehicles', customerVehiclesData, 'Customer vehicles');
    if (vehiclesResult.error) throw vehiclesResult.error;
    refs.customerVehicleIds = vehiclesResult.data?.map((r) => r.id) ?? [];

    const vansResult = await insertData(supabaseAdmin, 'vans', filteredVansInput, 'Van(s)');
    if (vansResult.error) throw vansResult.error;
    refs.vanIds = vansResult.data?.map((r) => r.id) ?? [];

    // Ensure the technician user IDs being inserted actually exist
     const validTechniciansInput = filteredTechniciansInput.filter(tech =>
        createdTechnicianAuthIds.includes(tech.user_id!) // Ensure user_id is checked
    );
    // Cast might still be needed if filteredTechniciansInput is not strictly TechnicianInsert[]
    const techniciansResult = await insertData(supabaseAdmin, 'technicians', validTechniciansInput as TechnicianInsert[], 'Technician profiles');
    if (techniciansResult.error) throw techniciansResult.error;


    // Insert requirements data (check errors, use 4 args)
    await insertData(supabaseAdmin, 'diag_equipment_requirements', diagRequirementsData, 'Diag requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'immo_equipment_requirements', immoRequirementsData, 'Immo requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'prog_equipment_requirements', progRequirementsData, 'Prog requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'airbag_equipment_requirements', airbagRequirementsData, 'Airbag requirements').then(r => { if (r.error) throw r.error; });
    await insertData(supabaseAdmin, 'adas_equipment_requirements', adasRequirementsData, 'ADAS requirements').then(r => { if (r.error) throw r.error; });

  } catch (error) {
    logError('Halting baseline seeding due to public table insertion error.', error);
    throw error;
  }

  logInfo('Baseline database seeding completed successfully.');

  // 5. Validate and Return Final Refs
  const finalRefs: BaselineRefs = {
    addressIds: refs.addressIds ?? [],
    customerIds: refs.customerIds ?? [], // Use IDs from initial filter
    technicianIds: refs.technicianIds ?? [], // Use IDs collected from auth loop
    vanIds: refs.vanIds ?? [],
    equipmentIds: refs.equipmentIds ?? [],
    serviceIds: refs.serviceIds ?? [],
    ymmRefIds: refs.ymmRefIds ?? [],
    customerVehicleIds: refs.customerVehicleIds ?? [],
  };

  // Final validation
  if (finalRefs.technicianIds.length !== technicianCount) {
    logError(`Baseline seeding inconsistency: Expected ${technicianCount} technician IDs, but collected ${finalRefs.technicianIds.length}`);
  }
  if (!finalRefs.addressIds.length || !finalRefs.customerIds.length || !finalRefs.equipmentIds.length || !finalRefs.serviceIds.length) {
      logInfo('Warning: Some baseline reference ID arrays are empty. This might affect scenario seeding.');
  }

  return finalRefs;
}

// NOTE: Assumes baseline-data.ts exists and exports all the required data arrays.