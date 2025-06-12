import { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import { BaselineRefs, ScenarioSeedResult } from './types';
import { Database, TablesInsert, insertData, logInfo, logError } from '../../../utils';

/**
 * Seeds data for the 'long_duration_job' scenario.
 *
 * Creates a single job with a very long duration to test scheduler capacity handling.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param _technicianDbIds - The DB IDs of technicians created for this scenario run (unused in this specific scenario).
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 * @description Tests the scheduler's ability to handle and assign a single job with a very long duration (6-8 hours). Verifies that the job is scheduled and retains its long duration.
 */
export const seedScenario_long_duration_job = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    _technicianDbIds: number[] // Add technicianDbIds parameter for consistent interface
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'long_duration_job';
    logInfo(`Seeding scenario: ${scenarioName}...`);

    // Use the generic type from ScenarioSeedResult
    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
        addresses: [],
    };

    try {
        // 1. Create an Address
        const addressData: TablesInsert<'addresses'> = {
            street_address: faker.location.streetAddress(),
            lat: faker.location.latitude(),
            lng: faker.location.longitude(),
        };
        const addressResult = await insertData(supabase, 'addresses', [addressData], 'Address for long duration job');
        const addressId = addressResult.data?.[0]?.id;
        if (!addressId) throw new Error('Failed to insert address.');
        insertedIds.addresses = [addressId];
        logInfo(`Inserted address ID: ${addressId}`);

        // 2. Create an Order linked to a baseline customer
        if (!baselineRefs.customerIds || baselineRefs.customerIds.length === 0) {
            throw new Error('BaselineRefs is missing customer IDs.');
        }
        const customerId = baselineRefs.customerIds[0];
        // Get a vehicle ID from baseline refs
        if (!baselineRefs.customerVehicleIds || baselineRefs.customerVehicleIds.length === 0) {
            throw new Error('BaselineRefs is missing customerVehicleIds.');
        }
        const vehicleId = baselineRefs.customerVehicleIds[0]; // Use first baseline vehicle

        const orderData: TablesInsert<'orders'> = {
            user_id: customerId,
            address_id: addressId,
            vehicle_id: vehicleId,
            notes: `Order for ${scenarioName} scenario.`,
            earliest_available_time: faker.date.soon({ days: 1 }).toISOString(),
        };
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for long duration job');
        const orderId = orderResult.data?.[0]?.id;
        if (!orderId) throw new Error('Failed to insert order.');
        insertedIds.orders = [orderId];
        logInfo(`Inserted order ID: ${orderId}`);

        // 3. Create the Long Duration Job
        if (!baselineRefs.serviceIds || baselineRefs.serviceIds.length === 0) {
            throw new Error('BaselineRefs is missing service IDs.');
        }
        const serviceId = baselineRefs.serviceIds[faker.number.int({ min: 0, max: baselineRefs.serviceIds.length - 1 })];

        const longDurationMinutes = faker.number.int({ min: 360, max: 480 }); // 6-8 hours

        const jobData: TablesInsert<'jobs'> = {
            order_id: orderId,
            address_id: addressId,
            service_id: serviceId,
            status: 'queued',
            priority: faker.number.int({ min: 1, max: 3 }), // High to medium priority
            job_duration: longDurationMinutes,
            notes: `Job for ${scenarioName}. Duration: ${longDurationMinutes} mins. Service ID: ${serviceId}`,
        };

        const jobsResult = await insertData(supabase, 'jobs', [jobData], 'Long duration job');
        if (!jobsResult.data || jobsResult.data.length !== 1) {
            throw new Error('Failed to insert the long duration job.');
        }
        insertedIds.jobs = jobsResult.data.map(job => job.id);
        logInfo(`Inserted long duration job ID: ${insertedIds.jobs[0]}`);

        // 4. Link Service to Order
        const orderServicesData = [{ order_id: orderId, service_id: serviceId }];
        await insertData(supabase, 'order_services', orderServicesData, 'Link service for long duration job');
        logInfo(`Linked service ${serviceId} to order ${orderId}.`);

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