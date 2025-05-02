import { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import { BaselineRefs, ScenarioSeedResult } from './types';
import { Database, TablesInsert, insertData, logInfo, logError } from '../../../utils'; // Corrected path and added logging utils

/**
 * Seeds data for the 'same_location_jobs' scenario.
 *
 * Creates multiple jobs linked to the same order and the same address.
 * This tests the scheduler's ability to handle and potentially optimize
 * routes involving multiple stops at a single location.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data (customers, services, etc.).
 * @param _technicianDbIds - The DB IDs of technicians created for this scenario run (unused in this specific scenario).
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 */
export const seedScenario_same_location_jobs = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    _technicianDbIds: number[] // Add technicianDbIds parameter for consistent interface
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'same_location_jobs';
    logInfo(`Seeding scenario: ${scenarioName}...`); // Use logInfo

    // Use the generic type from ScenarioSeedResult
    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
        addresses: [],
    };

    try {
        // 1. Create a single Address for all jobs
        const addressData: TablesInsert<'addresses'> = {
            street_address: faker.location.streetAddress(),
            lat: faker.location.latitude(),
            lng: faker.location.longitude(),
        };
        // Pass as array
        const addressResult = await insertData(supabase, 'addresses', [addressData], 'Address for same location jobs');
        const addressId = addressResult.data?.[0]?.id;
        if (!addressId) throw new Error('Failed to insert address.');
        insertedIds.addresses = [addressId]; // Assign directly
        logInfo(`Inserted address ID: ${addressId}`);

        // 2. Create a single Order linked to the address and a baseline customer
        if (!baselineRefs.customerIds || baselineRefs.customerIds.length === 0) {
            throw new Error('BaselineRefs is missing customer IDs.');
        }
        const customerId = baselineRefs.customerIds[0]; // Use first baseline customer ID
        // Get a vehicle ID from baseline refs
        if (!baselineRefs.customerVehicleIds || baselineRefs.customerVehicleIds.length === 0) {
            throw new Error('BaselineRefs is missing customerVehicleIds.');
        }
        const vehicleId = baselineRefs.customerVehicleIds[0]; // Use first baseline vehicle

        const orderData: TablesInsert<'orders'> = {
            user_id: customerId,
            address_id: addressId,
            vehicle_id: vehicleId, // <-- Corrected: Use customerVehicleIds
            notes: `Order for ${scenarioName} scenario. Multiple jobs at same address.`,
            earliest_available_time: faker.date.soon({ days: 1 }).toISOString(), // e.g., available tomorrow
        };
        // Pass as array
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for same location jobs');
        const orderId = orderResult.data?.[0]?.id;
        if (!orderId) throw new Error('Failed to insert order.');
        insertedIds.orders = [orderId]; // Assign directly
        logInfo(`Inserted order ID: ${orderId}`);

        // 3. Create Multiple Jobs for the same Order and Address
        const numberOfJobs = faker.number.int({ min: 3, max: 4 }); // Create 3 or 4 jobs
        const jobDataArray: TablesInsert<'jobs'>[] = [];
        for (let i = 0; i < numberOfJobs; i++) {
            if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length === 0) {
                throw new Error('BaselineRefs is missing service IDs.');
            }
            const serviceId = baselineRefs.serviceIds[faker.number.int({ min: 0, max: baselineRefs.serviceIds.length - 1 })];

            jobDataArray.push({
                order_id: orderId,
                address_id: addressId,
                service_id: serviceId,
                status: 'queued', // Changed from pending_review
                priority: faker.number.int({ min: 1, max: 5 }), // Random priority
                job_duration: faker.number.int({ min: 45, max: 90 }), // 45-90 minutes
                notes: `Job ${i + 1}/${numberOfJobs} for ${scenarioName} at address ${addressId}. Service ID: ${serviceId}`,
            });
        }

        // Already an array
        const jobsResult = await insertData(supabase, 'jobs', jobDataArray, 'Jobs for same location scenario');
        if (!jobsResult.data || jobsResult.data.length !== numberOfJobs) {
            throw new Error(`Failed to insert all ${numberOfJobs} jobs.`);
        }
        insertedIds.jobs = jobsResult.data.map(job => job.id);
        logInfo(`Inserted job IDs: ${insertedIds.jobs.join(', ')}`);

        // 4. Link Services to Order (Optional but good practice)
        const orderServicesData = insertedIds.jobs.map(jobId => {
            const job = jobsResult.data?.find(j => j.id === jobId);
            if (!job || !job.service_id) {
                logError(`Could not find job or service_id for job ID ${jobId} when linking services.`);
                return null;
            }
            return { order_id: orderId, service_id: job.service_id };
        }).filter(item => item !== null) as { order_id: number; service_id: number }[];

        const uniqueOrderServices = Array.from(new Map(orderServicesData.map(item => [`${item.order_id}-${item.service_id}`, item])).values());
        if (uniqueOrderServices.length > 0) {
             // Already an array
             await insertData(supabase, 'order_services', uniqueOrderServices, 'Link services for same location order');
             logInfo(`Linked ${uniqueOrderServices.length} unique services to order ${orderId}.`);
        } else {
             logInfo('No unique services to link for this order.');
        }

    } catch (error) {
        logError(`Error seeding ${scenarioName}:`, error);
        throw error;
    }

    logInfo(`${scenarioName} scenario seeded successfully.`);
    // Return the generic ScenarioSeedResult type
    return {
        scenarioName,
        insertedIds,
    };
}; 