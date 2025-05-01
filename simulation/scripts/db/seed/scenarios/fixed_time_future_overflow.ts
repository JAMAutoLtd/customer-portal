import type { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import type { Database, Tables, Enums, TablesInsert } from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { insertData, logInfo, logError } from '../../../utils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

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
        const tomorrow = dayjs.utc().add(1, 'day');
        const fixedTimeTomorrow = tomorrow.set('hour', 10).set('minute', 0).set('second', 0).toISOString(); // 10:00 AM UTC tomorrow

        // 3. Assign the fixed job to a specific technician (e.g., the first one)
        const assignedTechId = technicianDbIds[0];

        // 4. Create the Order and the Fixed Job
        const customerId = baselineRefs.customerIds[0];
        const addressId = baselineRefs.addressIds[0];
        const serviceIdFixed = baselineRefs.serviceIds[0]; // Use a baseline service

        const orderDataFixed: TablesInsert<'orders'> = {
            user_id: customerId,
            address_id: addressId,
            notes: `Order for ${scenarioName} - Fixed Job`,
        };
        // Pass as array
        const orderResultFixed = await insertData(supabase, 'orders', [orderDataFixed], 'Order for fixed job in future overflow');
        const orderIdFixed = orderResultFixed.data?.[0]?.id;
        if (!orderIdFixed) throw new Error('Failed to insert order for fixed job.');
        insertedIds.orders = [orderIdFixed]; // Assign directly

        const fixedJobData: TablesInsert<'jobs'> = {
            order_id: orderIdFixed,
            address_id: addressId,
            service_id: serviceIdFixed,
            status: 'fixed_time', // Set status explicitly
            priority: 1, // High priority
            job_duration: 120, // 2 hours
            notes: `Fixed job for ${scenarioName} @ ${fixedTimeTomorrow}`,
            fixed_schedule_time: fixedTimeTomorrow,
            assigned_technician: assignedTechId, // Pre-assign
            fixed_assignment: true,
        };

        // Pass as array
        const fixedJobResult = await insertData(supabase, 'jobs', [fixedJobData], 'Fixed job for future overflow');
        const fixedJobId = fixedJobResult.data?.[0]?.id;
        if (!fixedJobId) throw new Error('Failed to insert fixed job.');
        insertedIds.jobs = [fixedJobId]; // Assign directly
        insertedIds.fixedJobId = [fixedJobId]; // Store separately using the generic type signature
        logInfo(`Inserted fixed job ID: ${fixedJobId} assigned to Tech ${assignedTechId} at ${fixedTimeTomorrow}`);

        // 5. Create Filler Jobs for tomorrow to cause capacity issues
        const numberOfFillerJobs = 8; // Adjust as needed based on capacity
        const fillerJobsData: TablesInsert<'jobs'>[] = [];
        const fillerOrderIds: number[] = [];

        for (let i = 0; i < numberOfFillerJobs; i++) {
            const fillerCustomerId = baselineRefs.customerIds[faker.number.int({ min: 0, max: baselineRefs.customerIds.length - 1 })];
            const fillerAddressId = baselineRefs.addressIds[faker.number.int({ min: 0, max: baselineRefs.addressIds.length - 1 })];
            const fillerServiceId = baselineRefs.serviceIds[faker.number.int({ min: 0, max: baselineRefs.serviceIds.length - 1 })];

            const fillerOrderData: TablesInsert<'orders'> = {
                user_id: fillerCustomerId,
                address_id: fillerAddressId,
                notes: `Filler Order ${i + 1} for ${scenarioName}`,
                earliest_available_time: tomorrow.startOf('day').toISOString(), // Available tomorrow
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
                status: 'pending_review',
                priority: faker.number.int({ min: 2, max: 5 }), // Lower priority than fixed job
                job_duration: faker.number.int({ min: 90, max: 150 }),
                notes: `Filler job ${i + 1} for ${scenarioName}. Target date: ${tomorrow.format('YYYY-MM-DD')}`,
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