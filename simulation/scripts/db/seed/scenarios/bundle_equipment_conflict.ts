import type { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import type { Database, Tables, Enums, TablesInsert } from '../../../utils';
import type { BaselineRefs, ScenarioSeedResult } from './types';
import { insertData, logInfo, logError, getEquipmentForVans } from '../../../utils';

// Define types using the standard Supabase helpers
type OrderInsert = TablesInsert<'orders'>;
type JobInsert = TablesInsert<'jobs'>;
type VanEquipmentInsert = TablesInsert<'van_equipment'>;

// Helper to pick a random element from an array
function getRandomElement<T>(arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot get random element from an empty array.');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Seeds data for the 'bundle_equipment_conflict' scenario.
 *
 * Creates a single order with multiple jobs requiring different equipment,
 * such that no single technician (among the provided ones) has all the required equipment.
 * This tests the scheduler's ability to break bundles when necessary.
 *
 * @param supabase The Supabase client instance.
 * @param baselineRefs References to the baseline seeded data.
 * @param technicianDbIds - The DB IDs of technicians created for this scenario run (must be at least 2).
 * @returns A ScenarioSeedResult object containing the IDs of the created records.
 * @description Tests bundle breaking due to equipment conflicts. Creates one order with two jobs requiring different, specific ADAS tools. Assigns these tools to two separate technicians, ensuring no single tech can do both jobs. Verifies the bundle is broken and jobs are assigned individually to the correctly equipped technicians.
 */
export const seedScenario_bundle_equipment_conflict = async (
    supabase: SupabaseClient<Database>,
    baselineRefs: BaselineRefs,
    technicianDbIds: number[]
): Promise<ScenarioSeedResult> => {
    const scenarioName = 'bundle_equipment_conflict';
    logInfo(`Seeding scenario: ${scenarioName}...`);

    // Use the generic type from ScenarioSeedResult
    const insertedIds: ScenarioSeedResult['insertedIds'] = {
        orders: [],
        jobs: [],
        equipment: [],
        van_equipment: [], // Initialize if needed
    };

    try {
        // 1. Validate baseline refs and tech count
        if (!baselineRefs.customerIds?.length || !baselineRefs.addressIds?.length || !baselineRefs.customerVehicleIds?.length) {
            throw new Error('BaselineRefs missing required data (customers, addresses, customerVehicles).');
        }
        if (technicianDbIds.length < 2) {
            throw new Error(`Scenario ${scenarioName} requires at least 2 technicians, but received ${technicianDbIds.length}.`);
        }
        const techId1 = technicianDbIds[0];
        const techId2 = technicianDbIds[1];

        // Find the vans assigned to these technicians
        // Fetch from DB if not passed directly in baselineRefs (modify if needed)
        const { data: techsWithVans, error: techVanError } = await supabase
            .from('technicians')
            .select('id, assigned_van_id')
            .in('id', technicianDbIds)
            .not('assigned_van_id', 'is', null);
        if (techVanError) throw techVanError;
        if (!techsWithVans || techsWithVans.length < 2) throw new Error('Could not fetch assigned vans for scenario technicians.');

        const vanId1 = techsWithVans.find(t => t.id === techId1)?.assigned_van_id;
        const vanId2 = techsWithVans.find(t => t.id === techId2)?.assigned_van_id;
        if (!vanId1 || !vanId2) {
            throw new Error(`Could not determine assigned vans for technicians ${techId1} and/or ${techId2}.`);
        }

        // -- Step 2: Define baseline equipment IDs needed for the conflict --
        // We will use Service 1 (Front Radar) and Service 2 (Windshield Camera)
        // From baseline-data.ts, for YMM 4321 (Vehicle ID 7):
        // - Service 1 requires 'AUTEL-CSC0605/01' (Equipment ID 11)
        // - Service 2 requires 'AUTEL-CSC0601/01' (Equipment ID 12)
        const requiredEquipId1 = 11; // Baseline ID for 'AUTEL-CSC0605/01'
        const requiredEquipId2 = 12; // Baseline ID for 'AUTEL-CSC0601/01'
        // Log the baseline equipment being used
        logInfo(`Using baseline equipment IDs for conflict: Equip1=${requiredEquipId1}, Equip2=${requiredEquipId2}`);
        // No need to insert new equipment records
        insertedIds.equipment = []; // Clear this as we're not creating new ones

        // -- Step 3: Assign the required *baseline* equipment specifically to the scenario vans --
        // This ensures the conflict exists for these technicians during the test
        const vanEquipData: TablesInsert<'van_equipment'>[] = [
            { van_id: vanId1, equipment_id: requiredEquipId1 }, // Assign Equip 11 to Van 1 (Tech 1)
            { van_id: vanId2, equipment_id: requiredEquipId2 }, // Assign Equip 12 to Van 2 (Tech 2)
        ];
        const vanEquipResult = await insertData(supabase, 'van_equipment', vanEquipData, 'Assign specific baseline conflict equipment to scenario vans');
        // Store van_equipment IDs if needed
        // insertedIds.van_equipment = vanEquipResult.data?.map(ve => `${ve.van_id}-${ve.equipment_id}`);
        logInfo(`Assigned baseline Equip ${requiredEquipId1} to Van ${vanId1}, baseline Equip ${requiredEquipId2} to Van ${vanId2}`);

        // -- Step 4: Create Order and Jobs using a vehicle with known conflicting requirements --
        const customerId = baselineRefs.customerIds[0]; // Use any baseline customer
        const addressId = baselineRefs.addressIds[0];   // Use any baseline address
        // Explicitly use Vehicle ID 7 (YMM 4321 - 2010 Audi A5)
        // This vehicle has baseline ADAS requirements defined for services 1 and 2
        const vehicleId = 7;
        // Verify this vehicle ID exists in baseline refs for safety
        if (!baselineRefs.customerVehicleIds?.includes(vehicleId)) {
            throw new Error(`Selected Vehicle ID ${vehicleId} not found in baselineRefs.customerVehicleIds.`);
        }

        const orderData: TablesInsert<'orders'> = {
            user_id: customerId,
            address_id: addressId,
            vehicle_id: vehicleId,
            notes: `Order for ${scenarioName} scenario. Expect bundle break.`,
        };
        // Pass as array
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for bundle conflict');
        const orderId = orderResult.data?.[0]?.id;
        if (!orderId) throw new Error('Failed to insert order.');
        insertedIds.orders = [orderId]; // Assign directly
        logInfo(`Inserted order ID: ${orderId}`);

        // Use Service IDs 1 and 2, which have conflicting baseline requirements for vehicleId 7
        const serviceIdJob1 = 1; // Front Radar - Requires Equip 11 for YMM 4321
        const serviceIdJob2 = 2; // Windshield Camera - Requires Equip 12 for YMM 4321

        const jobsData: TablesInsert<'jobs'>[] = [
            {
                order_id: orderId,
                address_id: addressId,
                service_id: serviceIdJob1, // Requires Equip 11 (Tech 1's Van)
                status: 'queued',
                priority: 2,
                job_duration: 60,
                notes: `Job 1 for ${scenarioName}. Baseline Service 1 (Requires Equip ${requiredEquipId1}).`,
            },
            {
                order_id: orderId,
                address_id: addressId,
                service_id: serviceIdJob2, // Requires Equip 12 (Tech 2's Van)
                status: 'queued',
                priority: 2,
                job_duration: 60,
                notes: `Job 2 for ${scenarioName}. Baseline Service 2 (Requires Equip ${requiredEquipId2}).`,
            },
        ];

        // Already an array
        const jobsResult = await insertData(supabase, 'jobs', jobsData, 'Jobs for bundle conflict');
        if (!jobsResult.data || jobsResult.data.length !== 2) {
            throw new Error('Failed to insert jobs.');
        }
        insertedIds.jobs = jobsResult.data.map(job => job.id);
        logInfo(`Inserted job IDs: ${insertedIds.jobs.join(', ')}`);

        // Link services to order
        const orderServicesData = jobsResult.data.map(job => ({ order_id: orderId, service_id: job!.service_id! }));
        // Already an array
        await insertData(supabase, 'order_services', orderServicesData, 'Link bundle conflict services to order');

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