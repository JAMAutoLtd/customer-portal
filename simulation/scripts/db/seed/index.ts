import fs from 'fs/promises';
import path from 'path';
import { seedBaseline } from './baseline';
import { createStagingSupabaseClient, logInfo, logError } from '../../utils';
import { seedScenario } from './scenarios/index'; // Scenario router
import { ScenarioSeedResult, BaselineRefs } from './scenarios/types';
import { cleanupScenarioLeftovers } from '../cleanup-staging';

// Define default paths for metadata files, resolving from the correct root
const DEFAULT_BASELINE_METADATA_PATH = path.resolve(__dirname, '../../../../tests/integration/.baseline-metadata.json');
const DEFAULT_SCENARIO_METADATA_PATH = path.resolve(__dirname, '../../../../tests/integration/.current-scenario-metadata.json');

/** Helper to parse command line arguments passed via pnpm script -- -- args */
function getArgs() {
    // Raw arguments passed to the script
    const rawArgs = process.argv.slice(2);

    // Find the pnpm separator '--' to isolate script-specific args
    const separatorIndex = rawArgs.indexOf('--');
    const scriptArgs = separatorIndex !== -1 ? rawArgs.slice(separatorIndex + 1) : rawArgs;

    // Initialize default values
    let action: string = 'baseline';
    let technicianCount: number = 4;
    let scenarioName: string | undefined = undefined;
    let baselineMetadataPath: string = DEFAULT_BASELINE_METADATA_PATH;
    let outputMetadataPath: string | undefined = undefined; // Determined later based on action

    // Simple manual parsing for --key value format
    for (let i = 0; i < scriptArgs.length; i++) {
        const arg = scriptArgs[i];
        const value = scriptArgs[i + 1]; // Potential value

        if (arg === '--action' && value) {
            action = value;
            i++; // Skip the value
        } else if (arg === '--techs' && value) {
            // Only process --techs if action is 'scenario'
            if (action === 'scenario') { 
                const count = parseInt(value, 10);
                if (!isNaN(count) && [1, 2, 3, 4].includes(count)) {
                    technicianCount = count;
                } else {
                    console.warn(`Invalid value for --techs: ${value}. Using default ${technicianCount}.`);
                }
            }
            i++; // Skip the value
        } else if (arg === '--name' && value) {
            scenarioName = value;
            i++; // Skip the value
        } else if (arg === '--baseline-metadata' && value) {
            baselineMetadataPath = value; // Use the provided path directly
            i++; // Skip the value
        } else if (arg === '--output-metadata' && value) {
            outputMetadataPath = value; // Use the provided path directly
            i++; // Skip the value
        } else if (!arg.startsWith('--')) {
            // If it's the first non-flag argument, treat it as the action (legacy support?)
            // Be careful with this - relies on action being first if not specified with --action
             if (i === 0 && (arg === 'baseline' || arg === 'scenario')) {
                 console.warn('DEPRECATION WARNING: Specifying action as the first argument is deprecated. Use --action <value> instead.');
                 action = arg;
             }
        }
    }

    // Determine default output path if not provided
    if (!outputMetadataPath) {
        outputMetadataPath = action === 'baseline' ? DEFAULT_BASELINE_METADATA_PATH : DEFAULT_SCENARIO_METADATA_PATH;
    }

    return {
        action,
        technicianCount,
        scenarioName,
        baselineMetadataPath,
        outputMetadataPath,
    };
}

