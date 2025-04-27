import { SupabaseClient } from '@supabase/supabase-js';
// Use central utils import for DB types and loggers
import { Database, logInfo, logError } from '../../../utils';
// Import scenario-specific types directly
import type { BaselineRefs, ScenarioSeedResult } from './types';

// Define the expected signature for scenario seeding functions
type ScenarioSeeder = (
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs
) => Promise<ScenarioSeedResult>;

/**
 * Dynamically loads and executes the specified scenario seeding script.
 * @param supabaseAdmin - Supabase client with admin privileges.
 * @param baselineRefs - References to the baseline data (IDs).
 * @param scenarioName - The name of the scenario file (without .ts extension).
 * @returns The result object from the executed scenario function.
 */
export async function seedScenario(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  scenarioName: string
): Promise<ScenarioSeedResult> {
  logInfo(`Attempting to seed scenario: ${scenarioName}`);

  try {
    // Dynamically import the scenario module
    const scenarioModule = await import(`./${scenarioName}.ts`);
    const functionName = `seedScenario_${scenarioName}`;

    // Check if the expected function exists in the module
    if (typeof scenarioModule[functionName] === 'function') {
      const scenarioFunction: ScenarioSeeder = scenarioModule[functionName];
      logInfo(`Executing scenario function: ${functionName}...`);

      // Execute the scenario function and store its result
      const scenarioResult = await scenarioFunction(supabaseAdmin, baselineRefs);

      logInfo(`Scenario '${scenarioName}' completed.`);

      // Return the result object
      return scenarioResult;
    } else {
      throw new Error(`Scenario function ${functionName} not found in module ${scenarioName}.ts`);
    }
  } catch (error) {
    logError(`Error seeding scenario '${scenarioName}':`, error);
    // Re-throw the error so the main seeding script can catch it
    throw error;
  }
}
