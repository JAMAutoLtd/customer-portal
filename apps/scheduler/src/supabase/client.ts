import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// Use the Service Role Key for backend operations
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Supabase URL and Service Role Key must be provided in environment variables for the scheduler.',
  );
}

// Create a single supabase client for interacting with your database
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceRoleKey, // Use Service Role Key here
  {
    auth: {
       // Recommended explicit settings for service role key usage
       autoRefreshToken: false,
       persistSession: false,
       detectSessionInUrl: false
     }
  }
);
