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
const NUM_QUEUED_JOBS_TO_ADD = 3; // <<< Re-add constant for queued jobs

/**
 * Seeds data for the 'fixed_time_today' scenario.
 * Creates a job with a fixed start time scheduled for today.
 * ALSO creates a few standard 'queued' jobs.
 * Expected outcome: The fixed job should be scheduled exactly at the specified time,
 * and the queued jobs should be scheduled around it.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param technicianDbIds - The DB IDs of technicians created for this scenario run.
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 * @description Tests scheduling a job with a fixed start time for 'today'. Seeds one fixed-time job assigned to a specific tech for today (or tomorrow AM if too late) and three additional dynamic 'queued' jobs. Verifies the fixed job is scheduled precisely and other jobs are planned around it.
 */
export const seedScenario_fixed_time_today = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    technicianDbIds: number[]
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'fixed_time_today';
    logInfo(`Seeding scenario: ${scenarioName}...`);

    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
    };

    try {
        // 1. Validate baseline refs and techs
        if (!baselineRefs.customerIds?.length || !baselineRefs.addressIds?.length || !baselineRefs.serviceIds?.length) {
            throw new Error('BaselineRefs missing required data (customers, addresses, services).');
        }
        if (technicianDbIds.length === 0) {
            throw new Error('No technicianDbIds provided for scenario.');
        }

        // 2. Determine a valid fixed time slot today
        const now = dayjs.utc();
        // Try to schedule for 2 PM UTC today, adjust if needed
        let fixedTimeToday = now.set('hour', 15).set('minute', 0).set('second', 0);
        // If it's already past 2 PM UTC, schedule for tomorrow 10 AM UTC instead
        if (now.hour() >= 14) {
            logInfo('Current time past 2 PM UTC, scheduling fixed job for tomorrow 10 AM UTC.');
            fixedTimeToday = now.add(1, 'day').set('hour', 10).set('minute', 0).set('second', 0);
        }
        const fixedTimeString = fixedTimeToday.toISOString();

        // 3. Assign the fixed job to a specific technician (e.g., the first one)
        const assignedTechId = technicianDbIds[0];

        // 4. Create the Order and the Fixed Job
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
            notes: `Order for ${scenarioName} - Fixed Job`,
        };
        // Pass as array
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for fixed time today job');
        const fixedJobOrderId = orderResult.data?.[0]?.id;
        if (!fixedJobOrderId) throw new Error('Failed to insert order for fixed job.');
        insertedIds.orders!.push(fixedJobOrderId); // <<< Collect order ID

        const fixedJobData: TablesInsert<'jobs'> = {
            order_id: fixedJobOrderId,
            address_id: addressId,
            service_id: serviceId,
            status: 'fixed_time', // Set status explicitly to indicate fixed time
            priority: 0, // Highest priority
            job_duration: 60,
            notes: `Fixed job for ${scenarioName} @ ${fixedTimeString}`,
            fixed_schedule_time: fixedTimeString,
            assigned_technician: assignedTechId,
            fixed_assignment: true, // Mark as fixed assignment
        };

        // Pass as array
        const fixedJobResult = await insertData(supabase, 'jobs', [fixedJobData], 'Fixed time today job');
        const fixedJobId = fixedJobResult.data?.[0]?.id;
        if (!fixedJobId) throw new Error('Failed to insert fixed job.');
        insertedIds.jobs!.push(fixedJobId); // <<< Collect fixed job ID
        logInfo(`Inserted fixed job ID: ${fixedJobId} assigned to Tech ${assignedTechId} at ${fixedTimeString}`);

        // <<< Start: Create additional queued jobs >>>
        logInfo(`Creating ${NUM_QUEUED_JOBS_TO_ADD} additional queued jobs...`);
        const queuedOrdersToCreate: OrderInsert[] = [];
        const queuedJobTemplates: Omit<JobInsert, 'order_id'>[] = [];

        for (let i = 0; i < NUM_QUEUED_JOBS_TO_ADD; i++) {
            const customerId = getRandomElement(baselineRefs.customerIds);
            const addressId = getRandomElement(baselineRefs.addressIds);
            if (!baselineRefs.customerVehicleIds || baselineRefs.customerVehicleIds.length === 0) {
                throw new Error('BaselineRefs is missing customerVehicleIds for queued jobs.');
            }
            const vehicleId = getRandomElement(baselineRefs.customerVehicleIds);
            const serviceId = getRandomElement(BASIC_SERVICE_IDS);

            const order: OrderInsert = {
                user_id: customerId,
                address_id: addressId,
                vehicle_id: vehicleId,
                notes: `Order for ${scenarioName} - Queued Job ${i + 1}`,
            };
            queuedOrdersToCreate.push(order);

            const jobTemplate: Omit<JobInsert, 'order_id'> = {
                service_id: serviceId,
                address_id: addressId,
                status: 'queued', // Explicitly queued
                priority: faker.helpers.arrayElement([1, 2, 3, 4, 5]), // Random priority
                notes: `Queued job ${i + 1} for ${scenarioName}`,
                job_duration: faker.number.int({ min: 45, max: 120 }),
                assigned_technician: null,
                estimated_sched: null,
                fixed_assignment: false,
                fixed_schedule_time: null,
                requested_time: null,
                technician_notes: null,
            };
            queuedJobTemplates.push(jobTemplate);
        }

        // Insert queued orders
        const { data: insertedQueuedOrdersData, error: queuedOrderError } = await insertData(
            supabase,
            'orders',
            queuedOrdersToCreate,
            'Queued orders for fixed time scenario'
        );
        if (queuedOrderError) throw queuedOrderError;
        const insertedQueuedOrders: Tables<'orders'>[] = insertedQueuedOrdersData ?? [];
        insertedIds.orders!.push(...insertedQueuedOrders.map(o => o.id)); // <<< Collect queued order IDs

        // Create and insert queued jobs
        const queuedJobsToCreate: JobInsert[] = [];
        for (let i = 0; i < NUM_QUEUED_JOBS_TO_ADD; i++) {
            const orderId = insertedQueuedOrders[i]?.id;
            if (!orderId) continue;
            queuedJobsToCreate.push({
                ...queuedJobTemplates[i],
                order_id: orderId,
            });
        }

        if (queuedJobsToCreate.length > 0) {
            const { data: insertedQueuedJobsData, error: queuedJobError } = await insertData(
                supabase,
                'jobs',
                queuedJobsToCreate,
                'Queued jobs for fixed time scenario'
            );
            if (queuedJobError) throw queuedJobError;
            const insertedQueuedJobs: Tables<'jobs'>[] = insertedQueuedJobsData ?? [];
            insertedIds.jobs!.push(...insertedQueuedJobs.map(j => j.id)); // <<< Collect queued job IDs
            logInfo(`Inserted ${insertedQueuedJobs.length} queued jobs.`);
        }
        // <<< End: Create additional queued jobs >>>

    } catch (error) {
        logError(`Error seeding ${scenarioName}:`, error);
        throw error;
    }

    logInfo(`${scenarioName} scenario seeded successfully. Total jobs created: ${insertedIds.jobs!.length}`);
    return {
        scenarioName,
        insertedIds,
    };
};