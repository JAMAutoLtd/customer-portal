import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesInsert, Enums } from '../../../utils'; // Adjust path as needed
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { insertData, logInfo, logError } from '../../../utils'; // Adjust path as needed
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Define types using the standard Supabase helpers
type OrderInsert = TablesInsert<'orders'>;
type JobInsert = TablesInsert<'jobs'>;
type TechnicianAvailabilityExceptionInsert = TablesInsert<'technician_availability_exceptions'>;

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
 * Seeds data for the 'unschedulable_fixed_time' scenario.
 * Creates a job with a fixed start time that conflicts with a technician's availability exception.
 * Expected outcome: The job cannot be scheduled and should end up with status 'pending_review'.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param technicianDbIds - The DB IDs of technicians created for this scenario run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export const seedScenario_unschedulable_fixed_time = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    technicianDbIds: number[]
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'unschedulable_fixed_time';
    logInfo(`Seeding scenario: ${scenarioName}...`);

    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
        technician_availability_exceptions: [],
    };

    try {
        // 1. Validate baseline refs and techs
        if (!baselineRefs.customerIds?.length || !baselineRefs.addressIds?.length || !baselineRefs.serviceIds?.length) {
            throw new Error('BaselineRefs missing required data (customers, addresses, services).');
        }
        if (technicianDbIds.length === 0) {
            throw new Error('No technicianDbIds provided for scenario.');
        }

        // 2. Select a technician and a future date
        const assignedTechId = technicianDbIds[0];
        const exceptionDate = dayjs.utc().add(2, 'day').format('YYYY-MM-DD'); // Target two days from now
        const fixedTime = dayjs.utc(exceptionDate).set('hour', 12).set('minute', 0).set('second', 0).toISOString(); // Midday fixed time

        // 3. Create an availability exception making the tech unavailable ALL day
        const exceptionData: TechnicianAvailabilityExceptionInsert = {
            technician_id: assignedTechId,
            exception_type: 'time_off', // Or 'custom_hours' with is_available=false
            date: exceptionDate,
            is_available: false, // Explicitly unavailable
            // start_time and end_time are null when is_available is false for full day off
            reason: `Full day off for ${scenarioName}`,
        };

        const exceptionResult = await insertData(supabase, 'technician_availability_exceptions', [exceptionData], 'Technician time off exception');
        const exceptionId = exceptionResult.data?.[0]?.id;
        if (!exceptionId) throw new Error('Failed to insert availability exception.');
        insertedIds.technician_availability_exceptions = [exceptionId];
        logInfo(`Inserted availability exception ID: ${exceptionId} for Tech ${assignedTechId} on ${exceptionDate}`);

        // 4. Create the Order and the Fixed Job
        const customerId = baselineRefs.customerIds[0];
        const addressId = baselineRefs.addressIds[0];
        // Ensure the service is one the tech *could* do if available
        const serviceId = getRandomElement(BASIC_SERVICE_IDS);

        const orderData: OrderInsert = {
            user_id: customerId,
            address_id: addressId,
            notes: `Order for ${scenarioName}`,
        };
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for unschedulable fixed job');
        const orderId = orderResult.data?.[0]?.id;
        if (!orderId) throw new Error('Failed to insert order.');
        insertedIds.orders = [orderId];

        const fixedJobData: JobInsert = {
            order_id: orderId,
            address_id: addressId,
            service_id: serviceId,
            status: 'fixed_time', // Indicate fixed time
            priority: 0,
            job_duration: 60,
            notes: `Unschedulable fixed job for ${scenarioName} @ ${fixedTime}`,
            fixed_schedule_time: fixedTime,
            assigned_technician: assignedTechId,
            fixed_assignment: true, // Ensure it's assigned
        };

        const fixedJobResult = await insertData(supabase, 'jobs', [fixedJobData], 'Unschedulable fixed time job');
        const fixedJobId = fixedJobResult.data?.[0]?.id;
        if (!fixedJobId) throw new Error('Failed to insert fixed job.');
        insertedIds.jobs = [fixedJobId];
        logInfo(`Inserted unschedulable fixed job ID: ${fixedJobId} assigned to Tech ${assignedTechId} at ${fixedTime}`);

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