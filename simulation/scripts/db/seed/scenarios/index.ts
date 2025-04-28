import { SupabaseClient } from '@supabase/supabase-js';
// Use central utils import for DB types and loggers
import { Database, logInfo, logError } from '../../../utils';
// Import scenario-specific types directly
import type { BaselineRefs, ScenarioSeedResult } from './types';
// Import scenario functions
import { seedScenario_base_schedule } from './base_schedule';
import { seedScenario_equipment_conflict } from './equipment_conflict';
import { seedScenario_bundle_equipment_conflict } from './bundle_equipment_conflict';
import { seedScenario_fixed_time_today } from './fixed_time_today';
import { seedScenario_fixed_time_future_overflow } from './fixed_time_future_overflow';
import { seedScenario_availability_overflow_skip_day } from './availability_overflow_skip_day';
import { seedScenario_priority_conflict } from './priority_conflict';
import { seedScenario_same_location_jobs } from './same_location_jobs';
import { seedScenario_technician_unavailable_today } from './technician_unavailable_today';
import { seedScenario_long_duration_job } from './long_duration_job';
// Import other scenario functions as they are created

// Type definition for the map
type ScenarioSeederFunction = (
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  technicianDbIds: number[] // Pass the actual DB IDs
) => Promise<ScenarioSeedResult>;

// Map scenario names to their seeding functions
const scenarioSeeders: Record<string, ScenarioSeederFunction> = {
  base_schedule: seedScenario_base_schedule,
  equipment_conflict: seedScenario_equipment_conflict,
  bundle_equipment_conflict: seedScenario_bundle_equipment_conflict,
  fixed_time_today: seedScenario_fixed_time_today,
  fixed_time_future_overflow: seedScenario_fixed_time_future_overflow,
  availability_overflow_skip_day: seedScenario_availability_overflow_skip_day,
  priority_conflict: seedScenario_priority_conflict,
  same_location_jobs: seedScenario_same_location_jobs,
  long_duration_job: seedScenario_long_duration_job,
  technician_unavailable_today: seedScenario_technician_unavailable_today,
  // same_location_jobs: seedScenario_same_location_jobs, // Example placeholder
  // long_duration_job: seedScenario_long_duration_job, // Example placeholder
};

/**
 * Dynamically calls the appropriate scenario seeding function based on the name.
 */
export async function seedScenario(
  supabaseAdmin: SupabaseClient<Database>,
  baselineRefs: BaselineRefs,
  scenarioName: string,
  technicianDbIds: number[] // Accept the DB IDs
): Promise<ScenarioSeedResult> {
  logInfo(`Attempting to seed scenario: ${scenarioName} with ${technicianDbIds.length} technicians (IDs: ${technicianDbIds.join(', ')})`);

  const seederFunction = scenarioSeeders[scenarioName];

  if (seederFunction) {
    try {
      // Pass baseline refs and the specific technician DB IDs
      const result = await seederFunction(supabaseAdmin, baselineRefs, technicianDbIds);
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
