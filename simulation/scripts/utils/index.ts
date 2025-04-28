import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
// import dotenv from 'dotenv'; // No longer needed here
import path from 'path';
// Explicitly import the types needed within this module
import { Database, Tables, TablesInsert } from '../db/seed/staged.database.types';
// Corrected import path for baseline data
import { authUsersData, publicUsersData, techniciansData } from '../db/seed/baseline-data';
// Remove incorrect import of types.ts
// import type { UserInsert, TechnicianInsert } from './db/seed/types';

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

interface SeedTechniciansResult {
    createdTechnicianAuthIds: string[];
    assignedVanIds: number[];
    createdTechnicianDbIds: number[];
}

/**
 * Creates/verifies auth users, public users, and technician profiles for a scenario.
 * Assigns available vans from the baseline pool.
 * 
 * @param supabaseAdmin Supabase client
 * @param technicianCount Number of technicians to seed (1-4)
 * @param availableVanIds Array of baseline van IDs available for assignment
 * @returns Object containing the created technician auth IDs, assigned van IDs, and created technician DB IDs.
 */
export async function seedScenarioTechnicians(
    supabaseAdmin: SupabaseClient<Database>,
    technicianCount: number,
    availableVanIds: number[]
): Promise<SeedTechniciansResult> {
    logInfo(`Seeding ${technicianCount} technicians for scenario...`);

    if (![1, 2, 3, 4].includes(technicianCount)) {
        throw new Error(`Invalid technicianCount (${technicianCount}). Must be 1, 2, 3, or 4.`);
    }
    if (availableVanIds.length < technicianCount) {
        throw new Error(`Not enough baseline vans (${availableVanIds.length}) available for ${technicianCount} technicians.`);
    }

    // Define types locally for clarity within the function scope
    type AuthUser = typeof authUsersData[number];
    type PublicUserSeed = TablesInsert<'users'>;
    type TechnicianSeed = TablesInsert<'technicians'>;

    // Filter necessary data based on technicianCount
    const techUserSeedData = authUsersData
        .filter((u: AuthUser) => u.email.startsWith('tech'))
        .slice(0, technicianCount);
    const techPublicUsersInput: PublicUserSeed[] = publicUsersData
        .filter(u => techUserSeedData.some((t: AuthUser) => t.id === u.id)); 
    const techTechniciansInputInitial: TechnicianSeed[] = techniciansData
        .filter(t => techUserSeedData.some((techUser: AuthUser) => techUser.id === t.user_id))
        .slice(0, technicianCount);

    // --- STEP 1: Ensure all Auth users exist ---    
    logInfo(`Ensuring ${techUserSeedData.length} auth users exist...`);
    const createdOrConfirmedAuthIds: string[] = [];
    for (const user of techUserSeedData) {
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
                const publicProfile = techPublicUsersInput.find(pu => pu.id === user.id);
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
    const finalPublicUsersInput = techPublicUsersInput.filter(pu => createdOrConfirmedAuthIds.includes(pu.id));
    const finalTechniciansInput = techTechniciansInputInitial.filter(t => createdOrConfirmedAuthIds.includes(t.user_id!));

    // --- STEP 2: Assign Vans --- 
    const assignedVanIds: number[] = [];
    if (availableVanIds.length < finalTechniciansInput.length) {
        throw new Error(`Not enough baseline vans (${availableVanIds.length}) available for ${finalTechniciansInput.length} technicians.`);
    }
    for (let i = 0; i < finalTechniciansInput.length; i++) {
        const vanId = availableVanIds[i];
        finalTechniciansInput[i].assigned_van_id = vanId;
        assignedVanIds.push(vanId);
    }
    
    // --- STEP 3: Insert Public Users --- 
    logInfo(`Inserting ${finalPublicUsersInput.length} technician public user profiles...`);
    const techPublicUsersResult = await insertData(supabaseAdmin, 'users', finalPublicUsersInput, 'Technician public user profiles');
    if (techPublicUsersResult.error) {
        logError('Failed to insert technician public user profiles.', techPublicUsersResult.error);
        throw techPublicUsersResult.error;
    }

    // --- STEP 4: Insert Technicians --- 
    logInfo(`Inserting ${finalTechniciansInput.length} technician profiles...`);
    const techniciansResult = await insertData(supabaseAdmin, 'technicians', finalTechniciansInput, 'Technician profiles');
    if (techniciansResult.error) {
        logError('Failed to insert technician profiles.', techniciansResult.error);
        throw techniciansResult.error;
    }
    // Capture the created technician DB IDs
    const createdTechnicianDbIds = techniciansResult.data?.map(t => t.id) ?? [];
    if (createdTechnicianDbIds.length !== finalTechniciansInput.length) {
        logError('Mismatch between expected and inserted technician profile count.');
        // Consider throwing an error here depending on desired strictness
    }
    
    logInfo(`Finished seeding ${createdOrConfirmedAuthIds.length} technicians and associated data.`);

    // <<< Add Debug Logging Here >>>
    console.log('[DEBUG] techniciansResult.data:', techniciansResult.data);
    console.log('[DEBUG] createdTechnicianDbIds:', createdTechnicianDbIds);
    // <<< End Debug Logging >>>

    return {
        createdTechnicianAuthIds: createdOrConfirmedAuthIds,
        assignedVanIds,
        createdTechnicianDbIds
    };
} 