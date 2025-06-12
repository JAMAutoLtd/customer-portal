import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { logError, logInfo } from '../../../utils';

// Import all scenario seeding functions
import { seedScenario_base_schedule } from './base_schedule';
import { seedScenario_equipment_conflict } from './equipment_conflict';
import { seedScenario_bundle_equipment_conflict } from './bundle_equipment_conflict';
import { seedScenario_fixed_time_today } from './fixed_time_today';
import { seedScenario_fixed_time_future_overflow } from './fixed_time_future_overflow';
import { seedScenario_technician_unavailable_today } from './technician_unavailable_today';
import { seedScenario_availability_overflow_skip_day } from './availability_overflow_skip_day';
import { seedScenario_priority_conflict } from './priority_conflict';
import { seedScenario_same_location_jobs } from './same_location_jobs';
import { seedScenario_long_duration_job } from './long_duration_job';
import { seedScenario_unschedulable_fixed_time } from './unschedulable_fixed_time';
import { seedScenario_locked_job_impact } from './locked_job_impact';
import { seedComprehensiveSchedulerTest } from './comprehensive_scheduler_test';

// Define the technician detail structure expected from the main seeder
interface ScenarioTechnicianInfo {
  dbId: number;
  authId: string;
  assignedVanId: number;
}

/**
 * Router function to call the correct scenario seeding script based on name.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param scenarioName The name of the scenario to seed.
 * @param seededTechniciansForScenario Array of pre-seeded technician details from the main seeder.
 * @returns A Promise resolving to the ScenarioSeedResult from the executed scenario.
 */
export async function seedScenario(
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    scenarioName: string,
    // Now expects the richer technician info array
    seededTechniciansForScenario: ScenarioTechnicianInfo[] 
): Promise<ScenarioSeedResult> {

    // For most scenarios, they only expect dbIds
    const technicianDbIds = seededTechniciansForScenario.map(t => t.dbId);

    switch (scenarioName) {
        case 'base_schedule':
            return await seedScenario_base_schedule(supabase, baselineRefs, technicianDbIds);
        case 'equipment_conflict':
            return await seedScenario_equipment_conflict(supabase, baselineRefs, technicianDbIds);
        case 'bundle_equipment_conflict':
            return await seedScenario_bundle_equipment_conflict(supabase, baselineRefs, technicianDbIds);
        case 'fixed_time_today':
            return await seedScenario_fixed_time_today(supabase, baselineRefs, technicianDbIds);
        case 'fixed_time_future_overflow':
            return await seedScenario_fixed_time_future_overflow(supabase, baselineRefs, technicianDbIds);
        case 'technician_unavailable_today':
            return await seedScenario_technician_unavailable_today(supabase, baselineRefs, technicianDbIds);
        case 'availability_overflow_skip_day':
            return await seedScenario_availability_overflow_skip_day(supabase, baselineRefs, technicianDbIds);
        case 'priority_conflict':
            return await seedScenario_priority_conflict(supabase, baselineRefs, technicianDbIds);
        case 'same_location_jobs':
            return await seedScenario_same_location_jobs(supabase, baselineRefs, technicianDbIds);
        case 'long_duration_job':
            return await seedScenario_long_duration_job(supabase, baselineRefs, technicianDbIds);
        case 'unschedulable_fixed_time':
            return await seedScenario_unschedulable_fixed_time(supabase, baselineRefs, technicianDbIds);
        case 'locked_job_impact':
            return await seedScenario_locked_job_impact(supabase, baselineRefs, technicianDbIds);
        case 'comprehensive_scheduler_test':
            logInfo('Calling comprehensive_scheduler_test scenario seeder with full technician details...');
            // Pass the full array of technician details
            return seedComprehensiveSchedulerTest(supabase, baselineRefs, seededTechniciansForScenario);

        default:
            logError(`Unknown scenario name provided: ${scenarioName}`);
            throw new Error(`Unknown scenario name: ${scenarioName}`);
    }
} 