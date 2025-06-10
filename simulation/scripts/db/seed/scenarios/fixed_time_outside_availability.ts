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
 * Seeds data for the 'fixed_time_outside_availability' scenario.
 * Creates a fixed-time job scheduled OUTSIDE the technician's normal availability window.
 * Also creates availability exceptions to make the technician unavailable during normal hours.
 * Expected outcome: The fixed job should maintain 'fixed_time' status and be scheduled 
 * at its exact time, even though it's outside availability windows.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param technicianDbIds - The DB IDs of technicians created for this scenario run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 * @description Tests that fixed-time jobs outside availability windows are not moved to pending_review and maintain their fixed_time status. Creates a weekend fixed job and makes technician unavailable during weekday hours.
 */
export const seedScenario_fixed_time_outside_availability = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    technicianDbIds: number[]
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'fixed_time_outside_availability';
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

        // 2. Find the next Saturday (weekend) for the fixed-time job
        const nowUTC = dayjs.utc();
        let nextSaturday = nowUTC.clone();
        
        // Find next Saturday
        while (nextSaturday.day() !== 6) { // 6 = Saturday
            nextSaturday = nextSaturday.add(1, 'day');
        }
        
        // Schedule the fixed job for Saturday at 10 AM UTC (outside normal weekday availability)
        const fixedTimeUTC = nextSaturday.set('hour', 10).set('minute', 0).set('second', 0);
        const fixedTimeString = fixedTimeUTC.toISOString();
        
        logInfo(`Scheduling fixed job for Saturday ${fixedTimeUTC.format('YYYY-MM-DD HH:mm')} UTC (outside normal availability)`);

        // 3. Assign the fixed job to the first technician
        const assignedTechId = technicianDbIds[0];

        // 4. Create availability exception to make technician unavailable during normal weekday hours
        // This ensures the technician has NO availability during normal business hours
        const mondayThisWeek = nowUTC.clone().startOf('week').add(1, 'day'); // Monday
        const fridayThisWeek = mondayThisWeek.add(4, 'days'); // Friday
        
        // Create exception for Monday through Friday (making tech unavailable during normal hours)
        for (let day = mondayThisWeek; day.diff(fridayThisWeek, 'day') <= 0; day = day.add(1, 'day')) {
            const exceptionData: TablesInsert<'technician_availability_exceptions'> = {
                technician_id: assignedTechId,
                exception_type: 'time_off',
                date: day.format('YYYY-MM-DD'),
                reason: `Unavailable ${day.format('dddd')} - testing fixed time outside availability`,
                is_available: false,
                start_time: null,
                end_time: null,
            };

            const exceptionResult = await insertData(supabase, 'technician_availability_exceptions', [exceptionData], `Exception for ${day.format('dddd')}`);
            const exceptionId = exceptionResult.data?.[0]?.id;
            if (exceptionId) {
                insertedIds.technician_availability_exceptions!.push(exceptionId);
                logInfo(`Created full-day unavailability for Tech ${assignedTechId} on ${day.format('YYYY-MM-DD')}`);
            }
        }

        // 5. Create the Order and the Fixed Job
        const customerId = baselineRefs.customerIds[0];
        const addressId = baselineRefs.addressIds[0];
        const serviceId = BASIC_SERVICE_IDS[0]; // Use a basic service
        
        // Get a vehicle ID from baseline refs
        if (!baselineRefs.customerVehicleIds || baselineRefs.customerVehicleIds.length === 0) {
            throw new Error('BaselineRefs is missing customerVehicleIds.');
        }
        const vehicleId = baselineRefs.customerVehicleIds[0];

        const orderData: TablesInsert<'orders'> = {
            user_id: customerId,
            address_id: addressId,
            vehicle_id: vehicleId,
            notes: `Order for ${scenarioName} - Weekend Fixed Job`,
        };
        
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for weekend fixed job');
        const fixedJobOrderId = orderResult.data?.[0]?.id;
        if (!fixedJobOrderId) throw new Error('Failed to insert order for fixed job.');
        insertedIds.orders!.push(fixedJobOrderId);

        const fixedJobData: TablesInsert<'jobs'> = {
            order_id: fixedJobOrderId,
            address_id: addressId,
            service_id: serviceId,
            status: 'fixed_time', // Set status explicitly to indicate fixed time
            priority: 0, // Highest priority
            job_duration: 60,
            notes: `Weekend fixed job for ${scenarioName} @ ${fixedTimeString}`,
            fixed_schedule_time: fixedTimeString,
            assigned_technician: assignedTechId,
            fixed_assignment: true, // Mark as fixed assignment
        };

        const fixedJobResult = await insertData(supabase, 'jobs', [fixedJobData], 'Weekend fixed time job');
        const fixedJobId = fixedJobResult.data?.[0]?.id;
        if (!fixedJobId) throw new Error('Failed to insert fixed job.');
        insertedIds.jobs!.push(fixedJobId);
        
        logInfo(`Inserted weekend fixed job ID: ${fixedJobId} assigned to Tech ${assignedTechId} at ${fixedTimeString} (outside availability)`);

        // 6. Also create a normal queued job to ensure the scheduler still processes other jobs
        const queuedOrderData: TablesInsert<'orders'> = {
            user_id: getRandomElement(baselineRefs.customerIds),
            address_id: getRandomElement(baselineRefs.addressIds),
            vehicle_id: getRandomElement(baselineRefs.customerVehicleIds),
            notes: `Order for ${scenarioName} - Normal Queued Job`,
        };
        
        const queuedOrderResult = await insertData(supabase, 'orders', [queuedOrderData], 'Order for normal queued job');
        const queuedOrderId = queuedOrderResult.data?.[0]?.id;
        if (!queuedOrderId) throw new Error('Failed to insert queued order.');
        insertedIds.orders!.push(queuedOrderId);

        const queuedJobData: TablesInsert<'jobs'> = {
            order_id: queuedOrderId,
            address_id: queuedOrderData.address_id,
            service_id: getRandomElement(BASIC_SERVICE_IDS),
            status: 'queued',
            priority: 3,
            job_duration: 45,
            notes: `Normal queued job for ${scenarioName}`,
            assigned_technician: null,
            estimated_sched: null,
            fixed_assignment: false,
            fixed_schedule_time: null,
        };

        const queuedJobResult = await insertData(supabase, 'jobs', [queuedJobData], 'Normal queued job');
        const queuedJobId = queuedJobResult.data?.[0]?.id;
        if (!queuedJobId) throw new Error('Failed to insert queued job.');
        insertedIds.jobs!.push(queuedJobId);
        
        logInfo(`Inserted normal queued job ID: ${queuedJobId} for comparison`);

    } catch (error) {
        logError(`Error seeding ${scenarioName}:`, error);
        throw error;
    }

    logInfo(`${scenarioName} scenario seeded successfully. Total jobs created: ${insertedIds.jobs!.length}, exceptions: ${insertedIds.technician_availability_exceptions!.length}`);
    return {
        scenarioName,
        insertedIds,
    };
};