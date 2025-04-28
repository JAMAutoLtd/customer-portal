import { SupabaseClient } from '@supabase/supabase-js';
// Use central utils import for DB types and loggers
import { Database, logInfo, logError } from '../../../utils';
// Import scenario-specific types directly
import type { BaselineRefs, ScenarioSeedResult } from './types';
// Import scenario functions
import { seedScenario_base_schedule } from './base_schedule';
import { seedScenario_equipment_conflict } from './equipment_conflict';
import { seedScenario_technician_unavailable_today } from './technician_unavailable_today';
// Import other scenario functions as they are created

// Type definition for the map
type ScenarioSeederFunction = (
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianCount: number // Added parameter
) => Promise<ScenarioSeedResult>;

// Map scenario names to their seeding functions
const scenarioSeeders: Record<string, ScenarioSeederFunction> = {
  base_schedule: seedScenario_base_schedule,
  equipment_conflict: seedScenario_equipment_conflict,
  // Add other scenarios here as they are implemented
  technician_unavailable_today: seedScenario_technician_unavailable_today,
  // long_duration_job: seedScenario_long_duration_job, // Example placeholder
};

/**
 * Dynamically calls the appropriate scenario seeding function based on the name.
 */
export async function seedScenario(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  scenarioName: string,
  technicianCount: number // Added parameter
): Promise<ScenarioSeedResult> {
  logInfo(`Attempting to seed scenario: ${scenarioName} with ${technicianCount} technicians`);

  const seederFunction = scenarioSeeders[scenarioName];

  if (seederFunction) {
    try {
      // Pass technicianCount to the specific scenario function
      const result = await seederFunction(supabaseAdmin, baselineRefs, technicianCount);
      logInfo(`Scenario '${scenarioName}' completed.`);
      return result;
    } catch (error) {
      logError(`Error seeding scenario '${scenarioName}':`, error);
      throw error; // Re-throw the error to be caught by the main index.ts
    }
  } else {
    const errorMsg = `Unknown scenario name: ${scenarioName}. Available scenarios: ${Object.keys(scenarioSeeders).join(', ')}`;
    logError(errorMsg);
    throw new Error(errorMsg);
  }
}
