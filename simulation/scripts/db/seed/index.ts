import fs from 'fs/promises';
import path from 'path';
import { seedBaseline } from './baseline';
import { createStagingSupabaseClient, logInfo, logError } from '../../utils';
import { seedScenario } from './scenarios'; // Scenario router
import { ScenarioSeedResult, BaselineRefs } from './scenarios/types';

// Define default paths for metadata files
const DEFAULT_BASELINE_METADATA_PATH = path.resolve(__dirname, '../../../tests/integration/.baseline-metadata.json');
const DEFAULT_SCENARIO_METADATA_PATH = path.resolve(__dirname, '../../../tests/integration/.current-scenario-metadata.json');

/** Helper to parse command line arguments */
function getArgs() {
    const args = process.argv.slice(2);
    const action = args.find(arg => !arg.startsWith('--')) || 'baseline'; // Default action
    const techCountArg = args.find(arg => arg.startsWith('--techs='));
    const scenarioNameArg = args.find(arg => arg.startsWith('--name='));
    const baselineMetaPathArg = args.find(arg => arg.startsWith('--baseline-metadata='));
    const outputMetaPathArg = args.find(arg => arg.startsWith('--output-metadata='));

    const technicianCount = techCountArg ? parseInt(techCountArg.split('=')[1], 10) : 4;
    const scenarioName = scenarioNameArg ? scenarioNameArg.split('=')[1] : undefined;
    const baselineMetadataPath = baselineMetaPathArg ? baselineMetaPathArg.split('=')[1] : DEFAULT_BASELINE_METADATA_PATH;
    const outputMetadataPath = outputMetaPathArg ? outputMetaPathArg.split('=')[1] : (action === 'baseline' ? DEFAULT_BASELINE_METADATA_PATH : DEFAULT_SCENARIO_METADATA_PATH);

    if (![1, 2, 3, 4].includes(technicianCount)) {
        throw new Error('Invalid technician count specified with --techs. Must be 1, 2, 3, or 4.');
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
      const baselineRefs: BaselineRefs = await seedBaseline(supabaseAdmin, technicianCount as 1 | 2 | 3 | 4);
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
        // Optional: Add validation for baselineRefs structure here
        if (!baselineRefs?.technicianIds) {
             throw new Error('Baseline metadata file is missing essential data (e.g., technicianIds).')
        }
        logInfo('Baseline metadata read successfully.');
      } catch (readError) {
        logError(`Failed to read or parse baseline metadata from ${baselineMetadataPath}. Cannot proceed with scenario seeding.`, readError);
        process.exit(1);
      }

      // Only run scenario seed, passing the read baselineRefs
      logInfo(`Applying scenario: ${scenarioName}... (Using provided baseline metadata)`);
      const scenarioResult: ScenarioSeedResult = await seedScenario(supabaseAdmin, baselineRefs, scenarioName);
      logInfo(`Scenario '${scenarioName}' applied successfully.`);

      // Write the ScenarioSeedResult to the output file
      try {
        logInfo(`Writing scenario metadata to ${outputMetadataPath}...`);
        await fs.writeFile(outputMetadataPath, JSON.stringify(scenarioResult, null, 2));
        logInfo('Scenario metadata file written successfully.');
      } catch (writeError) {
        logError('Failed to write scenario metadata file.', writeError);
        process.exit(1);
      }

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