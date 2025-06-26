import { runFullReplan } from './scheduler/orchestrator'
import { supabase } from './supabase/client'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

/**
 * Main entry point for the scheduler application.
 *
 * This function initializes the scheduler process by calling the `runFullReplan`
 * function and handles the final exit status.
 */
async function main() {
<<<<<<< feat/human-dashboard
  console.log('Starting scheduler process...') // Trigger build v2
=======
  console.log('Starting scheduler process...') // Trigger CI/CD v2
>>>>>>> main
  try {
    // Pass the Supabase client instance to the replan function
    await runFullReplan(supabase)
    console.log('Scheduler process finished successfully.')
    process.exit(0) // Exit cleanly
  } catch (error) {
    console.error('Scheduler process failed:', error)
    process.exit(1) // Exit with error code
  }
}

// Execute the main function
main()