async function main() {
  logInfo('Starting seeding script...');

  const {
      action,
      technicianCount,
      scenarioName,
      baselineMetadataPath,
      outputMetadataPath
  } = getArgs();

  logInfo(`Action: ${action}`);
  logInfo(`Technician Count: ${technicianCount}`);
  if (scenarioName) logInfo(`Scenario Name: ${scenarioName}`);
  if (action === 'scenario') logInfo(`Baseline Metadata Input Path: ${baselineMetadataPath}`);
  logInfo(`Output Metadata Path: ${outputMetadataPath}`);

  let supabaseAdmin;
  try {
    logInfo('Creating Supabase admin client...');
    supabaseAdmin = createStagingSupabaseClient(true);
  } catch (error) {
    logError('Failed to create Supabase admin client.', error);
    process.exit(1);
  }

  try {
    if (action === 'baseline') {
      // Seed baseline and write BaselineRefs metadata
      logInfo('Running baseline seeding...');
      const baselineRefs: BaselineRefs = await seedBaseline(supabaseAdmin);
      logInfo('Baseline seeding complete.');

      try {
        logInfo(`Writing baseline metadata to ${outputMetadataPath}...`);
        await fs.writeFile(outputMetadataPath, JSON.stringify(baselineRefs, null, 2));
        logInfo('Baseline metadata file written successfully.');
      } catch (writeError) {
        logError('Failed to write baseline metadata file.', writeError);
        process.exit(1);
      }

    } else if (action === 'scenario') {
      if (!scenarioName) {
        throw new Error('Scenario action requires a scenario name specified with --name=<scenario_name>');
      }

      let baselineRefs: BaselineRefs | null = null;
      try {
        logInfo(`Reading baseline metadata from ${baselineMetadataPath}...`);
        const baselineData = await fs.readFile(baselineMetadataPath, 'utf-8');
        baselineRefs = JSON.parse(baselineData) as BaselineRefs;
        logInfo('Baseline metadata read successfully.');
      } catch (readError) {
        logError(`Failed to read or parse baseline metadata from ${baselineMetadataPath}. Cannot proceed with scenario seeding.`, readError);
        process.exit(1);
      }

      // *** Add pre-scenario cleanup step ***
      logInfo('Running pre-scenario cleanup to remove leftovers...');
      await cleanupScenarioLeftovers(supabaseAdmin);
      logInfo('Pre-scenario cleanup complete.');
      // **************************************

      // *** Seed Technicians for this Scenario Run ***
      logInfo(`Seeding ${technicianCount} technicians for scenario '${scenarioName}'...`);
      const { seedScenarioTechnicians } = await import('../../utils'); // Dynamically import to avoid circular dependency issues if any
      if (!baselineRefs.vanIds || baselineRefs.vanIds.length < technicianCount) {
        throw new Error(`BaselineRefs missing required vanIds or not enough vans (${baselineRefs.vanIds?.length}) for the requested technician count (${technicianCount}).`);
      }
      const techResult = await seedScenarioTechnicians(supabaseAdmin, technicianCount);
      logInfo(`Seeded ${techResult.seededTechnicians.length} technicians. DB IDs: ${techResult.seededTechnicians.map(t => t.dbId).join(', ')}`);
      // ********************************************

      logInfo(`Applying scenario: ${scenarioName}...`);
      // Pass only the DB IDs to the scenario seeding function
      const scenarioResult = await seedScenario(supabaseAdmin, baselineRefs, scenarioName, techResult.seededTechnicians.map(t => t.dbId));
      logInfo(`Scenario '${scenarioName}' applied successfully.`);

      // Prepare metadata
      const finalMetadata: ScenarioSeedResult = {
          scenarioName: scenarioName, // Use the actual scenario name
          insertedIds: {
              ...scenarioResult.insertedIds, // Include IDs from the scenario script
              // Add technician info from the tech seeding result
              technicianAuthIds: techResult.seededTechnicians.map(t => t.authId),
              technicianDbIds: techResult.seededTechnicians.map(t => t.dbId),
              // Create an ordered array of van IDs corresponding to the technicianDbIds order
              assignedVanIds: techResult.seededTechnicians.map(t => t.assignedVanId)
          }
      };

      // Write metadata
      await fs.writeFile(outputMetadataPath, JSON.stringify(finalMetadata, null, 2));

    } else {
      throw new Error(`Unknown action: ${action}. Use 'baseline' or 'scenario'.`);
    }
    logInfo('Seeding script finished successfully.');
  } catch (error) {
    logError('Seeding script failed.', error);
    process.exit(1);
  }
}

main(); 