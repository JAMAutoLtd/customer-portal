import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase URL and Anon Key must be provided in environment variables.',
  );
}

// Create a single supabase client for interacting with your database
// Reverted: No longer forcing Authorization header, client default (apikey) is fine now with proxy
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
);
