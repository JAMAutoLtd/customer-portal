import { SupabaseClient, AuthApiError } from '@supabase/supabase-js';
import inquirer from 'inquirer';
// Import types and utils from the central utils file
import { Database, createStagingSupabaseClient, logInfo, logError } from '../utils';
// Import the baseline user definitions from the correct file
import { authUsersData } from './seed/baseline-data';

// --- Configuration: Define patterns to identify test data ---
// Keep pattern for notes, but user identification will primarily use IDs from baseline data
const TEST_DATA_NOTE_PREFIX = '[E2E_TEST]';

/**
 * Parses command line arguments for the cleanup script.
 */
function getCleanupArgs() {
    const args = process.argv.slice(2);
    const skipConfirmation = args.includes('--skip-confirm');
    return { skipConfirmation };
}

/**
 * Purges ALL user-related and test-related data from the staging database using TRUNCATE.
 * WARNING: This is highly destructive and irreversible. It will empty specified tables entirely.
 *
 * @param supabaseAdmin - A Supabase client initialized with SERVICE_ROLE_KEY.
 * @param internalSkipConfirmation - If true, bypasses the confirmation prompts.
 */
export async function cleanupAllTestData(
  supabaseAdmin: SupabaseClient<Database>,
  internalSkipConfirmation = false
): Promise<void> {
  logInfo('Starting STAGING DATABASE PURGE using TRUNCATE...');

  const supabaseUrlForConfirm = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'Unknown';

  if (!internalSkipConfirmation) {
    // Keep confirmation prompts, adjusted message for TRUNCATE
    const { confirm1 } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm1',
        message: 'EXTREME WARNING: This will TRUNCATE (empty) core tables (users, technicians, orders, jobs, etc.) in the STAGING database. This is a destructive purge. Are you absolutely sure?',
        default: false,
      },
    ]);
    if (!confirm1) { logInfo('Purge cancelled by user.'); return; }

    const { confirm2 } = await inquirer.prompt([
      {
        type: 'input',
        name: 'confirm2',
        message: `Type 'PURGE STAGING DATA' to confirm TRUNCATE operation on the STAGING database URL: ${supabaseUrlForConfirm}`,
      },
    ]);
    if (confirm2 !== 'PURGE STAGING DATA') { logInfo('Confirmation text did not match. Purge cancelled.'); return; }
    logInfo('Confirmation received. Proceeding with staging database purge...');
  } else {
    logInfo('Confirmation skipped via flag/parameter.');
  }

  try {
    // 1. TRUNCATE Public Tables FIRST (to remove foreign key constraints)
    logInfo('Truncating public schema tables using CASCADE...');

    // List all tables known to be populated by tests/baseline data.
    // Order matters less with CASCADE, but good to list primary ones.
    // Add any other tables that need clearing.
    const tablesToTruncate: string[] = [
        // Core data tables
        'jobs',
        'orders',
        'technicians',
        'users', // Public users table
        'vans',
        'customer_vehicles',
        'addresses',
        'equipment',
        'services',
        'keys',
        'ymm_ref',
        // Junction / Dependent tables (CASCADE should handle, but explicit is okay)
        'order_services',
        'order_uploads',
        'technician_availability_exceptions',
        'technician_default_hours',
        'user_addresses',
        'van_equipment',
        // Requirement table (unified)
        'equipment_requirements',
    ];

    // Construct the TRUNCATE command
    // Important: Ensure the service role used by supabaseAdmin has TRUNCATE privileges.
    const truncateCommand = `TRUNCATE TABLE ${tablesToTruncate.map(t => `public.${t}`).join(', ')} RESTART IDENTITY CASCADE;`;

    logInfo(`Executing: ${truncateCommand}`);
    const { error: truncateError } = await supabaseAdmin.rpc('execute_sql', { sql: truncateCommand });

    if (truncateError) {
      logError('Error executing TRUNCATE command:', truncateError);
      throw truncateError;
    } else {
      logInfo('Successfully truncated public tables.');
    }

    // 2. Delete ALL Auth Users (after public tables are truncated)
    logInfo('Attempting to delete ALL auth users from staging...');
    
    // Helper function to delete auth users with retry logic
    async function deleteAuthUsersWithRetry(maxAttempts: number = 2): Promise<void> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (attempt > 1) {
          logInfo(`Retrying auth user deletion (attempt ${attempt}/${maxAttempts})...`);
        }
        
        // Fetch all auth users
        let allAuthUsers: any[] = [];
        let page = 0;
        const pageSize = 100;
        
        while (true) {
          const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page: page + 1, // API is 1-based
            perPage: pageSize,
          });
          if (listError) {
            logError('Error listing auth users:', listError);
            throw listError;
          }
          if (usersPage && usersPage.users.length > 0) {
            allAuthUsers = allAuthUsers.concat(usersPage.users);
            page++;
          } else {
            break;
          }
        }
        
        const allAuthUserIds = allAuthUsers.map(u => u.id);
        
        if (allAuthUserIds.length === 0) {
          logInfo('No auth users found in staging to delete.');
          return; // Success - no users left
        }
        
        logInfo(`Found ${allAuthUserIds.length} auth users to delete...`);
        let authDeletionCount = 0;
        let failedDeletions: { userId: string; error: any }[] = [];
        
        for (const userId of allAuthUserIds) {
          try {
            const { data, error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
            if (authError) {
              if (!(authError instanceof AuthApiError && authError.status === 404)) {
                failedDeletions.push({ userId, error: authError });
                // Continue trying other users
              }
            } else {
              authDeletionCount++;
            }
          } catch (indivError) {
            failedDeletions.push({ userId, error: indivError });
          }
        }
        
        logInfo(`Attempt ${attempt}: Deleted ${authDeletionCount}/${allAuthUserIds.length} auth users.`);
        
        if (failedDeletions.length > 0) {
          logInfo(`${failedDeletions.length} auth user(s) failed to delete.`);
          // Log details only on the last attempt
          if (attempt === maxAttempts) {
            failedDeletions.forEach(({ userId, error }) => {
              logError(`Failed to delete auth user ${userId}: ${error.message}`, error);
            });
          }
          
          // If this wasn't the last attempt and we had failures, continue to retry
          if (attempt < maxAttempts) {
            // Small delay before retry to allow any async operations to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        } else {
          // All users deleted successfully
          logInfo('All auth users deleted successfully.');
          return;
        }
      }
      
      // If we get here, we've exhausted all attempts
      logInfo('Some auth users could not be deleted after all attempts. This may be due to database constraints that will be resolved on the next run.');
    }
    
    // Execute the auth user deletion with retry logic
    await deleteAuthUsersWithRetry();
    
    logInfo('STAGING DATABASE PURGE finished.');

  } catch (error) {
    logError('Error during staging database purge execution:', error);
    throw error; // Re-throw the error to indicate failure
  }
}

