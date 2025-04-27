import { SupabaseClient } from '@supabase/supabase-js';
import inquirer from 'inquirer';
// Import types and utils from the central utils file
import { Database, createStagingSupabaseClient, logInfo, logError } from '../utils';
// Import the baseline user definitions from the correct file
import { authUsersData } from './seed/baseline-data';

// --- Configuration: Define patterns to identify test data ---
// Keep pattern for notes, but user identification will primarily use IDs from baseline data
const TEST_DATA_NOTE_PREFIX = '[E2E_TEST]';

/**
 * Cleans up ALL test data created by baseline seeding process from the staging database.
 * WARNING: This is destructive and irreversible.
 *
 * @param supabaseAdmin - A Supabase client initialized with SERVICE_ROLE_KEY.
 * @param skipConfirmation - If true, bypasses the confirmation prompts.
 */
export async function cleanupAllTestData(
  supabaseAdmin: SupabaseClient<Database>,
  skipConfirmation = false
): Promise<void> {
  logInfo('Starting test data cleanup...');

  // Use environment variable for confirmation message URL
  const supabaseUrlForConfirm = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'Unknown';

  if (!skipConfirmation) {
    const { confirm1 } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm1',
        message: 'EXTREME WARNING: This will delete ALL test data (users, orders, jobs, etc. matching patterns) from the STAGING database. Are you absolutely sure?',
        default: false,
      },
    ]);

    if (!confirm1) {
      logInfo('Cleanup cancelled by user.');
      return;
    }

    const { confirm2 } = await inquirer.prompt([
      {
        type: 'input',
        name: 'confirm2',
        message: `Type 'DELETE TEST DATA' to confirm deletion from the STAGING database URL: ${supabaseUrlForConfirm}`,
      },
    ]);

    if (confirm2 !== 'DELETE TEST DATA') {
      logInfo('Confirmation text did not match. Cleanup cancelled.');
      return;
    }
    logInfo('Confirmation received. Proceeding with deletion...');
  }

  try {
    // Get ALL user IDs defined in the baseline seed data
    const testUserIds = authUsersData.map(u => u.id);

    if (!testUserIds || testUserIds.length === 0) {
      logInfo('No user IDs found in baseline seed data. Skipping deletions.');
      return;
    }
    logInfo(`Targeting ${testUserIds.length} user IDs defined in baseline seed data for deletion.`);

    // Fetch corresponding numeric Technician IDs (using the baseline user IDs)
    logInfo('Fetching corresponding technician IDs...');
    const { data: testTechnicians, error: techFetchError } = await supabaseAdmin
      .from('technicians')
      .select('id')
      .in('user_id', testUserIds);
    if (techFetchError) throw techFetchError;
    const testTechnicianIds = testTechnicians?.map(t => t.id) || [];
    logInfo(`Found ${testTechnicianIds.length} corresponding technician IDs.`);

    // --- Deletion Steps (Order is CRUCIAL) ---

    // 1. Delete Dependent Public Data
    logInfo('Deleting dependent public data...');

    // Remove deletion for non-existent 'job_equipment'
    // logInfo('Skipping deletion for non-existent job_equipment table.');

    // Fetch order IDs linked to test users
    const { data: testOrders, error: orderFetchError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .in('user_id', testUserIds);
    if (orderFetchError) throw orderFetchError;
    const testOrderIds = testOrders?.map(o => o.id) || [];
    logInfo(`Found ${testOrderIds.length} orders linked to test users.`);

    if (testOrderIds.length > 0) {
      logInfo('Deleting data linked to test orders...');
      // Delete order_services
      const { error: osError } = await supabaseAdmin.from('order_services').delete().in('order_id', testOrderIds);
      if (osError) logError('Error deleting order_services:', osError); else logInfo('Deleted test order_services.');

      // Delete jobs
      const { error: jobError } = await supabaseAdmin.from('jobs').delete().in('order_id', testOrderIds);
      if (jobError) logError('Error deleting jobs:', jobError); else logInfo('Deleted test jobs.');

      // Delete order_uploads
      const { error: uploadError } = await supabaseAdmin.from('order_uploads').delete().in('order_id', testOrderIds);
      if (uploadError) logError('Error deleting order_uploads:', uploadError); else logInfo('Deleted test order_uploads.');

      // Delete orders
      const { error: orderDelError } = await supabaseAdmin.from('orders').delete().in('id', testOrderIds);
      if (orderDelError) logError('Error deleting orders:', orderDelError); else logInfo('Deleted test orders.');
    }

    if (testTechnicianIds.length > 0) {
        logInfo('Deleting data linked to test technicians...');
        // Delete technician_availability_exceptions (use numeric technician IDs)
        const { error: availError } = await supabaseAdmin.from('technician_availability_exceptions').delete().in('technician_id', testTechnicianIds);
        if (availError) logError('Error deleting technician_availability_exceptions:', availError); else logInfo('Deleted test technician_availability_exceptions.');

        // Delete technician_default_hours (use numeric technician IDs)
        const { error: defaultHoursError } = await supabaseAdmin.from('technician_default_hours').delete().in('technician_id', testTechnicianIds);
        if (defaultHoursError) logError('Error deleting technician_default_hours:', defaultHoursError); else logInfo('Deleted test technician_default_hours.');
    }

    // Delete technicians (references users, use user IDs)
    if (testUserIds.length > 0) {
        const { error: techDelError } = await supabaseAdmin.from('technicians').delete().in('user_id', testUserIds);
        if (techDelError) logError('Error deleting technicians:', techDelError); else logInfo('Deleted test technicians.');
    }

    // Skipping van_equipment as before
    logInfo('Skipping van_equipment deletion (requires clearer test van identification).');

    // Delete user_addresses (junction table, use user IDs)
    if (testUserIds.length > 0) {
        const { error: uaError } = await supabaseAdmin.from('user_addresses').delete().in('user_id', testUserIds);
        if (uaError) logError('Error deleting user_addresses:', uaError); else logInfo('Deleted test user_addresses.');
    }

    // 2. Delete Core Public Data
    logInfo('Deleting core public data...');

    // Delete technicians (references users, use user IDs)
    if (testUserIds.length > 0) {
        const { error: techDelError } = await supabaseAdmin.from('technicians').delete().in('user_id', testUserIds);
        if (techDelError) logError('Error deleting technicians:', techDelError); else logInfo('Deleted test technicians.');
    }

    // Delete public users (use user IDs)
    if (testUserIds.length > 0) {
        const { error: publicUserError } = await supabaseAdmin.from('users').delete().in('id', testUserIds);
        if (publicUserError) logError('Error deleting public users:', publicUserError); else logInfo('Deleted test public users.');
    }
    
    // Now delete the static baseline data - assumes these tables ONLY contain baseline/test data
    logInfo('Deleting static baseline table data...');
    // Order MATTERS: Delete tables referencing others first.
    const staticTables: (keyof Database["public"]["Tables"])[] = [
        // 1. Requirement tables (reference services, ymm_ref, equipment)
        'diag_equipment_requirements',
        'immo_equipment_requirements',
        'prog_equipment_requirements',
        'airbag_equipment_requirements',
        'adas_equipment_requirements',
        // 2. Vans (references customer_vehicles via VIN)
        'vans',
        // 3. Now safe to delete tables referenced above
        'customer_vehicles',
        'services',
        'ymm_ref',
        'equipment', // Referenced by van_equipment (skipped), but safe now
        'addresses' // Referenced by users, orders - should be safe now
    ];
    
    for (const table of staticTables) {
        let deleteError: any = null;
        if (table === 'ymm_ref') {
            // ymm_ref uses ymm_id as primary key
            const { error } = await supabaseAdmin.from(table).delete().gte('ymm_id', 0);
            deleteError = error;
        } else {
            // Assume other tables use 'id' as primary key (or a numeric PK >= 0)
            const { error } = await supabaseAdmin.from(table).delete().gte('id', 0);
            deleteError = error;
        }
        
        if (deleteError) {
            logError(`Error deleting data from ${table}:`, deleteError);
            // Log and continue
        } else {
            logInfo(`Deleted all data from ${table}.`);
        }
    }

    // 3. Delete Auth Users
    if (testUserIds.length > 0) {
        logInfo(`Deleting ${testUserIds.length} auth users...`);
        let authDeletionCount = 0;
        for (const userId of testUserIds) {
          try {
            const { data, error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
            if (authError) {
              // Log specific error but continue
              logError(`Error deleting auth user ${userId}: ${authError.message}`, authError);
            } else {
              authDeletionCount++;
              // logInfo(`Deleted auth user ${userId}`); // Potentially too verbose
            }
          } catch (indivError) {
            logError(`Caught exception deleting auth user ${userId}:`, indivError);
          }
        }
        logInfo(`Attempted deletion of ${testUserIds.length} auth users. Success count: ${authDeletionCount}.`);
    } else {
      logInfo('Skipping auth user deletion as no test user IDs were found.');
    }

    logInfo('Test data cleanup process finished.');

  } catch (error) {
    logError('Error during test data cleanup execution:', error);
    throw error; // Re-throw the error to indicate failure
  }
}

// --- Script Entry Point ---
// Allows running the script directly using `ts-node`
async function runCleanup() {
  try {
    const supabaseAdmin = createStagingSupabaseClient(true); // Use service role
    await cleanupAllTestData(supabaseAdmin);
  } catch (error) {
    logError('Cleanup script failed:', error);
    process.exit(1);
  }
}

// Execute runCleanup only if the script is run directly
if (require.main === module) {
  runCleanup();
} 