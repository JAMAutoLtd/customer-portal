import { createClient, SupabaseClient, PostgrestError } from '@supabase/supabase-js';
// import dotenv from 'dotenv'; // No longer needed here
import path from 'path';
// Explicitly import the types needed within this module
import { Database, Tables, TablesInsert } from '../db/seed/staged.database.types';

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