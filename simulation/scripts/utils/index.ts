// Utility functions for simulation and E2E scripts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.test at the project root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.test') });

// Type definition for the Supabase client, useful for type hinting
export type StagingSupabaseClient = SupabaseClient;

/**
 * Creates a Supabase client configured for the Staging environment.
 * Reads connection details from .env.test.
 *
 * @param {boolean} [useServiceRole=false] - If true, uses the Service Role Key; otherwise, uses the Anon Key.
 * @returns {StagingSupabaseClient} An initialized Supabase client instance.
 * @throws {Error} If required environment variables (URL and appropriate Key) are not set.
 */
export function createStagingSupabaseClient(useServiceRole = false): StagingSupabaseClient {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = useServiceRole
        ? process.env.SUPABASE_SERVICE_ROLE_KEY
        : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
        throw new Error('Supabase URL not found in environment variables (checked NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL).');
    }

    const keyName = useServiceRole ? 'SUPABASE_SERVICE_ROLE_KEY' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
    if (!supabaseKey) {
        throw new Error(`Supabase key (${keyName}) not found in environment variables.`);
    }

    console.log(`Creating Supabase client for ${supabaseUrl} using ${useServiceRole ? 'Service Role' : 'Anon'} key.`);

    return createClient(supabaseUrl, supabaseKey);
}

// Placeholder for generated type exports (Task 2.4) - will be added later
export * from '../db/seed/staged.database.types';

// Placeholder for logging utilities (Task 2.5)
export function logInfo(message: string, ...args: any[]) {
  console.log(`[INFO] ${message}`, ...args);
}

export function logError(message: string, error?: any, ...args: any[]) {
  console.error(`[ERROR] ${message}`, ...args);
  if (error) {
    console.error(error);
  }
}

console.log('Utilities index file loaded'); 