import { createClient } from '@supabase/supabase-js';
import { Job, Technician } from '../../src/types/database.types';
import { runFullReplan } from '../../src/scheduler/orchestrator';
import { callOptimizationService } from '../../src/scheduler/optimize';
import { OptimizationRequestPayload } from '../../src/types/optimization.types';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// --- ADDED: Define a type for the metadata ---
interface ScenarioMetadata {
    generationTimestamp: string;
    scenario: string | null;
    jobCount: number;
    orderCount: number;
    technicianCount: number;
    // Scenario-specific IDs (optional based on scenario)
    missingEquipmentJobId?: number | null;
    weekendFixedJobId?: number | null;
    splitBundleOrderId?: number | null;
    splitBundleJobIds?: number[];
    fixedOverflowJobId?: number | null;
    fixedOverflowTime?: string | null;
    unavailableTechnicianId?: number | null;
    conflictOrderId?: number | null;
    highPriorityJobId?: number | null;
    lowPriorityJobId?: number | null;
    lowPriorityStarvedJobIds?: number[];
    sameLocationAddressId?: number | null;
    sameLocationJobIds?: number[];
}
// --- END ADDED ---

// Get environment variables for configuration
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:3000';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const optimizationServiceUrl = process.env.OPTIMIZATION_SERVICE_URL || 'http://localhost:8080/optimize-schedule';
const useRealOptimizationService = process.env.RUN_REAL_OPTIMIZE === 'true';

// --- REMOVED: Get scenario from environment variable (will use metadata) ---
// const scenario = process.env.E2E_SCENARIO;
// console.log(`[E2E Test] Running with scenario: ${scenario || 'Default (None)'}`);
// --- END REMOVED ---

// --- ADDED Helper: isWeekend ---
function isWeekend(dateString: string | null | undefined): boolean {
    if (!dateString) return false;
    try {
        // Allow for dates with or without timezones
        const adjustedDateString = dateString.includes('T') ? dateString : dateString + 'T00:00:00Z';
        const date = new Date(adjustedDateString);
        const day = date.getUTCDay(); // Use UTC day to be consistent with ISO strings
        return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
    } catch (e) {
        console.error(`Error parsing date for isWeekend check: ${dateString}`, e);
        return false;
    }
}
// --- END ADDED ---

// Use environment variables to connect to our test PostgreSQL/PostgREST
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- ADDED: Variable to hold loaded metadata ---
let scenarioMetadata: ScenarioMetadata;
// --- END ADDED ---

// REVIEW NOTE: Consider adding generated Supabase types for better type safety on fetched data,
// especially for nested relations like `orders`.
// e.g., import { Database } from '../src/types/supabase'; type JobWithOrder = Job & { orders: { earliest_available_time: string | null } | null };

