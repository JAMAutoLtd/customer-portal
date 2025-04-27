import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { Database } from '../db/seed/staged.database.types';

// Ensure environment variables are loaded from .env.test
// Note: This assumes dotenv.config() is called early enough by the invoking script or test runner setup.
// If running scripts directly, ensure dotenv is configured beforehand.
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

/**
 * Creates a Supabase client instance configured for the Staging environment.
 *
 * Reads connection details from environment variables defined in `.env.test`:
 * - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL` as fallback)
 * - `SUPABASE_SERVICE_ROLE_KEY` (if `useServiceRole` is true)
 * - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (if `useServiceRole` is false)
 *
 * @param useServiceRole - If true, uses the service role key; otherwise, uses the anonymous key.
 * @returns A configured Supabase client instance.
 * @throws Error if the required URL or key environment variables are missing.
 */
export function createStagingSupabaseClient(useServiceRole = false): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Supabase URL is not defined. Ensure NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is set in .env.test');
  }

  if (!supabaseKey) {
    const keyName = useServiceRole ? 'SUPABASE_SERVICE_ROLE_KEY' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
    throw new Error(`Supabase key (${keyName}) is not defined. Ensure it is set in .env.test`);
  }

  return createClient(supabaseUrl, supabaseKey);
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
 */
export async function insertData<T extends Record<string, any>>(
  supabaseAdmin: SupabaseClient<Database>,
  tableName: keyof Database['public']['Tables'],
  data: T[],
  description: string
): Promise<void> {
  if (data.length === 0) {
    logInfo(`Skipping insertion into ${String(tableName)} - No data provided.`);
    return;
  }

  logInfo(`Inserting ${data.length} records into ${String(tableName)} (${description})...`);
  // The type of tableName is already constrained to the correct keys, no need to cast to string
  const table = supabaseAdmin.from(tableName);
  const { error } = await table.insert(data as any); // Cast data as any, assuming caller ensures compatibility

  if (error) {
    logError(`Error inserting data into ${String(tableName)}: ${error.message}`, error);
    throw error; // Re-throw to halt the seeding process if critical
  }
} 