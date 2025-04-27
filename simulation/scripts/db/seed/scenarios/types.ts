import type { Database, Tables, Enums, TablesInsert } from '../../../utils';

/**
 * Defines the structure for baseline data references passed to scenario scripts.
 * Contains IDs of key entities created during baseline seeding.
 */
export interface BaselineRefs {
  customerIds?: string[];
  addressIds?: number[];
  customerVehicleIds?: number[];
  serviceIds?: number[];
  equipmentIds?: number[];
  technicianIds?: string[];
  vanIds?: number[];
  ymmRefIds?: number[];
  companyIds?: number[];
  workingHoursIds?: number[];
  technicianEquipmentIds?: number[];
  technicianServiceAreaIds?: number[];
  // Add other relevant baseline IDs as needed
}

/**
 * Standard structure for metadata returned by individual scenario seed scripts.
 */
export interface ScenarioSeedResult {
  scenarioName: string; // e.g., "base_schedule", "equipment_conflict"
  insertedIds: {
    orders?: number[];
    jobs?: number[];
    equipment?: number[];
    technician_availability_exceptions?: number[];
    // Add other table names (as keys) and ID arrays (as values)
    // relevant to the specific scenario being seeded.
    [tableName: string]: number[] | undefined; // Allow dynamic table names
  };
  // Optional: Add any other relevant scenario-specific metadata if needed
}

/**
 * Represents the metadata updates specific to a scenario run.
 * @deprecated Prefer ScenarioSeedResult for standardization
 */
export interface ScenarioMetadataUpdate {
  createdOrderIds?: number[];
  createdJobIds?: number[];
  createdEquipmentIds?: number[];
  createdTechnicianAvailabilityExceptionIds?: number[];
  // ... other specific IDs
}

// Add any other shared helper types needed by multiple scenario scripts below 