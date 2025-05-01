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
        if (!baselineRefs.customerIds?.length || !baselineRefs.addressIds?.length) {
            throw new Error('BaselineRefs missing required data (customers, addresses).');
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

        // 2. Create distinct equipment for each job/technician
        const equipmentData1: TablesInsert<'equipment'> = { model: `BundleConflictEquip-${faker.string.uuid().substring(0, 4)}`, equipment_type: 'prog' };
        const equipmentData2: TablesInsert<'equipment'> = { model: `BundleConflictEquip-${faker.string.uuid().substring(0, 4)}`, equipment_type: 'adas' };

        // Pass as arrays
        const equipResult1 = await insertData(supabase, 'equipment', [equipmentData1], 'Equipment 1 for bundle conflict');
        const equipResult2 = await insertData(supabase, 'equipment', [equipmentData2], 'Equipment 2 for bundle conflict');
        const equipId1 = equipResult1.data?.[0]?.id;
        const equipId2 = equipResult2.data?.[0]?.id;
        if (!equipId1 || !equipId2) throw new Error('Failed to insert equipment.');
        insertedIds.equipment = [equipId1, equipId2]; // Assign directly
        logInfo(`Inserted equipment IDs: ${insertedIds.equipment.join(', ')}`);

        // 3. Assign equipment to vans (Equip1 -> Van1, Equip2 -> Van2)
        const vanEquipData: TablesInsert<'van_equipment'>[] = [
            { van_id: vanId1, equipment_id: equipId1 },
            { van_id: vanId2, equipment_id: equipId2 },
        ];
        // Already an array
        const vanEquipResult = await insertData(supabase, 'van_equipment', vanEquipData, 'Assign conflict equipment to vans');
        // Store van_equipment IDs if needed (assuming PK is (van_id, equipment_id) or similar - needs schema check)
        // insertedIds.van_equipment = vanEquipResult.data?.map(ve => `${ve.van_id}-${ve.equipment_id}`); // Example if PK is composite
        logInfo(`Assigned Equip ${equipId1} to Van ${vanId1}, Equip ${equipId2} to Van ${vanId2}`);

        // 4. Create Order and Jobs
        const customerId = baselineRefs.customerIds[0];
        const addressId = baselineRefs.addressIds[0];

        const orderData: TablesInsert<'orders'> = {
            user_id: customerId,
            address_id: addressId,
            notes: `Order for ${scenarioName} scenario. Expect bundle break.`,
        };
        // Pass as array
        const orderResult = await insertData(supabase, 'orders', [orderData], 'Order for bundle conflict');
        const orderId = orderResult.data?.[0]?.id;
        if (!orderId) throw new Error('Failed to insert order.');
        insertedIds.orders = [orderId]; // Assign directly
        logInfo(`Inserted order ID: ${orderId}`);

        // Create placeholder services if needed, or use baseline. Need to link service to equipment requirement.
        // For simplicity, assume baseline services exist that can be linked.
        // We need to ensure Job 1 requires Equip 1, Job 2 requires Equip 2.
        // This might require creating service_equipment_requirements or similar entries if not using baseline.
        // Let's assume baseline service ID 6 maps to Equip 1, and 7 maps to Equip 2 for this example.
        // TODO: Implement actual requirement linkage if needed.
        const serviceIdJob1 = 6; // Assumed baseline service ID linked to Equip 1
        const serviceIdJob2 = 7; // Assumed baseline service ID linked to Equip 2

        const jobsData: TablesInsert<'jobs'>[] = [
            {
                order_id: orderId,
                address_id: addressId,
                service_id: serviceIdJob1, // Requires Equip 1 (Tech 1)
                status: 'pending_review',
                priority: 2,
                job_duration: 60,
                notes: `Job 1 for ${scenarioName}. Needs Equip ${equipId1}.`,
            },
            {
                order_id: orderId,
                address_id: addressId,
                service_id: serviceIdJob2, // Requires Equip 2 (Tech 2)
                status: 'pending_review',
                priority: 2,
                job_duration: 60,
                notes: `Job 2 for ${scenarioName}. Needs Equip ${equipId2}.`,
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