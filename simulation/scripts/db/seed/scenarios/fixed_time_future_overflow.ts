import type { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import type { Database, Tables, Enums, TablesInsert } from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { insertData, logInfo, logError } from '../../../utils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// --- Configuration for Controlled Equipment Eligibility ---
// Based on logs/default seeding, assume technicians have DIAG and PROG tools.
// List Service IDs that ONLY require DIAG/PROG or have NO specific requirement.
// Query: SELECT id, service_name, service_category FROM services WHERE service_category IN ('diag', 'prog') OR id IN (/* Add ADAS IDs known to be safe */);
// Eligible IDs based on services table screenshot (assuming default tech has DIAG/PROG tools):
const GUARANTEED_ELIGIBLE_SERVICE_IDS = [
    // DIAG Services (From Screenshot)
    19, // Diagnostic or Wiring
    // PROG Services
    6,  // ECM
    7,  // TCM
    8,  // BCM
    10, // Instrument Cluster
    14, // Headlamp Module
    15, // Other -prog
    // ADAS Services known NOT to require specific tools (Example IDs - VERIFY)
    // These often depend on YMM, so use with caution or stick to DIAG/PROG
    // 1, // Example: Front Radar (IF known to be safe for baseline vehicles)
    // 5, // Example: Parking Assist Sensor (IF known to be safe)
    // Avoid: IMMO (16-18), AIRBAG (9), some ADAS (1-5 etc.) unless tech is seeded with tools
];
// Ensure the list is not empty
if (GUARANTEED_ELIGIBLE_SERVICE_IDS.length === 0) {
    throw new Error("GUARANTEED_ELIGIBLE_SERVICE_IDS cannot be empty. Please define eligible service IDs.");
}
// ---

// Define types using the standard Supabase helpers
type OrderInsert = TablesInsert<'orders'>;
type JobInsert = TablesInsert<'jobs'>;

// Helper to pick a random element from an array
function getRandomElement<T>(arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot get random element from an empty array.');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// Explicitly define IDs for generally available, non-ADAS services
const BASIC_SERVICE_IDS = [6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19];

/**
 * Seeds data for the 'fixed_time_future_overflow' scenario.
 * Creates a job fixed for tomorrow and enough other jobs to exceed capacity,
 * forcing some jobs (but hopefully not the fixed one) to overflow.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param technicianDbIds - The DB IDs of technicians created for this scenario run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 * @description Tests scheduling a fixed-time job for 'tomorrow' (Day+1) amidst other dynamic jobs. Seeds a fixed job for a specific tech on Day+1 and enough filler jobs to potentially cause overflow. Verifies the fixed job is scheduled at its exact time and other jobs are planned around it.
 */
export const seedScenario_fixed_time_future_overflow = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    technicianDbIds: number[]
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'fixed_time_future_overflow';
    logInfo(`Seeding scenario: ${scenarioName}...`);

    // Use the generic type from ScenarioSeedResult
    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
        // Add specific keys dynamically if needed, e.g.:
        // fixedJobId: [] // Use array even for single ID to match type
    };

    try {
        // 1. Validate baseline refs and techs
        if (!baselineRefs.customerIds?.length || !baselineRefs.addressIds?.length || !baselineRefs.serviceIds?.length) {
            throw new Error('BaselineRefs missing required data (customers, addresses, services).');
        }
        if (technicianDbIds.length === 0) {
            throw new Error('No technicianDbIds provided for scenario.');
        }

        // 2. Determine tomorrow's date and a fixed time slot
        const assignedTechnicianId = technicianDbIds[0]; // Assign to the first tech

        // --- Create Fixed Time Job for Tomorrow --- 
        // Calculate the date for the next working day (skip weekends)
        let nextWorkday = dayjs.utc().add(1, 'day');
        if (nextWorkday.day() === 6) { // Saturday
            nextWorkday = nextWorkday.add(2, 'days'); // Move to Monday
        } else if (nextWorkday.day() === 0) { // Sunday
            nextWorkday = nextWorkday.add(1, 'day'); // Move to Monday
        }

        // Set time to 10 AM UTC on that next workday
        const fixedScheduleTime = nextWorkday.hour(10).minute(0).second(0).millisecond(0).toISOString();
        const fixedJobDateString = nextWorkday.format('YYYY-MM-DD'); // For logging

        // 3. Create the Order and the Fixed Job
        const customerId = baselineRefs.customerIds[0];
        const addressId = baselineRefs.addressIds[0];
        const serviceIdFixed = getRandomElement(GUARANTEED_ELIGIBLE_SERVICE_IDS); // NEW
        // Get a vehicle ID from baseline refs
        if (!baselineRefs.customerVehicleIds || baselineRefs.customerVehicleIds.length === 0) {
            throw new Error('BaselineRefs is missing customerVehicleIds.');
        }
        const vehicleId = baselineRefs.customerVehicleIds[0];

        const orderData: TablesInsert<'orders'> = {
            user_id: customerId,
            address_id: addressId,
            vehicle_id: vehicleId,
            notes: `Order for ${scenarioName} - Fixed Job`,
        };
        // Pass as array
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for fixed job in future overflow');
        const orderId = orderResult.data?.[0]?.id;
        if (!orderId) throw new Error('Failed to insert order for fixed job.');
        insertedIds.orders = [orderId]; // Assign directly

        const fixedJobData: TablesInsert<'jobs'> = {
            order_id: orderId,
            address_id: addressId,
            service_id: serviceIdFixed,
            status: 'fixed_time', // Set status explicitly
            priority: 1, // High priority
            job_duration: 120, // 2 hours
            notes: `Fixed job for ${scenarioName} @ ${fixedScheduleTime}`,
            fixed_schedule_time: fixedScheduleTime,
            assigned_technician: assignedTechnicianId, // Pre-assign
            fixed_assignment: true,
        };

        // Pass as array
        const fixedJobResult = await insertData(supabase, 'jobs', [fixedJobData], 'Fixed job for future overflow');
        const fixedJobId = fixedJobResult.data?.[0]?.id;
        if (!fixedJobId) throw new Error('Failed to insert fixed job.');
        insertedIds.jobs = [fixedJobId]; // Assign directly
        insertedIds.fixedJobId = [fixedJobId]; // Store separately using the generic type signature
        logInfo(`Inserted fixed job ID: ${fixedJobId} assigned to Tech ${assignedTechnicianId} at ${fixedScheduleTime}`);

        // --- Create Filler Jobs for Tomorrow (Same day as fixed job) ---
        const numberOfFillerJobs = 10; // Enough to potentially cause overflow
        const fillerJobsData: TablesInsert<'jobs'>[] = [];
        const fillerOrderIds: number[] = [];

        for (let i = 0; i < numberOfFillerJobs; i++) {
            const fillerCustomerId = baselineRefs.customerIds[faker.number.int({ min: 0, max: baselineRefs.customerIds.length - 1 })];
            const fillerAddressId = baselineRefs.addressIds[faker.number.int({ min: 0, max: baselineRefs.addressIds.length - 1 })];
            const fillerServiceId = getRandomElement(GUARANTEED_ELIGIBLE_SERVICE_IDS); // NEW
            // Use a baseline vehicle ID for filler jobs too
            const fillerVehicleId = baselineRefs.customerVehicleIds[faker.number.int({ min: 0, max: baselineRefs.customerVehicleIds.length - 1 })];

            const fillerOrderData: TablesInsert<'orders'> = {
                user_id: fillerCustomerId,
                address_id: fillerAddressId,
                vehicle_id: fillerVehicleId,
                notes: `Filler Order ${i + 1} for ${scenarioName}`,
            };
            // Pass as array
            const fillerOrderResult = await insertData(supabase, 'orders', [fillerOrderData], `Filler order ${i+1} for future overflow`);
            const fillerOrderId = fillerOrderResult.data?.[0]?.id;
            if (!fillerOrderId) {
                logError(`Failed to insert filler order ${i+1}`);
                continue; // Skip this job if order fails
            }
            fillerOrderIds.push(fillerOrderId);

            fillerJobsData.push({
                order_id: fillerOrderId,
                address_id: fillerAddressId,
                service_id: fillerServiceId,
                status: 'queued',
                priority: faker.number.int({ min: 1, max: 5 }),
                job_duration: faker.number.int({ min: 60, max: 120 }),
                notes: `Filler job ${i + 1} for ${scenarioName}. Target date: ${fixedJobDateString}`,
            });
        }

        // Update orders array with filler order IDs
        insertedIds.orders = insertedIds.orders.concat(fillerOrderIds);

        if (fillerJobsData.length > 0) {
            // Already an array
            const fillerJobsResult = await insertData(supabase, 'jobs', fillerJobsData, 'Filler jobs for future overflow');
            if (!fillerJobsResult.data) {
                logError('Failed to insert some or all filler jobs.');
            } else {
                insertedIds.jobs = insertedIds.jobs.concat(fillerJobsResult.data.map(j => j.id));
                logInfo(`Inserted ${fillerJobsResult.data.length} filler jobs.`);
            }
        }

    } catch (error) {
        logError(`Error seeding ${scenarioName}:`, error);
        throw error;
    }

    logInfo(`${scenarioName} scenario seeded successfully.`);
    return {
        scenarioName,
        insertedIds,
    };
};