/**
 * Cleans up data potentially left over from previous scenario runs,
 * preserving only the baseline data defined in baseline-data.ts.
 * This is intended to run *after* baseline seeding and *before* scenario seeding.
 * It does NOT require user confirmation.
 *
 * @param supabaseAdmin - A Supabase client initialized with SERVICE_ROLE_KEY.
 */
export async function cleanupScenarioLeftovers(
  supabaseAdmin: SupabaseClient<Database>
): Promise<void> {
  logInfo('Starting scenario leftover data cleanup...');

  try {
    // --- Clean up Scenario-Specific Users/Technicians (Fetch IDs first) ---
    logInfo('Identifying ALL technicians to remove...');

    // Get ALL existing technicians and their user_ids
    const { data: existingTechnicians, error: techFetchError } = await supabaseAdmin
      .from('technicians')
      .select('id, user_id');

    if (techFetchError) {
      logError('Error fetching existing technicians:', techFetchError);
      throw techFetchError;
    }

    const technicianDbIdsToDelete = existingTechnicians?.map((t) => t.id) ?? [];
    const technicianAuthIdsToDelete = existingTechnicians?.map((t) => t.user_id).filter((id): id is string => id !== null) ?? [];

    if (technicianDbIdsToDelete.length > 0) {
      logInfo(`Found ${technicianDbIdsToDelete.length} technicians (DB IDs: ${technicianDbIdsToDelete.join(', ')}) and associated users (Auth IDs: ${technicianAuthIdsToDelete.join(', ')}) to remove.`);

      // --- STEP 1: Delete Dependent Records FIRST ---
      logInfo('Deleting dependent records (jobs, availability, default hours) for identified technicians...');

      // Delete jobs assigned to these technicians
      const { error: jobDeleteError } = await supabaseAdmin
        .from('jobs')
        .delete()
        .in('assigned_technician', technicianDbIdsToDelete);
      if (jobDeleteError) logError('Error deleting dependent jobs:', jobDeleteError);
      else logInfo('Deleted dependent jobs.');

      // Delete availability exceptions for these technicians
      const { error: availDeleteError } = await supabaseAdmin
        .from('technician_availability_exceptions')
        .delete()
        .in('technician_id', technicianDbIdsToDelete);
      if (availDeleteError) logError('Error deleting dependent availability exceptions:', availDeleteError);
      else logInfo('Deleted dependent availability exceptions.');

      // Delete default hours for these technicians
      const { error: hoursDeleteError } = await supabaseAdmin
        .from('technician_default_hours')
        .delete()
        .in('technician_id', technicianDbIdsToDelete);
      if (hoursDeleteError) logError('Error deleting dependent default hours:', hoursDeleteError);
      else logInfo('Deleted dependent default hours.');

      // --- STEP 2: Delete Technicians, then Public Users, then Auth Users ---

      // Delete from technicians table (should succeed now)
      logInfo('Deleting technicians records...');
      const { error: techDeleteError } = await supabaseAdmin
        .from('technicians')
        .delete()
        .in('id', technicianDbIdsToDelete);
      if (techDeleteError) logError('Error deleting technicians:', techDeleteError); // Still log, but might indicate other issues
      else logInfo(`Deleted technicians with DB IDs: ${technicianDbIdsToDelete.join(', ')}`);

      // Delete corresponding public users (should succeed now)
      if (technicianAuthIdsToDelete.length > 0) { // Check if there are any UUIDs to delete
          logInfo('Deleting public user profiles for technicians...');
          const { error: publicUserDeleteError } = await supabaseAdmin
            .from('users')
            .delete()
            .in('id', technicianAuthIdsToDelete);
          if (publicUserDeleteError) logError('Error deleting public users:', publicUserDeleteError);
          else logInfo(`Deleted public users with Auth IDs: ${technicianAuthIdsToDelete.join(', ')}`);

          // Delete corresponding auth users (should succeed now)
          logInfo('Deleting auth users for technicians...');
          let deletedAuthCount = 0;
          for (const userId of technicianAuthIdsToDelete) {
            try {
              const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
              if (authDeleteError && authDeleteError.message !== 'User not found') {
                logError(`Error deleting auth user ${userId}:`, authDeleteError);
              } else if (!authDeleteError) {
                deletedAuthCount++;
              }
            } catch (err) {
              logError(`Exception deleting auth user ${userId}:`, err);
            }
          }
          logInfo(`Attempted deletion for ${technicianAuthIdsToDelete.length} auth users, successfully deleted: ${deletedAuthCount}`);
      } else {
          logInfo('No associated public/auth users to delete for the found technicians (this might indicate inconsistent data).');
      }

    } else {
      logInfo('No existing technicians found to remove.');
    }

    // --- Also Clean Up Orders and Jobs (Not directly linked to technicians, but scenario-specific) ---
    // Keep this part to ensure orders/jobs from previous runs are gone
    logInfo('Deleting ALL remaining job and order related data (scenario leftovers)...');
    // Order matters: delete dependent tables first

    // Delete Jobs first (depends on Orders)
    const { error: jobDelError } = await supabaseAdmin.from('jobs').delete().gte('id', 0); // Delete all jobs
    if (jobDelError) {
      logError('Error deleting leftover jobs:', jobDelError);
      // If jobs fail to delete, we cannot safely delete orders. Consider stopping.
      throw new Error('Failed to delete leftover jobs, cannot proceed with order cleanup.');
    } else {
      logInfo('Deleted all leftover jobs.');
    }

    // Delete Order Services (depends on Orders)
    const { error: osError } = await supabaseAdmin.from('order_services').delete().gte('order_id', 0); // Delete all
    if (osError) logError('Error deleting leftover order_services:', osError);
    else logInfo('Deleted leftover order_services.');

    // Delete Order Uploads (depends on Orders)
    const { error: uploadError } = await supabaseAdmin.from('order_uploads').delete().gte('order_id', 0); // Delete all
    if (uploadError) logError('Error deleting leftover order_uploads:', uploadError);
    else logInfo('Deleted leftover order_uploads.');

    // Now delete Orders (should succeed as jobs are gone)
    const { error: orderDelError } = await supabaseAdmin.from('orders').delete().gte('id', 0); // Delete all orders
    if (orderDelError) logError('Error deleting leftover orders:', orderDelError);
    else logInfo('Deleted all leftover orders.');

    // IMPORTANT: Do NOT delete static tables (services, equipment, addresses, etc.)
    logInfo('Skipping deletion of static baseline table data.');

    logInfo('Scenario leftover data cleanup process finished.');

  } catch (error) {
    logError('Error during scenario leftover data cleanup execution:', error);
    // We might not want to hard fail the whole seeding process if cleanup fails,
    // depending on desired behavior. For now, re-throw.
    throw error;
  }
}

// --- Script Entry Point ---
// Allows running the script directly using `ts-node`
async function runCleanup() {
  try {
    const { skipConfirmation } = getCleanupArgs(); // Parse CLI args
    const supabaseAdmin = createStagingSupabaseClient(true); // Use service role
    // Pass the parsed CLI flag to the main function
    await cleanupAllTestData(supabaseAdmin, skipConfirmation);
  } catch (error) {
    logError('Cleanup script failed:', error);
    process.exit(1);
  }
}

// Execute runCleanup only if the script is run directly
if (require.main === module) {
  runCleanup();
} 