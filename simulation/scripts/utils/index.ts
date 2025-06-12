import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
// import dotenv from 'dotenv'; // No longer needed here
import path from 'path';
// Explicitly import the types needed within this module
import { Database, Tables, TablesInsert } from '../db/seed/staged.database.types';
// Corrected import path for baseline data - Removed techniciansData import
import { authUsersData, publicUsersData } from '../db/seed/baseline-data';
// Remove incorrect import of types.ts
// import type { UserInsert, TechnicianInsert } from './db/seed/types';
import {
  technicianAuthUsersData,
  technicianPublicUsersData,
  technicianTechniciansData,
  technicianVansData // Import van data from technician-data as well
} from '../db/seed/technician-data';

// dotenv.config({ path: path.resolve(__dirname, '../../.env.test') }); // Removed: Handled by -r dotenv/config

/**
 * Creates a Supabase client instance configured for the Staging environment.
 * Assumes environment variables are already loaded via preloading (-r dotenv/config).
 * Reads connection details from environment variables:
 * - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL` as fallback)
 * - `SUPABASE_SERVICE_ROLE_KEY` (if `useServiceRole` is true)
 * - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (if `useServiceRole` is false)
 *
 * @param useServiceRole - If true, uses the service role key; otherwise, uses the anonymous key.
 * @returns A configured Supabase client instance.
 * @throws Error if the required URL or key environment variables are missing.
 */
export function createStagingSupabaseClient(useServiceRole = false): SupabaseClient<Database> { // Add Database type generic
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Supabase URL is not defined. Ensure NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is set in the loaded .env file');
  }

  if (!supabaseKey) {
    const keyName = useServiceRole ? 'SUPABASE_SERVICE_ROLE_KEY' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
    throw new Error(`Supabase key (${keyName}) is not defined. Ensure it is set in the loaded .env file`);
  }

  // Add the Database generic type for better type safety
  return createClient<Database>(supabaseUrl, supabaseKey);
}

// --- Type Exports ---
// Re-export types from the generated database types file once it exists (Stage 3)
export * from '../db/seed/staged.database.types';

// --- Logging Utilities ---
// Add shared logging functions here if desired.
export const logInfo = (message: string): void => {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
};

export const logError = (message: string, error?: unknown): void => {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
  if (error) {
    console.error('Associated Error:', error);
  }
};

// --- Database Utilities ---

/**
 * Generic helper to insert data into a specified table.
 * Handles potential errors during insertion.
 * Uses generics to ensure the returned data array is correctly typed as the Row[] type for the specified table.
 * @returns The result object `{ data, error }` where data is correctly typed as `Row[] | null`.
 */
export async function insertData<
  TableName extends keyof Database['public']['Tables'] // Generic for the table name
>(
  supabaseAdmin: SupabaseClient<Database>,
  tableName: TableName, // Use the generic TableName
  // Use TablesInsert helper with the generic
  data: TablesInsert<TableName>[],
  description: string
): Promise<{
  // Use Tables helper with the generic for the Row type
  data: Tables<TableName>[] | null;
  error: PostgrestError | null;
}> {
  if (data.length === 0) {
    logInfo(`Skipping insertion into ${String(tableName)} - No data provided.`);
    return { data: [], error: null };
  }

  logInfo(`Inserting ${data.length} records into ${String(tableName)} (${description})...`);

  const result = await supabaseAdmin
    .from(tableName)
    .insert(data as any) // Use type assertion here as Supabase types can be complex
    .select();

  // Log errors or success
  if (result.error) {
    logError(`Error inserting data into ${String(tableName)}: ${result.error.message}`, result.error);
  } else if (!result.data) {
      logInfo(`Successfully inserted into ${String(tableName)}, but no data was returned by select().`);
  } else {
      logInfo(`Successfully inserted ${result.data.length} records into ${String(tableName)}.`);
  }

  // Cast the final return to the explicitly defined return type to satisfy TypeScript
  return result as {
    data: Tables<TableName>[] | null;
    error: PostgrestError | null;
  };
}

// --- New Seeding Utility Function --- 

interface SeedTechnicianInfo {
    dbId: number;
    authId: string;
    assignedVanId: number;
}

interface SeedTechniciansResult {
    seededTechnicians: SeedTechnicianInfo[];
}

/**
 * Creates/verifies auth users, public users, and technician profiles for a scenario.
 * Assigns available vans from the baseline pool.
 * 
 * @param supabaseAdmin Supabase client
 * @param technicianCount Number of technicians to seed (1-4)
 * @param availableVanIds Array of baseline van IDs available for assignment
 * @returns Object containing an array of seeded technician info (DB ID, Auth ID, Van ID).
 */
