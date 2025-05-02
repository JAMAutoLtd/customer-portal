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
 * Seeds data for the 'locked_job_impact' scenario.
 * Creates a job with status 'en_route' or 'in_progress' today, blocking part of a tech's time.
 * Creates other 'queued' jobs for the same technician today.
 * Expected outcome: The scheduler should respect the locked job's time block and schedule the queued jobs around it.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param technicianDbIds - The DB IDs of technicians created for this scenario run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export const seedScenario_locked_job_impact = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    technicianDbIds: number[]
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'locked_job_impact';
    logInfo(`Seeding scenario: ${scenarioName}...`);

    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
    };
    const createdJobIds: number[] = []; // Keep track locally

    try {
        // 1. Validate baseline refs and techs
        if (!baselineRefs.customerIds?.length || !baselineRefs.addressIds?.length || !baselineRefs.serviceIds?.length) {
            throw new Error('BaselineRefs missing required data (customers, addresses, services).');
        }
        if (technicianDbIds.length === 0) {
            throw new Error('No technicianDbIds provided for scenario.');
        }

        // 2. Select a technician and determine times for today
        const assignedTechId = technicianDbIds[0];
        const now = dayjs.utc();
        const startTimeLockedJob = now.set('hour', 11).set('minute', 0).set('second', 0).toISOString(); // 11 AM UTC today
        const lockedJobDuration = 90; // 90 minutes
        // Queued jobs don't need specific times, just need to exist for today

        // 3. Create the Order and the Locked Job
        const customerId1 = baselineRefs.customerIds[0];
        const addressId1 = baselineRefs.addressIds[0];
        const serviceId1 = getRandomElement(BASIC_SERVICE_IDS);
        // Get a vehicle ID from baseline refs
        if (!baselineRefs.customerVehicleIds || baselineRefs.customerVehicleIds.length === 0) {
            throw new Error('BaselineRefs is missing customerVehicleIds.');
        }
        const vehicleId1 = baselineRefs.customerVehicleIds[0];

        const order1Data: OrderInsert = {
            user_id: customerId1,
            address_id: addressId1,
            vehicle_id: vehicleId1,
            notes: `Order 1 for ${scenarioName} - Locked Job`,
        };
        const order1Result = await insertData(supabase, 'orders', [order1Data], 'Order 1 for locked job scenario');
        const order1Id = order1Result.data?.[0]?.id;
        if (!order1Id) throw new Error('Failed to insert order 1.');
        insertedIds.orders!.push(order1Id);

        const lockedJobData: JobInsert = {
            order_id: order1Id,
            address_id: addressId1,
            service_id: serviceId1,
            status: 'en_route', // Locked status
            priority: 0,
            job_duration: lockedJobDuration,
            notes: `Locked job for ${scenarioName}`,
            estimated_sched: startTimeLockedJob, // Set the start time explicitly
            assigned_technician: assignedTechId,
            fixed_assignment: true, // Treat as fixed for simplicity
        };
        const lockedJobResult = await insertData(supabase, 'jobs', [lockedJobData], 'Locked job');
        const lockedJobId = lockedJobResult.data?.[0]?.id;
        if (!lockedJobId) throw new Error('Failed to insert locked job.');
        createdJobIds.push(lockedJobId);
        logInfo(`Inserted locked job ID: ${lockedJobId} assigned to Tech ${assignedTechId} starting at ${startTimeLockedJob}`);

        // 4. Create additional Orders and Queued Jobs for the same technician
        const customerId2 = baselineRefs.customerIds[1] ?? customerId1; // Use a different customer if available
        const addressId2 = baselineRefs.addressIds[1] ?? addressId1; // Different address
        const serviceId2 = getRandomElement(BASIC_SERVICE_IDS.filter(id => id !== serviceId1));
        // Use another vehicle ID
        const vehicleId2 = baselineRefs.customerVehicleIds[1] ?? vehicleId1;

        const order2Data: OrderInsert = {
            user_id: customerId2,
            address_id: addressId2,
            vehicle_id: vehicleId2,
            notes: `Order 2 for ${scenarioName} - Queued Job A`,
        };
        const order2Result = await insertData(supabase, 'orders', [order2Data], 'Order 2 for locked job scenario');
        const order2Id = order2Result.data?.[0]?.id;
        if (!order2Id) throw new Error('Failed to insert order 2.');
        insertedIds.orders!.push(order2Id);

        const queuedJobAData: JobInsert = {
            order_id: order2Id,
            address_id: addressId2,
            service_id: serviceId2,
            status: 'queued',
            priority: 1,
            job_duration: 60,
            notes: `Queued Job A for ${scenarioName}`,
            assigned_technician: assignedTechId,
            fixed_assignment: false, // Let scheduler decide exact time
        };

        const customerId3 = baselineRefs.customerIds[2] ?? customerId1;
        const addressId3 = baselineRefs.addressIds[2] ?? addressId2;
        const serviceId3 = getRandomElement(BASIC_SERVICE_IDS.filter(id => id !== serviceId1 && id !== serviceId2));
        // Use another vehicle ID
        const vehicleId3 = baselineRefs.customerVehicleIds[2] ?? vehicleId1;

        const order3Data: OrderInsert = {
            user_id: customerId3,
            address_id: addressId3,
            vehicle_id: vehicleId3,
            notes: `Order 3 for ${scenarioName} - Queued Job B`,
        };
        const order3Result = await insertData(supabase, 'orders', [order3Data], 'Order 3 for locked job scenario');
        const order3Id = order3Result.data?.[0]?.id;
        if (!order3Id) throw new Error('Failed to insert order 3.');
        insertedIds.orders!.push(order3Id);

        const queuedJobBData: JobInsert = {
            order_id: order3Id,
            address_id: addressId3,
            service_id: serviceId3,
            status: 'queued',
            priority: 1,
            job_duration: 45,
            notes: `Queued Job B for ${scenarioName}`,
            assigned_technician: assignedTechId,
            fixed_assignment: false,
        };

        const queuedJobsResult = await insertData(supabase, 'jobs', [queuedJobAData, queuedJobBData], 'Queued jobs A and B');
        const queuedJobIds = queuedJobsResult.data?.map(j => j.id) ?? [];
        if (queuedJobIds.length !== 2) throw new Error('Failed to insert queued jobs A and B.');
        createdJobIds.push(...queuedJobIds);
        logInfo(`Inserted queued job IDs: ${queuedJobIds.join(', ')} assigned to Tech ${assignedTechId}`);

        insertedIds.jobs = createdJobIds; // Assign all created job IDs

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