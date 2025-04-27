// Staging Database Cleanup Script
import { SupabaseClient } from '@supabase/supabase-js';
import inquirer from 'inquirer';

// Placeholder imports
// import { Database } from './seed/staged.database.types';
// import { createStagingSupabaseClient, logInfo, logError } from '../utils';

type Database = any; // Placeholder

// --- Configuration: Define Test Data Identifier Pattern ---
const TEST_USER_EMAIL_DOMAIN = '@e2etest.jam-auto.com';
const TEST_DATA_PREFIX = '[E2E_TEST]';
// Add other patterns if needed (e.g., specific phone number format)
// ---------------------------------------------------------

/**
 * Removes all test data (users, orders, jobs, etc.) from the Staging database.
 * Requires admin privileges.
 * @param supabaseAdmin - Supabase client instance with admin rights.
 * @param skipConfirmation - If true, bypasses the confirmation prompts.
 */
export async function cleanupAllTestData(
    supabaseAdmin: SupabaseClient<Database>,
    skipConfirmation = false
): Promise<void> {
    console.log('[CLEANUP] Starting Staging DB test data cleanup...');

    if (!skipConfirmation) {
        const { confirm1 } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm1',
                message: 'DANGER: This will DELETE all test data (users, orders, jobs etc. identified by pattern) from the STAGING database. Are you sure?',
                default: false,
            },
        ]);
        if (!confirm1) {
            console.log('[CLEANUP] Aborted by user.');
            return;
        }
        const { confirm2 } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm2',
                message: 'SECOND CONFIRMATION: Really delete all test data from STAGING?',
                default: false,
            },
        ]);
        if (!confirm2) {
            console.log('[CLEANUP] Aborted by user.');
            return;
        }
    }

    try {
        console.log(`[CLEANUP] Identifying test users with email domain: ${TEST_USER_EMAIL_DOMAIN}...`);

        // 1. Fetch Test User IDs (Placeholder - Requires Admin API access)
        // const testAuthUsers = await supabaseAdmin.auth.admin.listUsers(...);
        // const testAuthUserIds = testAuthUsers.data?.users.filter(u => u.email?.endsWith(TEST_USER_EMAIL_DOMAIN)).map(u => u.id) ?? [];
        const testAuthUserIds: string[] = []; // Placeholder
        console.log(`[CLEANUP] Found ${testAuthUserIds.length} test auth user IDs (placeholder).`);

        if (testAuthUserIds.length === 0) {
            console.log('[CLEANUP] No test users found based on pattern. Skipping deletions.');
            // Potentially still clean other data identifiable by prefix?
            return;
        }

        // Fetch corresponding public.users and technicians (if needed)
        const { data: testPublicUsers, error: publicUserError } = await supabaseAdmin
            .from('users')
            .select('id, technician_id')
            .in('id', testAuthUserIds);

        if (publicUserError) throw new Error(`Failed to fetch public users: ${publicUserError.message}`);
        const testPublicUserIds = testPublicUsers?.map(u => u.id) ?? [];
        const testTechnicianIds = testPublicUsers?.map(u => u.technician_id).filter(id => !!id) ?? [];

        console.log(`[CLEANUP] Found ${testPublicUserIds.length} corresponding public users.`);
        console.log(`[CLEANUP] Found ${testTechnicianIds.length} corresponding technicians.`);


        // 2. Delete Dependent Public Data (Order Matters!)
        console.log('[CLEANUP] Deleting dependent public data...');
        // Example: Delete technician_availability_exceptions for test technicians
        // const { error: delExcpError } = await supabaseAdmin.from('technician_availability_exceptions').delete().in('technician_id', testTechnicianIds);
        // if (delExcpError) console.error('[CLEANUP] Error deleting exceptions:', delExcpError.message);
        // ... Add deletions for all dependent tables in correct order based on FKs, using test IDs ...

        // 3. Delete Core Public Data
        console.log('[CLEANUP] Deleting core public data...');
        // Example: Delete public.users
        // const { error: delPubUsrError } = await supabaseAdmin.from('users').delete().in('id', testPublicUserIds);
        // if (delPubUsrError) console.error('[CLEANUP] Error deleting public users:', delPubUsrError.message);
        // ... Delete vans, vehicles, addresses linked to test users ...

        // 4. Delete Auth Users
        console.log('[CLEANUP] Deleting auth users...');
        // for (const userId of testAuthUserIds) {
        //     try {
        //         const { error: delAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        //         if (delAuthError) console.error(`[CLEANUP] Error deleting auth user ${userId}:`, delAuthError.message);
        //     } catch (err) {
        //         console.error(`[CLEANUP] Exception deleting auth user ${userId}:`, err);
        //     }
        // }

        console.log('[CLEANUP] Test data cleanup process completed.');

    } catch (error) {
        console.error('[CLEANUP] Error during cleanup:', error);
        throw error; // Re-throw
    }
}

// Allow running the script directly
if (require.main === module) {
    (async () => {
        console.log('Running cleanup script directly...');
        try {
            // Need to import utils here for direct execution context
            const { createStagingSupabaseClient } = await import('../utils');
            const supabaseAdmin = createStagingSupabaseClient(true);
            await cleanupAllTestData(supabaseAdmin);
            process.exit(0);
        } catch (error) {
            console.error('Failed to run cleanup script:', error);
            process.exit(1);
        }
    })();
} 