export async function seedScenarioTechnicians(
    supabaseAdmin: SupabaseClient<Database>,
    technicianCount: number,
    // availableVanIds: number[] | undefined // No longer needed as input, use static van data
): Promise<SeedTechniciansResult> { // Update return type
    logInfo(`Seeding ${technicianCount} technicians for scenario...`);

    // Validate technician count against available definitions
    if (technicianCount > technicianAuthUsersData.length) {
        throw new Error(
            `Requested technician count (${technicianCount}) exceeds available definitions (${technicianAuthUsersData.length}). Please add more technician definitions to technician-data.ts or request fewer technicians.`
        );
    }
    if (technicianCount > technicianVansData.length) {
        throw new Error(
            `Requested technician count (${technicianCount}) exceeds available van definitions (${technicianVansData.length}). Please add more van definitions to technician-data.ts or request fewer technicians.`
        );
    }
    // Select the required number of technician definitions
    const authUsersToCreate = technicianAuthUsersData.slice(0, technicianCount);
    const publicUsersToCreate = technicianPublicUsersData.slice(0, technicianCount);
    const techniciansInputData = technicianTechniciansData.slice(0, technicianCount);
    const vansToUse = technicianVansData.slice(0, technicianCount); // Use vans from tech data

    const createdOrConfirmedAuthIds: string[] = [];
    for (const user of authUsersToCreate) {
        let userExists = false;
        try {
            // Attempt to fetch the user by ID
            const { data: getUserData, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(user.id);

            // Check for fetch errors *other than* user not found
            if (fetchErr && fetchErr.status !== 404) { // Check status code for "Not Found"
                logError(`Error fetching auth user ${user.email}: ${fetchErr.message}`, fetchErr);
                throw fetchErr; // Throw unexpected errors
            }

            // Check if user data was returned
            if (getUserData && getUserData.user) {
                userExists = true;
                logInfo(`Auth user ${user.email} (ID: ${user.id}) already exists.`);
                createdOrConfirmedAuthIds.push(user.id); // User confirmed to exist
            }
        } catch (error) {
             // Catch errors from the fetch attempt (excluding 404 handled above)
            logError(`Error checking existence for auth user ${user.email}: ${(error as Error).message}`, error);
            throw error; // Halt if critical error during check
        }
        
        // If user does not exist, proceed with creation
        if (!userExists) {
            try {
                logInfo(`Auth user ${user.email} (ID: ${user.id}) not found. Creating...`);
                const publicProfile = publicUsersToCreate.find(pu => pu.id === user.id);
                const { data: createdUserData , error: authError } = await supabaseAdmin.auth.admin.createUser({
                    user_metadata: { full_name: publicProfile?.full_name ?? 'Test Tech' },
                    email: user.email,
                    password: user.password || 'password',
                    email_confirm: true, // Auto-confirm for tests
                    app_metadata: { provider: 'email' },
                    id: user.id,
                });
                
                // Handle potential creation errors
                if (authError) { 
                     if (authError.message.includes('User already registered') || authError.message.includes('duplicate key value violates unique constraint') || (authError as any).code === 'user_already_exists') {
                         logInfo(`Auth user ${user.email} (ID: ${user.id}) was likely created between check and insert. Treating as existing.`);
                         createdOrConfirmedAuthIds.push(user.id);
                     } else {
                         logError(`Error creating auth user ${user.email}: ${authError.message}`, authError);
                         throw authError; // Throw actual creation error
                     }
                } else if (createdUserData && createdUserData.user) {
                    logInfo(`Auth user ${user.email} created successfully.`);
                    createdOrConfirmedAuthIds.push(createdUserData.user.id); // Use ID from creation response
                } else {
                     // Handle unexpected case where creation succeeded but no user data returned
                     logError(`Auth user ${user.email} creation call succeeded but returned no user data.`);
                     throw new Error(`Failed to confirm creation for user ${user.email}`);
                }
            } catch(error) {
                 logError(`Error during creation process for auth user ${user.email}: ${(error as Error).message}`, error);
                 throw error; // Halt if critical error during creation
            }
        }
    }
    logInfo(`Finished processing ${createdOrConfirmedAuthIds.length} auth users.`);
    
    // Ensure we only proceed with users confirmed/created in auth
    const finalPublicUsersInput = publicUsersToCreate.filter(pu => createdOrConfirmedAuthIds.includes(pu.id));
    const finalTechniciansInput = techniciansInputData.map((tech, index) => {
        // Use van IDs from the filtered technicianVansData
        const assignedVanId = vansToUse[index].id;
        if (assignedVanId === undefined) {
            // This check should theoretically not fail due to validation above
            throw new Error(`Logic error: Ran out of available vans to assign.`); 
        }
        // Ensure the tech input data has the correct user_id matching the auth data
        const correspondingAuthUser = authUsersToCreate[index];
        if (!correspondingAuthUser || tech.user_id !== correspondingAuthUser.id) {
            throw new Error(`Mismatch between technician data user_id (${tech.user_id}) and auth user id (${correspondingAuthUser?.id}) at index ${index}. Ensure technician-data.ts is consistent.`);
        }
        return {
            ...tech, // Includes user_id
            assigned_van_id: assignedVanId
        };
    }).filter(tech => createdOrConfirmedAuthIds.includes(tech.user_id!)); // Filter based on confirmed auth IDs

    // --- STEP 2: Insert Public Users --- 
    logInfo(`Inserting ${finalPublicUsersInput.length} technician public user profiles...`);
    const techPublicUsersResult = await insertData(supabaseAdmin, 'users', finalPublicUsersInput, 'Technician public user profiles');
    if (techPublicUsersResult.error) {
        logError('Failed to insert technician public user profiles.', techPublicUsersResult.error);
        throw techPublicUsersResult.error;
    }

    // --- STEP 3: Insert Technicians --- 
    logInfo(`Inserting ${finalTechniciansInput.length} technician profiles...`);
    const techniciansResult = await insertData(supabaseAdmin, 'technicians', finalTechniciansInput, 'Technician profiles');
    if (techniciansResult.error) {
        logError('Failed to insert technician profiles.', techniciansResult.error);
        throw techniciansResult.error;
    }
    // Capture the created technician DB IDs and associated data
    const createdTechnicianData = techniciansResult.data ?? [];
    if (createdTechnicianData.length !== finalTechniciansInput.length) {
        logError('Mismatch between expected and inserted technician profile count.');
        // Consider throwing an error here depending on desired strictness
    }

    const seededTechnicians: SeedTechnicianInfo[] = createdTechnicianData.map(createdTech => {
        // Find the original input data that corresponds to this created technician
        // using the user_id which should be unique and consistent
        const inputData = finalTechniciansInput.find(input => input.user_id === createdTech.user_id);
        if (!inputData) {
            // This should not happen if inserts worked correctly
            throw new Error(`Could not find input data corresponding to created technician with user_id ${createdTech.user_id}`);
        }
        return {
            dbId: createdTech.id,
            authId: createdTech.user_id!, // Add ! assertion
            assignedVanId: inputData.assigned_van_id // Get van ID from the input data
        };
    });
    
    // --- STEP 4: Insert Default Hours for Created Technicians ---
    logInfo(`Creating default hours (Mon-Fri 9am-6:30pm UTC) for ${seededTechnicians.length} technicians...`);
    const defaultHoursToCreate: TablesInsert<'technician_default_hours'>[] = [];
    for (const techInfo of seededTechnicians) {
        for (let day = 1; day <= 5; day++) { // Monday (1) to Friday (5)
            defaultHoursToCreate.push({
                technician_id: techInfo.dbId,
                day_of_week: day,
                start_time: '09:00:00',
                end_time: '18:30:00', // 6:30 PM UTC
                is_available: true,
            });
        }
    }

    if (defaultHoursToCreate.length > 0) {
        const defaultHoursResult = await insertData(
            supabaseAdmin,
            'technician_default_hours',
            defaultHoursToCreate,
            'Technician default hours'
        );
        if (defaultHoursResult.error) {
            logError('Failed to insert technician default hours.', defaultHoursResult.error);
            // Treat failure to insert default hours as critical, as scheduler relies on them
            throw defaultHoursResult.error; 
        }
        logInfo(`Inserted ${defaultHoursResult.data?.length ?? 0} default hours records.`);
    } else {
        logInfo('No technicians seeded, skipping default hours insertion.');
    }
    // --- End Default Hours Insertion ---

    logInfo(`Finished seeding ${seededTechnicians.length} technicians and associated data.`);

    return {
        seededTechnicians // Return the structured array
    };
}

/**
 * Fetches equipment details for a given list of van IDs.
 *
 * @param supabaseAdmin - The Supabase client.
 * @param vanIds - An array of van IDs.
 * @returns A Map where keys are van IDs and values are arrays of associated equipment records.
 */
export async function getEquipmentForVans(
    supabaseAdmin: SupabaseClient<Database>,
    vanIds: number[]
): Promise<Map<number, Tables<'equipment'>[]>> {
    if (vanIds.length === 0) {
        return new Map();
    }

    const { data, error } = await supabaseAdmin
        .from('van_equipment')
        .select(`
            van_id,
            equipment (*)
        `)
        .in('van_id', vanIds);

    if (error) {
        logError('Error fetching van equipment', error);
        throw error;
    }

    const equipmentMap = new Map<number, Tables<'equipment'>[]>();

    for (const item of data ?? []) {
        // Type guard to ensure equipment is not null and is an object (not an array)
        if (item.van_id && item.equipment && typeof item.equipment === 'object' && !Array.isArray(item.equipment)) {
            const vanId = item.van_id;
            const equipmentDetails = item.equipment as Tables<'equipment'>;
            if (!equipmentMap.has(vanId)) {
                equipmentMap.set(vanId, []);
            }
            equipmentMap.get(vanId)!.push(equipmentDetails);
        }
    }

    return equipmentMap;
} 