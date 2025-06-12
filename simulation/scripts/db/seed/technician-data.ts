import { faker } from '@faker-js/faker';
// Import Supabase generated types and helpers
import type { Tables, TablesInsert } from './staged.database.types';

// --- Local Type Definitions for Seeding ---
// Define Auth user structure specifically for seeding
interface AuthUserSeedData {
  id: string;
  email: string;
  password?: string;
}

// Use TablesInsert helper for data arrays to match DB schema
type PublicUserSeedData = TablesInsert<'users'>;
type TechnicianSeedData = TablesInsert<'technicians'>;
type VanSeedData = TablesInsert<'vans'>;

// --- Technician Data Definitions ---

// Technician specific auth user data definitions
export const technicianAuthUsersData: AuthUserSeedData[] = [
  // Tech One
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'tech1@example.com',
    password: 'password123',
  },
  // Tech Two
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'tech2@example.com',
    password: 'password123',
  },
  // Tech Three
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'tech3@example.com',
    password: 'password123',
  },
  // Tech Four
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'tech4@example.com',
    password: 'password123',
  },
];

// Technician specific public user profile data definitions
export const technicianPublicUsersData: PublicUserSeedData[] = [
  // Tech One
  {
    id: '00000000-0000-0000-0000-000000000001', // Matches Auth User
    full_name: 'Tech One',
    phone: '403-100-0001',
    home_address_id: 1, // Use new address ID
    is_admin: true,
    customer_type: 'residential', // Although tech, type needed by table
  },
  // Tech Two
  {
    id: '00000000-0000-0000-0000-000000000002', // Matches Auth User
    full_name: 'Tech Two',
    phone: '403-100-0002',
    home_address_id: 2, // Use new address ID
    is_admin: true,
    customer_type: 'residential',
  },
  // Tech Three
  {
    id: '00000000-0000-0000-0000-000000000003', // Matches Auth User
    full_name: 'Tech Three',
    phone: '403-100-0003',
    home_address_id: 3, // Use new address ID
    is_admin: true,
    customer_type: 'residential',
  },
  // Tech Four
  {
    id: '00000000-0000-0000-0000-000000000004', // Matches Auth User
    full_name: 'Tech Four',
    phone: '403-100-0004',
    home_address_id: 4, // Use new address ID
    is_admin: true,
    customer_type: 'residential',
  },
];

// Technician specific technician table data definitions
export const technicianTechniciansData: TechnicianSeedData[] = [
  // Tech One
  {
    user_id: '00000000-0000-0000-0000-000000000001', // Matches Auth/Public User
    assigned_van_id: 1, // Initial placeholder, reassigned in seeding logic
    workload: 100,
  },
  // Tech Two
  {
    user_id: '00000000-0000-0000-0000-000000000002',
    assigned_van_id: 2,
    workload: 100,
  },
  // Tech Three
  {
    user_id: '00000000-0000-0000-0000-000000000003',
    assigned_van_id: 3,
    workload: 80, // Example variation
  },
  // Tech Four
  {
    user_id: '00000000-0000-0000-0000-000000000004',
    assigned_van_id: 4,
    workload: 100,
  },
];

// Van data definitions (needed for technician assignment)
export const technicianVansData: VanSeedData[] = [
  {
    id: 1, // Used for assigned_van_id in techniciansData and logic
    vin: faker.vehicle.vin() + '1', // Reverted
    onestepgps_device_id: 'VAN001', // Reverted
    lat: 51.0447, // Reverted
    lng: -114.0719, // Reverted
    last_service: '2024-01-01', 
    next_service: '2024-07-01', 
  },
  {
    id: 2,
    vin: 'VIN_VAN_2', // Keep updated
    onestepgps_device_id: 'OSGPS_VAN_2', // Keep updated
    lat: 51.057274, // Keep updated address 2 coords
    lng: -114.049297,
    last_service: '2024-01-01',
    next_service: '2024-07-01',
  },
  {
    id: 3,
    vin: faker.vehicle.vin() + '3', // Reverted
    onestepgps_device_id: 'VAN003', // Reverted
    lat: 51.0447, // Reverted
    lng: -114.0719, // Reverted
    last_service: '2024-01-01',
    next_service: '2024-07-01',
  },
  {
    id: 4,
    vin: faker.vehicle.vin() + '4', // Reverted
    onestepgps_device_id: 'VAN004', // Reverted
    lat: 51.0447, // Reverted
    lng: -114.0719, // Reverted
    last_service: '2024-01-01',
    next_service: '2024-07-01',
  },
  // Keep van 5 as is, assuming it's used for >4 tech scenarios
  {
    id: 5,
    vin: faker.vehicle.vin() + '5', 
    onestepgps_device_id: 'VAN005',
    lat: 51.0447, // Keep original or update if needed
    lng: -114.0719,
    last_service: '2024-01-01',
    next_service: '2024-07-01',
  },
];

// Removed the comment about reusing baseline types 