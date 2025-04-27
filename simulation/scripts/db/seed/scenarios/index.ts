import { SupabaseClient } from '@supabase/supabase-js';
// Use central utils import for DB types and loggers
import { Database, logInfo, logError } from '../../../utils';
// Import scenario-specific types directly
import type { BaselineRefs } from './types';

// Define the expected signature for scenario seeding functions
type ScenarioSeeder = (
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
) => Promise<any>; // Return type can be more specific if needed (ScenarioMetadataUpdate)

/**
 * Dynamically loads and executes the specified scenario seeding script.
 * @param supabaseAdmin - Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data (IDs).
 * @param scenarioName - The name of the scenario file (without .ts extension).
 */
export async function seedScenario(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs, // Expect baselineRefs as input now
  scenarioName: string
): Promise<void> {
  logInfo(`Attempting to seed scenario: ${scenarioName}`);

  try {
    // Dynamically import the scenario module
    const scenarioModule = await import(`./${scenarioName}.ts`);
    const functionName = `seedScenario_${scenarioName}`;

    // Check if the expected function exists in the module
    if (typeof scenarioModule[functionName] === 'function') {
      const scenarioFunction: ScenarioSeeder = scenarioModule[functionName];
      logInfo(`Executing scenario function: ${functionName}...`);
      // Pass supabaseAdmin and baselineRefs to the specific scenario function
      const scenarioResult = await scenarioFunction(supabaseAdmin, baselineRefs);
      logInfo(`Scenario '${scenarioName}' completed.`);
      // TODO: Potentially log or use scenarioResult (contains created IDs)
    } else {
      throw new Error(`Scenario function ${functionName} not found in module ${scenarioName}.ts`);
    }
  } catch (error) {
    logError(`Error seeding scenario '${scenarioName}':`, error);
    // Re-throw the error so the main seeding script can catch it
    throw error;
  }
}