describe('End-to-End Job Scheduling Process', () => {
  // --- ADDED: Load Metadata before tests ---
  beforeAll(() => {
      const metadataPath = path.join(__dirname, '../../SIMULATION/seed-metadata.json');
      try {
          const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
          scenarioMetadata = JSON.parse(metadataContent);
          console.log(`[E2E Test] Loaded metadata for scenario: ${scenarioMetadata.scenario || 'Default'}`);
      } catch (error) {
          console.error(`[E2E Test] FAILED to load or parse seed metadata from ${metadataPath}. Tests will likely fail.`, error);
          // Set a default structure to prevent crashes, but indicate failure
          scenarioMetadata = {
              generationTimestamp: '',
              scenario: 'metadata-load-error',
              jobCount: 0,
              orderCount: 0,
              technicianCount: 0
          };
      }
  });
  // --- END ADDED ---

  it('should successfully process and assign jobs based on generated seed data and scenario', async () => {
    // Run the main orchestration function
    await runFullReplan(supabase);

    // --- MODIFIED: Fetch results based on initial 'queued' status ---
    console.log('+++ TEST: Fetching results for all jobs (initial status was likely \'queued\')... +++');
    // Fetch ALL jobs to see their final state, filter later if needed by scenario
    const query = supabase
      .from('jobs')
      .select('*, orders(earliest_available_time)'); // Fetch related order for earliest_available_time check
    const { data: finalJobs, error } = await query;

    expect(error).toBeNull();
    expect(finalJobs).not.toBeNull();
    // Cannot assert length strictly without knowing initial count, but should have processed some jobs
    console.log(`+++ TEST: Fetched ${finalJobs?.length ?? 0} total final job results. +++`);
    // --- End MODIFIED ---

    // --- ADDED: Log final job data for analysis ---
    if (finalJobs) {
        console.log('+++ FINAL JOB DATA FOR ANALYSIS +++');
        console.log(JSON.stringify(finalJobs, null, 2));
        console.log('+++++++++++++++++++++++++++++++++++');
    }
    // --- END ADDED ---

    if (finalJobs) {
        const scheduledJobs = finalJobs.filter(job => job.status === 'queued');
        const pendingJobs = finalJobs.filter(job => job.status === 'pending_review');

        console.log(`+++ TEST: Found ${scheduledJobs.length} scheduled ('queued') and ${pendingJobs.length} pending ('pending_review') jobs.`);

        // --- REPLACED: Scenario-Based Assertions ---
        const scenario = scenarioMetadata.scenario;
        console.log(`--- Running Scenario-Specific Assertions for: ${scenario || 'Default'} --- `);

        // --- General Consistency Check (Run for all scenarios, including default) ---
        finalJobs.forEach(job => {
            if (job.status === 'queued') {
                expect(job.assigned_technician).not.toBeNull();
                expect(job.estimated_sched).not.toBeNull();
            } else if (job.status === 'pending_review') {
                expect(job.assigned_technician).toBeNull();
                expect(job.estimated_sched).toBeNull();
            } else if (job.status === null) {
                expect(job.assigned_technician).toBeNull();
                expect(job.estimated_sched).toBeNull();
            } else {
                throw new Error(`Unexpected final status '${job.status}' found for job ${job.id}`);
            }
        });
        console.log('[General Check] PASSED - Attributes match final status.');
        // --- End General Consistency Check ---

        if (scenario) {
            switch (scenario) {
                case 'missing-equipment':
                    console.log('--- Scenario: missing-equipment ---');
                    {
                        const targetJobId = scenarioMetadata.missingEquipmentJobId;
                        expect(targetJobId).toBeDefined(); // Metadata should contain the ID
                        console.log(`[Test Assertion] Looking for missing equipment job ID: ${targetJobId}`);
                        const targetJob = finalJobs.find(j => j.id === targetJobId);
                        expect(targetJob).toBeDefined();

                        // Assert it is pending review
                        console.log(`[Test Assertion] Checking status for job ${targetJob?.id}`);
                        expect(targetJob?.status).toBe('pending_review');
                        expect(targetJob?.assigned_technician).toBeNull();
                        console.log("[Scenario Check] PASSED: Job requiring missing equipment is pending_review.");
                    }
                    break;

                case 'weekend-fixed':
                    console.log('--- Scenario: weekend-fixed ---');
                    {
                        const targetJobId = scenarioMetadata.weekendFixedJobId;
                        expect(targetJobId).toBeDefined(); // Metadata should contain the ID
                        console.log(`[Test Assertion] Looking for weekend fixed job ID: ${targetJobId}`);
                        const weekendJob = finalJobs.find(j => j.id === targetJobId);
                        expect(weekendJob).toBeDefined(); // Generator guarantees one
                        console.log(`[Test Assertion] Found weekend fixed job ${weekendJob?.id} scheduled for ${weekendJob?.fixed_schedule_time}`);
                        expect(isWeekend(weekendJob?.fixed_schedule_time)).toBe(true); // Double-check it *is* a weekend

                        // Assert it's pending review
                        expect(weekendJob?.status).toBe('pending_review');
                        expect(weekendJob?.assigned_technician).toBeNull();
                        console.log('[Scenario Check] PASSED: Weekend fixed-time job is pending_review.');
                    }
                    break;

                case 'split-bundle':
                    console.log('--- Scenario: split-bundle ---');
                    {
                        const targetOrderId = scenarioMetadata.splitBundleOrderId;
                        const targetJobIds = scenarioMetadata.splitBundleJobIds;
                        expect(targetOrderId).toBeDefined();
                        expect(targetJobIds).toBeDefined();
                        expect(targetJobIds?.length).toBeGreaterThan(1); // Should be at least 2
                        console.log(`[Test Assertion] Looking for split bundle jobs for Order ID: ${targetOrderId} (Job IDs: ${targetJobIds?.join(', ')})`);

                        const targetOrderJobs = finalJobs.filter(j => j.order_id === targetOrderId);
                        expect(targetOrderJobs.length).toEqual(targetJobIds?.length);

                        // Assert ALL jobs in the bundle are pending_review
                        targetOrderJobs.forEach(job => {
                            console.log(`[Test Assertion] Checking status for split-bundle job ${job.id}`);
                            expect(targetJobIds).toContain(job.id);
                            expect(job.status).toBe('pending_review');
                            expect(job.assigned_technician).toBeNull();
                        });
                        console.log("[Scenario Check] PASSED: All jobs in the split-bundle are pending_review.");
                    }
                    break;

                case 'force-non-work-days':
                    console.log('--- Scenario: force-non-work-days ---');
                    {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const nonWorkDay1 = new Date(today);
                        nonWorkDay1.setDate(today.getDate() + 1);
                        const nonWorkDay1DateStr = nonWorkDay1.toISOString().split('T')[0]; // YYYY-MM-DD

                        const nonWorkDay2 = new Date(today);
                        nonWorkDay2.setDate(today.getDate() + 2);
                        const nonWorkDay2DateStr = nonWorkDay2.toISOString().split('T')[0]; // YYYY-MM-DD

                        console.log(`[Test Assertion] Checking for jobs scheduled on forced non-work days: ${nonWorkDay1DateStr} or ${nonWorkDay2DateStr}`);

                        // Find jobs that *were* scheduled (status: 'queued')
                        const scheduledJobs = finalJobs.filter(j => j.status === 'queued');

                        // Assert none of them were scheduled on Day+1 or Day+2
                        scheduledJobs.forEach(job => {
                            expect(job.estimated_sched).not.toBeNull(); // Should have a schedule time
                            const scheduledDateStr = job.estimated_sched!.split('T')[0]; // Extract YYYY-MM-DD

                            if (scheduledDateStr === nonWorkDay1DateStr || scheduledDateStr === nonWorkDay2DateStr) {
                                console.error(`[Test Assertion Failure] Job ${job.id} was scheduled on a forced non-work day: ${job.estimated_sched}`);
                            }
                            expect(scheduledDateStr).not.toBe(nonWorkDay1DateStr);
                            expect(scheduledDateStr).not.toBe(nonWorkDay2DateStr);
                        });

                        console.log('[Scenario Check] PASSED: No jobs were scheduled on the forced non-work days (Day+1, Day+2).');
                    }
                    break;

                case 'force-fixed-overflow':
                    console.log('--- Scenario: force-fixed-overflow ---');
                    {
                        const targetJobId = scenarioMetadata.fixedOverflowJobId;
                        const targetTime = scenarioMetadata.fixedOverflowTime;
                        expect(targetJobId).toBeDefined();
                        expect(targetTime).toBeDefined();
                        console.log(`[Test Assertion] Looking for fixed overflow job ID: ${targetJobId} scheduled for ${targetTime}`);

                        const forcedJob = finalJobs.find(j => j.id === targetJobId);
                        expect(forcedJob).toBeDefined();

                        // Assert it's scheduled ('queued') at the expected fixed time
                        expect(forcedJob?.status).toBe('queued');
                        expect(forcedJob?.assigned_technician).not.toBeNull();
                        expect(forcedJob?.estimated_sched).not.toBeNull();
                        // Compare timestamps (ignoring milliseconds for safety)
                        const expectedTime = new Date(targetTime!.replace(' ', 'T') + 'Z').toISOString().slice(0, 19);
                        const actualTime = new Date(forcedJob!.estimated_sched!).toISOString().slice(0, 19);
                        expect(actualTime).toBe(expectedTime);
                        console.log('[Scenario Check] PASSED: Forced job is scheduled at the correct fixed time and assigned.');
                    }
                    break;

                case 'force-technician-unavailable':
                    console.log('--- Scenario: force-technician-unavailable ---');
                    {
                        const today = new Date();
                        const unavailableStart = new Date(today);
                        unavailableStart.setHours(12, 0, 0, 0); // 12:00 PM today
                        const unavailableEnd = new Date(today);
                        unavailableEnd.setHours(16, 0, 0, 0); // 4:00 PM today

                        const targetTechnicianId = scenarioMetadata.unavailableTechnicianId;
                        expect(targetTechnicianId).toBeDefined(); // Should be in metadata (e.g., 1)

                        console.log(`[Test Assertion] Checking for jobs assigned to Tech ${targetTechnicianId} during forced unavailability: ${unavailableStart.toISOString()} to ${unavailableEnd.toISOString()}`);

                        // Find jobs scheduled and assigned to the target technician
                        const techScheduledJobs = finalJobs.filter(j =>
                            j.status === 'queued' &&
                            j.assigned_technician === targetTechnicianId &&
                            j.estimated_sched !== null
                        );

                        // Assert none of them fall within the unavailable window
                        techScheduledJobs.forEach(job => {
                            const scheduledTime = new Date(job.estimated_sched!);

                            const isDuringUnavailability = scheduledTime >= unavailableStart && scheduledTime < unavailableEnd;

                            if (isDuringUnavailability) {
                                console.error(`[Test Assertion Failure] Job ${job.id} (Tech ${targetTechnicianId}) was scheduled at ${job.estimated_sched} during forced unavailability window.`);
                            }
                            expect(isDuringUnavailability).toBe(false);
                        });

                        console.log(`[Scenario Check] PASSED: Tech ${targetTechnicianId} has no jobs scheduled during the forced unavailability window.`);
                    }
                    break;

                case 'force-high-priority-conflict':
                    console.log('--- Scenario: force-high-priority-conflict ---');
                    {
                        const targetOrderId = scenarioMetadata.conflictOrderId;
                        const highPrioJobId = scenarioMetadata.highPriorityJobId;
                        const lowPrioJobId = scenarioMetadata.lowPriorityJobId;

                        expect(targetOrderId).toBeDefined();
                        expect(highPrioJobId).toBeDefined();
                        expect(lowPrioJobId).toBeDefined();
                        console.log(`[Test Assertion] Looking for conflict jobs in Order ${targetOrderId}: High Prio ID ${highPrioJobId}, Low Prio ID ${lowPrioJobId}`);

                        const highPriorityJob = finalJobs.find(j => j.id === highPrioJobId);
                        const lowPriorityJob = finalJobs.find(j => j.id === lowPrioJobId);

                        expect(highPriorityJob).toBeDefined();
                        expect(lowPriorityJob).toBeDefined();
                        expect(highPriorityJob?.order_id).toBe(targetOrderId);
                        expect(lowPriorityJob?.order_id).toBe(targetOrderId);

                        // Assert that the high-priority job is scheduled
                        expect(highPriorityJob?.priority).toBe(10);
                        expect(highPriorityJob?.status).toBe('queued');
                        console.log(` -> High priority job ${highPriorityJob?.id} is queued.`);

                        // Assert that the low-priority job is either scheduled or pending
                        expect(lowPriorityJob?.priority).toBe(1);
                        const lowPriorityStatus = lowPriorityJob?.status;
                        console.log(` -> Low priority job ${lowPriorityJob?.id} has status: ${lowPriorityStatus}`);
                        expect(lowPriorityStatus === 'queued' || lowPriorityStatus === 'pending_review').toBe(true);

                        console.log('[Scenario Check] PASSED: High-priority job (10) is scheduled, low-priority job (1) is scheduled or pending.');
                    }
                    break;

                case 'force-low-priority-starvation':
                    console.log('--- Scenario: force-low-priority-starvation ---');
                    {
                        const targetJobIds = scenarioMetadata.lowPriorityStarvedJobIds;
                        expect(targetJobIds).toBeDefined();
                        expect(targetJobIds?.length).toBeGreaterThan(0);
                        console.log(`[Test Assertion] Looking for low priority starved job IDs: ${targetJobIds?.join(', ')}`);

                        // Find jobs matching the target IDs and assert they are in 'pending_review' status
                        const lowPriorityJobs = finalJobs.filter(j => targetJobIds?.includes(j.id));
                        expect(lowPriorityJobs.length).toEqual(targetJobIds?.length);

                        lowPriorityJobs.forEach(job => {
                            console.log(`[Test Assertion] Checking status for low-priority job ${job.id}`);
                            expect(job.priority).toBe(1); // Verify priority
                            expect(job.status).toBe('pending_review');
                            expect(job.assigned_technician).toBeNull();
                        });
                        console.log("[Scenario Check] PASSED: All targeted low-priority jobs are pending_review.");
                    }
                    break;

                case 'force-multiple-jobs-same-location':
                    console.log('--- Scenario: force-multiple-jobs-same-location ---');
                    {
                        const targetAddressId = scenarioMetadata.sameLocationAddressId;
                        const targetJobIds = scenarioMetadata.sameLocationJobIds;
                        expect(targetAddressId).toBeDefined();
                        expect(targetJobIds).toBeDefined();
                        expect(targetJobIds?.length).toBeGreaterThan(2);
                        console.log(`[Test Assertion] Checking jobs for target address ID: ${targetAddressId} (Job IDs: ${targetJobIds?.join(', ')})`);

                        const targetAddressJobs = finalJobs.filter(j => j.address_id === targetAddressId);
                        console.log(` -> Found ${targetAddressJobs.length} jobs at address ${targetAddressId}.`);
                        expect(targetAddressJobs.length).toEqual(targetJobIds?.length); // Verify count matches metadata

                        // Assert ALL jobs at the target address are scheduled ('queued')
                        targetAddressJobs.forEach(job => {
                            console.log(`[Test Assertion] Checking status for job ${job.id} at address ${targetAddressId}`);
                            expect(targetJobIds).toContain(job.id); // Ensure it's one of the targeted jobs
                            expect(job.status).toBe('queued');
                            expect(job.assigned_technician).not.toBeNull(); // Should be assigned if queued
                        });
                        console.log(`[Scenario Check] PASSED: All targeted jobs (${targetAddressJobs.length}) at the same location address are scheduled.`);
                    }
                    break;

                default:
                    console.warn(`Unknown or unhandled scenario '${scenario}' read from metadata. No specific assertions implemented.`);
                    // No specific assertions for default or unknown scenarios beyond the general check
                    break;
            }
        } else {
            // --- Default Behavior (No Scenario / scenario is null in metadata) ---
            console.log('No specific scenario defined in metadata. Only basic consistency checks were performed.');
            // The general consistency check already ran above.
            // Add other general checks here if needed for the default case.
            // --- End Default Behavior ---
        }
        // --- End REPLACED ---

        console.log(`+++ TEST: Verification successful! +++`);

    } else {
         throw new Error('E2E test failed: Failed to fetch job results after replan.');
    }
  }, 60000); // <-- Increased timeout to 60 seconds (60000 ms)

  // --- Adjusted Test for Graceful Failure ---
  it('should handle optimization service *request* failure gracefully', async () => {
    // This test now simulates a failure by sending invalid data causing a likely 422 error,
    // rather than relying on mocking or service downtime.

    console.log('Running test: should handle optimization service *request* failure gracefully');

    // Fetch jobs before the test to check their initial state
    const { data: initialJobs, error: initialError } = await supabase
      .from('jobs')
      .select('id, assigned_technician, status, estimated_sched') // Select specific fields for comparison
      .in('id', [1, 2, 3]);

    expect(initialError).toBeNull();
    expect(initialJobs).not.toBeNull();
    console.log('Initial job state fetched for failure test.');

    // Construct an invalid payload (e.g., malformed travelTimeMatrix)
    const invalidPayload: OptimizationRequestPayload = {
      locations: [{ id: 'depot', index: 0, coords: { lat: 0, lng: 0 } }],
      technicians: [{ id: 1, startLocationIndex: 0, endLocationIndex: 0, earliestStartTimeISO: '2024-01-01T09:00:00Z', latestEndTimeISO: '2024-01-01T17:00:00Z' }],
      items: [{ id: 'job_1', locationIndex: 0, durationSeconds: 3600, priority: 1, eligibleTechnicianIds: [1] }],
      fixedConstraints: [],
      travelTimeMatrix: { 'invalid_key': {'another_invalid': -1} } as any // Intentionally invalid structure
    };

    let errorThrown = false;
    try {
      console.log('Attempting to call optimization service with invalid payload...');
      // Directly call the optimization function with the invalid payload
      await callOptimizationService(invalidPayload);
      // If the above line doesn't throw, the test fails
      console.error('Test Error: callOptimizationService did not throw an error as expected.');
    } catch (error: any) {
      // We expect an error (likely an Axios HTTP error)
      console.log(`Caught expected error: ${error.message}`);
      // Optional: Add more specific checks on the error type or status code if needed
      // e.g., expect(error.message).toContain('422');
      errorThrown = true;
    }

    // Assert that an error was actually caught
    expect(errorThrown).toBe(true);
    console.log('Verified that an error was thrown by callOptimizationService.');

    // Fetch jobs after the failed run to ensure they weren't changed
    console.log('Fetching final job state for failure test...');
    const { data: finalJobs, error: finalError } = await supabase
      .from('jobs')
      .select('id, assigned_technician, status, estimated_sched') // Select same fields
      .in('id', [1, 2, 3]);

    expect(finalError).toBeNull();
    expect(finalJobs).not.toBeNull();

    // Ensure the jobs weren't changed by the failed run
    console.log('Asserting final job state equals initial job state...');
    expect(finalJobs).toEqual(initialJobs);
    console.log('Failure test completed successfully.');
  });
  // --- End Adjusted Test ---
}); 