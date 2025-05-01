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
type AvailabilityExceptionInsert = TablesInsert<'technician_availability_exceptions'>;

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
 * Seeds data for the 'availability_overflow_skip_day' scenario.
 *
 * Creates unavailability for all technicians for tomorrow (Day+1) and enough jobs today
 * to force scheduling onto Day+2 or later.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param technicianDbIds - The DB IDs of technicians created for this scenario run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export const seedScenario_availability_overflow_skip_day = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    technicianDbIds: number[] // Use the provided tech IDs
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'availability_overflow_skip_day';
    logInfo(`Seeding scenario: ${scenarioName}...`);

    // Use the generic type from ScenarioSeedResult
    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
        technician_availability_exceptions: [],
    };

    try {
        // 1. Validate baseline refs
        if (!baselineRefs.customerIds?.length || !baselineRefs.addressIds?.length || !baselineRefs.serviceIds?.length) {
            throw new Error('BaselineRefs missing required data (customers, addresses, services).');
        }
        if (!technicianDbIds || technicianDbIds.length === 0) {
            throw new Error('No technicianDbIds provided for scenario.');
        }

        // 2. Create unavailability exceptions for all techs for tomorrow
        const tomorrow = dayjs.utc().add(1, 'day').format('YYYY-MM-DD');
        const exceptionsData: TablesInsert<'technician_availability_exceptions'>[] = technicianDbIds.map(techId => ({
            technician_id: techId,
            exception_type: 'time_off', // Simple time_off for the whole day
            date: tomorrow,
            is_available: false,
            // start_time and end_time are NULL for is_available = false & type = time_off
            reason: `Unavailable for ${scenarioName} scenario on ${tomorrow}`,
        }));

        const exceptionsResult = await insertData(
            supabase,
            'technician_availability_exceptions',
            exceptionsData, // Already an array
            'Availability exceptions for skip day scenario'
        );
        if (!exceptionsResult.data) throw new Error('Failed to insert availability exceptions.');
        insertedIds.technician_availability_exceptions = exceptionsResult.data.map(ex => ex.id);
        logInfo(`Inserted ${insertedIds.technician_availability_exceptions.length} availability exceptions for ${tomorrow}.`);

        // 3. Create enough jobs today to cause overflow
        const numberOfJobs = 15; // Seed enough jobs to likely cause overflow
        const ordersData: TablesInsert<'orders'>[] = [];
        const jobsData: Omit<TablesInsert<'jobs'>, 'order_id'>[] = [];

        for (let i = 0; i < numberOfJobs; i++) {
            const customerId = baselineRefs.customerIds[faker.number.int({ min: 0, max: baselineRefs.customerIds.length - 1 })];
            const addressId = baselineRefs.addressIds[faker.number.int({ min: 0, max: baselineRefs.addressIds.length - 1 })];
            const serviceId = baselineRefs.serviceIds[faker.number.int({ min: 0, max: baselineRefs.serviceIds.length - 1 })];

            ordersData.push({
                user_id: customerId,
                address_id: addressId,
                notes: `Order ${i + 1} for ${scenarioName}.`,
                earliest_available_time: dayjs.utc().toISOString(), // Available today
            });

            jobsData.push({
                address_id: addressId,
                service_id: serviceId,
                status: 'pending_review',
                priority: faker.number.int({ min: 1, max: 5 }),
                job_duration: faker.number.int({ min: 60, max: 120 }),
                notes: `Job ${i + 1} for ${scenarioName}.`,
            });
        }

        const ordersResult = await insertData(supabase, 'orders', ordersData, 'Orders for skip day scenario'); // Already an array
        if (!ordersResult.data) throw new Error('Failed to insert orders.');
        insertedIds.orders = ordersResult.data.map(o => o.id);
        logInfo(`Inserted ${insertedIds.orders.length} orders.`);

        const finalJobsData = jobsData.map((job, index) => ({
            ...job,
            order_id: ordersResult.data![index].id, // Link job to the inserted order
        }));

        const jobsResult = await insertData(supabase, 'jobs', finalJobsData, 'Jobs for skip day scenario'); // Already an array
        if (!jobsResult.data) throw new Error('Failed to insert jobs.');
        insertedIds.jobs = jobsResult.data.map(j => j.id);
        logInfo(`Inserted ${insertedIds.jobs.length} jobs.`);

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