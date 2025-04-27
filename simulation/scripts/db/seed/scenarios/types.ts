/**
 * Defines the structure for baseline data references passed to scenario scripts.
 * Contains IDs of key entities created during baseline seeding.
 */
export interface BaselineRefs {
  addressIds: number[];
  customerIds: string[]; // Assuming UUIDs from auth.users
  technicianIds: string[]; // Assuming UUIDs from auth.users
  vanIds: number[];
  equipmentIds: number[];
  serviceIds: number[];
  ymmRefIds: number[];
  customerVehicleIds: number[];
  // Add other relevant baseline IDs as needed
}

/**
 * Defines the structure for metadata returned by individual scenario scripts.
 * Contains IDs of records created specifically within that scenario for test verification.
 * This is a base interface; specific scenarios might extend it or use a more specific type.
 */
export interface ScenarioMetadataUpdate {
  // Example: If a scenario creates specific jobs or orders
  // createdOrderIds?: number[];
  // createdJobIds?: number[];
  [key: string]: any; // Allows for flexible scenario-specific data
}

// Add any other shared helper types needed by multiple scenario scripts below 