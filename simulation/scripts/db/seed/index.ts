import { seedBaseline } from './baseline';
import { createStagingSupabaseClient, logInfo, logError } from '../../utils';
import { seedScenario } from './scenarios'; // Assuming this structure for scenarios

async function main() {
  logInfo('Starting seeding script...');

  // Basic argument parsing
  const args = process.argv.slice(2);
  const action = args[0]; // e.g., 'baseline' or 'scenario'
  const techCountArg = args.find(arg => arg.startsWith('--techs='));
  const scenarioNameArg = args.find(arg => arg.startsWith('--name='));

  const technicianCount = techCountArg ? parseInt(techCountArg.split('=')[1], 10) : 4; // Default to 4 techs
  const scenarioName = scenarioNameArg ? scenarioNameArg.split('=')[1] : undefined;

  if (technicianCount !== 1 && technicianCount !== 2 && technicianCount !== 3 && technicianCount !== 4) {
    logError('Invalid technician count specified with --techs. Must be 1, 2, 3, or 4.');
    process.exit(1);
  }

  let supabaseAdmin;
  try {
    logInfo('Creating Supabase admin client...');
    supabaseAdmin = createStagingSupabaseClient(true); // Use service role for seeding
  } catch (error) {
    logError('Failed to create Supabase admin client. Ensure .env.test is configured correctly.', error);
    process.exit(1);
  }

  try {
    if (action === 'baseline' || !action) { // Default to baseline if no action specified
      await seedBaseline(supabaseAdmin, technicianCount as 1 | 2 | 3 | 4);
      logInfo('Baseline seeding complete.');
    } else if (action === 'scenario') {
      if (!scenarioName) {
        logError('Scenario action requires a scenario name specified with --name=<scenario_name>');
        process.exit(1);
      }
      // Seed baseline first and get the refs
      logInfo('Seeding baseline data before applying scenario...');
      const baselineRefs = await seedBaseline(supabaseAdmin, technicianCount as 1 | 2 | 3 | 4);
      logInfo('Applying scenario...');
      // Pass the baselineRefs to the scenario router
      await seedScenario(supabaseAdmin, baselineRefs, scenarioName);
      logInfo(`Scenario '${scenarioName}' applied successfully.`);
    } else {
      logError(`Unknown action: ${action}. Use 'baseline' or 'scenario'.`);
      process.exit(1);
    }
    logInfo('Seeding script finished successfully.');
  } catch (error) {
    logError('Seeding script failed.', error);
    process.exit(1);
  }
}

main(); 