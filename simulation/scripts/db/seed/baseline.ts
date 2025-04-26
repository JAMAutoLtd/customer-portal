import { SupabaseClient } from '@supabase/supabase-js';
// Use the existing generated types for the PUBLIC schema
import { Database, Tables } from './staged.database.types.ts'; // Adjust path if needed
// Import types for the AUTH schema if available separately
// import { Database as AuthDatabase } from '../auth.types.ts'; // Example path

// --- Use Generated Types (Public Schema) ---
type Address = Tables<'addresses'>;
type PublicUser = Tables<'users'>;
type Van = Tables<'vans'>;
type Equipment = Tables<'equipment'>;
type YmmRef = Tables<'ymm_ref'>;
type Service = Tables<'services'>;
type CustomerVehicle = Tables<'customer_vehicles'>;
type Technician = Tables<'technicians'>;
interface RequirementInsertBase {
  ymm_id: number;
  service_id: number;
}
interface AdasRequirementInsert extends RequirementInsertBase {
  equipment_model: string;
}

// --- Define Interface for Auth User Creation Data ---
// Based on supabase.auth.admin.createUser parameters and our seed data
interface AuthUserSeedData {
  id: string; // The UUID from our seed data
  email: string;
  password?: string; // Optional: provide a default password
  // Add other fields like email_confirm: true if needed, depending on Supabase settings
}

// --- Baseline Data Arrays --- (Ensure data matches the generated types or defined interfaces)
const addressesData: Address[] = [
  { id: 1, street_address: '1234 Maple St SW', lat: 51.0301, lng: -114.0719 },
  { id: 2, street_address: '5678 Oak Ave NW', lat: 51.0852, lng: -114.1303 },
  { id: 3, street_address: '9101 Spruce Dr SE', lat: 51.0123, lng: -114.0387 },
  { id: 4, street_address: '2468 Pine Cres NE', lat: 51.0624, lng: -114.0412 },
  { id: 5, street_address: 'Superior Paint & Body Service Ltd, 112 17 Ave SE', lat: 51.0385, lng: -114.0606 },
  { id: 6, street_address: 'Center Street Auto Service, 1005 Centre St North', lat: 51.0641, lng: -114.0620 },
  { id: 7, street_address: 'National Transmission, 402 14 St NW', lat: 51.0537, lng: -114.0934 },
  { id: 8, street_address: 'Southwest Auto Service, 2703 14th St SW', lat: 51.0275, lng: -114.0949 },
  { id: 9, street_address: 'Wolfe Calgary, 1720 Bow Trail SW', lat: 51.0435, lng: -114.0979 },
  { id: 10, street_address: 'Heninger Collision Centre, 3636 Dartmouth Rd SE', lat: 51.0193, lng: -114.0347 },
  { id: 11, street_address: 'KAL Tire North Hill, 1616 14 Ave NW', lat: 51.0644, lng: -114.0956 },
  { id: 12, street_address: 'MacLeod Auto & Truck Repair, 4002 Macleod Trail S', lat: 51.0170, lng: -114.0705 },
  { id: 13, street_address: 'Superior Paint & Autobody Corp., 112 17 Ave SE', lat: 51.0385, lng: -114.0606 },
  { id: 14, street_address: 'CARSTAR Calgary Downtown, 1407 9 Ave SW', lat: 51.0452, lng: -114.0925 },
  { id: 15, street_address: 'Heninger Toyota, 3640 Macleod Tr S', lat: 51.0175, lng: -114.0717 },
  { id: 16, street_address: 'S O S Paint & Body Shop Ltd., 3648 Burnsland Rd SE', lat: 51.0198, lng: -114.0341 },
  { id: 17, street_address: 'CARSTAR Burnsland RD, 3648 Burnsland Road SE', lat: 51.0198, lng: -114.0341 },
  { id: 18, street_address: 'Macleod Trail Auto Body Ltd, 319 38 A Avenue SE', lat: 51.0150, lng: -114.0595 },
  { id: 19, street_address: 'Road Runner Motors, 2A 4015 1 St SE', lat: 51.0162, lng: -114.0584 },
  { id: 20, street_address: 'Stevo Auto Clinic, 3505 - 16 St. SW', lat: 51.0277, lng: -114.1037 },
  { id: 21, street_address: 'Boyd Autobody & Glass 1 Street SE, 4303 - 1 Street SE', lat: 51.0118, lng: -114.0582 },
  { id: 22, street_address: 'Calgary Body Shop Supplies Ltd. South, 4339B Manhattan Rd SE', lat: 51.0124, lng: -114.0353 },
  { id: 23, street_address: 'Hallmark Auto Body Ltd., 1440 9 Ave SE', lat: 51.0442, lng: -114.0288 },
  { id: 24, street_address: 'Carstar Chinook, 4700 1 St SE', lat: 51.0058, lng: -114.0572 },
  { id: 25, street_address: 'Uber Autobody Ltd., 4603 Manilla Rd SE', lat: 51.0125, lng: -114.0298 },
  { id: 26, street_address: 'Simplicity Car Care Calgary South, 5009 1 St SW', lat: 50.9988, lng: -114.0756 },
  { id: 27, street_address: 'CARSTAR Calgary McKnight, 4413-11th Street NE', lat: 51.0955, lng: -114.0530 },
  { id: 28, street_address: 'Boyd Autobody & Glass 32 St. NE, 3520 - 32 St NE', lat: 51.0838, lng: -113.9802 },
  { id: 29, street_address: 'Boyd Autobody & Glass Crowfoot, 109 - 64 Crowfoot Circle NW', lat: 51.1096, lng: -114.2082 },
  { id: 30, street_address: 'Maaco Calgary, 908 53 Ave. NE, Bays J&K', lat: 51.0678, lng: -114.0492 },
  { id: 31, street_address: 'A-1 Auto Body Ltd., 5304 1a St SE', lat: 50.9911, lng: -114.0594 },
  { id: 32, street_address: 'MP Auto Body Repair, #2, 343 Forge Rd SE', lat: 51.0187, lng: -114.0271 },
  { id: 33, street_address: 'Calgary Auto Body Repairs, 235105 Wrangler Dr #29, Rocky View County', lat: 51.0736, lng: -113.9039 },
  { id: 34, street_address: 'CARSTAR Calgary Heritage, 4215 12 St NE', lat: 51.0889, lng: -114.0409 },
  { id: 35, street_address: 'Fix Auto Calgary North, 222 61 Ave SE', lat: 50.9982, lng: -114.0623 },
  { id: 36, street_address: 'Fix Auto Deerfoot, 816 41 Ave NE', lat: 51.0831, lng: -114.0409 },
  { id: 37, street_address: 'CSN Collision, 233 Forge Rd SE', lat: 51.0171, lng: -114.0272 },
  { id: 38, street_address: 'Horton Auto Body & Paint, 3804 Edmonton Trail NE', lat: 51.0836, lng: -114.0448 },
  { id: 39, street_address: 'Fix Auto Calgary South Central, 4045 106 Ave SE', lat: 50.9681, lng: -113.9655 },
  { id: 40, street_address: 'Concours Collision Centre, 3602 21 St NE', lat: 51.0841, lng: -114.0086 },
  { id: 41, street_address: 'Calgary Coachworks, 3810 3a St NE', lat: 51.0805, lng: -114.0497 },
  { id: 42, street_address: 'Speedy Collision, 7725 44 St SE #103', lat: 50.9761, lng: -113.9497 },
  { id: 43, street_address: 'National Collision Centre, 3801 1 St NE', lat: 51.0780, lng: -114.0580 },
  { id: 44, street_address: 'Minute Muffler & Brake with Autobody, 4220 17 Ave SE', lat: 51.0391, lng: -113.9691 },
  { id: 45, street_address: 'Calgary Collision Centre, 1635 32 Ave NE', lat: 51.0842, lng: -114.0335 },
  { id: 46, street_address: 'Dent Clinic, 3015 5 Ave NE', lat: 51.0649, lng: -114.0132 },
  { id: 47, street_address: 'Prestige Auto Body, 2125 32 Ave NE #108', lat: 51.0830, lng: -114.0236 },
  { id: 48, street_address: 'Ultimate Auto Body Ltd., 3434 48 Ave SE', lat: 50.9893, lng: -113.9952 },
  { id: 49, street_address: 'Varsity Auto Body, 4101 19 St NE', lat: 51.0914, lng: -114.0227 },
  { id: 50, street_address: 'Valley Collision Ltd., 3221 9 St SE', lat: 51.0279, lng: -114.0416 },
  { id: 51, street_address: 'Advantage Collision, 2307 52 Ave SE #6', lat: 50.9909, lng: -114.0269 },
  { id: 52, street_address: 'Procolor Collision Calgary Sunridge, 3020 26 St NE Unit #119', lat: 51.0775, lng: -113.9944 },
  { id: 53, street_address: 'All Makes Auto Repair & Collision, 219 41 Ave NE', lat: 51.0841, lng: -114.0580 },
  { id: 54, street_address: "Pirani's Auto Service & Autobody, 6900 46 St SE #101", lat: 50.9832, lng: -113.9583 },
];

// Update authUsersData to match AuthUserSeedData
const authUsersData: AuthUserSeedData[] = [
  { id: '00000000-0000-0000-0000-000000000001', email: 'tech1@example.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000002', email: 'tech2@example.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000003', email: 'tech3@example.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000004', email: 'tech4@example.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000101', email: 'customer1@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000102', email: 'customer2@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000103', email: 'customer3@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000104', email: 'customer4@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000105', email: 'customer5@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000106', email: 'customer6@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000107', email: 'customer7@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000108', email: 'customer8@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000109', email: 'customer9@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000110', email: 'customer10@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000111', email: 'customer11@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000112', email: 'customer12@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000113', email: 'customer13@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000114', email: 'customer14@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000115', email: 'customer15@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000116', email: 'customer16@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000117', email: 'customer17@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000118', email: 'customer18@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000119', email: 'customer19@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000120', email: 'customer20@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000121', email: 'customer21@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000122', email: 'customer22@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000123', email: 'customer23@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000124', email: 'customer24@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000125', email: 'customer25@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000126', email: 'customer26@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000127', email: 'customer27@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000128', email: 'customer28@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000129', email: 'customer29@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000130', email: 'customer30@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000131', email: 'customer31@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000132', email: 'customer32@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000133', email: 'customer33@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000134', email: 'customer34@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000135', email: 'customer35@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000136', email: 'customer36@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000137', email: 'customer37@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000138', email: 'customer38@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000139', email: 'customer39@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000140', email: 'customer40@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000141', email: 'customer41@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000142', email: 'customer42@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000143', email: 'customer43@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000144', email: 'customer44@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000145', email: 'customer45@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000146', email: 'customer46@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000147', email: 'customer47@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000148', email: 'customer48@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000149', email: 'customer49@shop.com', password: 'password123' },
  { id: '00000000-0000-0000-0000-000000000150', email: 'customer50@shop.com', password: 'password123' },
];

const publicUsersData: PublicUser[] = [
  // Technicians (will be filtered)
  { id: '00000000-0000-0000-0000-000000000001', full_name: 'Tech One', phone: '403-100-0001', home_address_id: 1, is_admin: true, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000002', full_name: 'Tech Two', phone: '403-100-0002', home_address_id: 2, is_admin: true, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000003', full_name: 'Tech Three', phone: '403-100-0003', home_address_id: 3, is_admin: true, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000004', full_name: 'Tech Four', phone: '403-100-0004', home_address_id: 4, is_admin: true, customer_type: 'residential' },
  // Customers
  { id: '00000000-0000-0000-0000-000000000101', full_name: 'Superior Paint & Body Service Ltd', phone: '403-200-0101', home_address_id: 5, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000102', full_name: 'Center Street Auto Service', phone: '403-200-0102', home_address_id: 6, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000103', full_name: 'National Transmission', phone: '403-200-0103', home_address_id: 7, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000104', full_name: 'Southwest Auto Service', phone: '403-200-0104', home_address_id: 8, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000105', full_name: 'Wolfe Calgary', phone: '403-200-0105', home_address_id: 9, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000106', full_name: 'Heninger Collision Centre', phone: '403-200-0106', home_address_id: 10, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000107', full_name: 'KAL Tire North Hill', phone: '403-200-0107', home_address_id: 11, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000108', full_name: 'MacLeod Auto & Truck Repair', phone: '403-200-0108', home_address_id: 12, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000109', full_name: 'Superior Paint & Autobody Corp.', phone: '403-200-0109', home_address_id: 13, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000110', full_name: 'CARSTAR Calgary Downtown', phone: '403-200-0110', home_address_id: 14, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000111', full_name: 'Heninger Toyota', phone: '403-200-0111', home_address_id: 15, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000112', full_name: 'S O S Paint & Body Shop Ltd.', phone: '403-200-0112', home_address_id: 16, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000113', full_name: 'CARSTAR Burnsland RD', phone: '403-200-0113', home_address_id: 17, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000114', full_name: 'Macleod Trail Auto Body Ltd', phone: '403-200-0114', home_address_id: 18, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000115', full_name: 'Road Runner Motors', phone: '403-200-0115', home_address_id: 19, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000116', full_name: 'Stevo Auto Clinic', phone: '403-200-0116', home_address_id: 20, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000117', full_name: 'Boyd Autobody & Glass 1 Street SE', phone: '403-200-0117', home_address_id: 21, is_admin: false, customer_type: 'residential' },
  { id: '00000000-0000-0000-0000-000000000118', full_name: 'Calgary Body Shop Supplies Ltd. South', phone: '403-200-0118', home_address_id: 22, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000119', full_name: 'Hallmark Auto Body Ltd.', phone: '403-200-0119', home_address_id: 23, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000120', full_name: 'Carstar Chinook', phone: '403-200-0120', home_address_id: 24, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000121', full_name: 'Uber Autobody Ltd.', phone: '403-200-0121', home_address_id: 25, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000122', full_name: 'Simplicity Car Care Calgary South', phone: '403-200-0122', home_address_id: 26, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000123', full_name: 'CARSTAR Calgary McKnight', phone: '403-200-0123', home_address_id: 27, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000124', full_name: 'Boyd Autobody & Glass 32 St. NE', phone: '403-200-0124', home_address_id: 28, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000125', full_name: 'Boyd Autobody & Glass Crowfoot', phone: '403-200-0125', home_address_id: 29, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000126', full_name: 'Maaco Calgary', phone: '403-200-0126', home_address_id: 30, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000127', full_name: 'A-1 Auto Body Ltd.', phone: '403-200-0127', home_address_id: 31, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000128', full_name: 'MP Auto Body Repair', phone: '403-200-0128', home_address_id: 32, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000129', full_name: 'Calgary Auto Body Repairs', phone: '403-200-0129', home_address_id: 33, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000130', full_name: 'CARSTAR Calgary Heritage', phone: '403-200-0130', home_address_id: 34, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000131', full_name: 'Fix Auto Calgary North', phone: '403-200-0131', home_address_id: 35, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000132', full_name: 'Fix Auto Deerfoot', phone: '403-200-0132', home_address_id: 36, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000133', full_name: 'CSN Collision', phone: '403-200-0133', home_address_id: 37, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000134', full_name: 'Horton Auto Body & Paint', phone: '403-200-0134', home_address_id: 38, is_admin: false, customer_type: 'commercial' },
  { id: '00000000-0000-0000-0000-000000000135', full_name: 'Fix Auto Calgary South Central', phone: '403-200-0135', home_address_id: 39, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000136', full_name: 'Concours Collision Centre', phone: '403-200-0136', home_address_id: 40, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000137', full_name: 'Calgary Coachworks', phone: '403-200-0137', home_address_id: 41, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000138', full_name: 'Speedy Collision', phone: '403-200-0138', home_address_id: 42, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000139', full_name: 'National Collision Centre', phone: '403-200-0139', home_address_id: 43, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000140', full_name: 'Minute Muffler & Brake with Autobody', phone: '403-200-0140', home_address_id: 44, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000141', full_name: 'Calgary Collision Centre', phone: '403-200-0141', home_address_id: 45, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000142', full_name: 'Dent Clinic', phone: '403-200-0142', home_address_id: 46, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000143', full_name: 'Prestige Auto Body', phone: '403-200-0143', home_address_id: 47, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000144', full_name: 'Ultimate Auto Body Ltd.', phone: '403-200-0144', home_address_id: 48, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000145', full_name: 'Varsity Auto Body', phone: '403-200-0145', home_address_id: 49, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000146', full_name: 'Valley Collision Ltd.', phone: '403-200-0146', home_address_id: 50, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000147', full_name: 'Advantage Collision', phone: '403-200-0147', home_address_id: 51, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000148', full_name: 'Procolor Collision Calgary Sunridge', phone: '403-200-0148', home_address_id: 52, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000149', full_name: 'All Makes Auto Repair & Collision', phone: '403-200-0149', home_address_id: 53, is_admin: false, customer_type: 'insurance' },
  { id: '00000000-0000-0000-0000-000000000150', full_name: "Pirani's Auto Service & Autobody", phone: '403-200-0150', home_address_id: 54, is_admin: false, customer_type: 'insurance' },
];

const vansData: Van[] = [
  { id: 1, last_service: '2024-01-01', next_service: '2024-07-01', vin: 'VIN_VAN_1', lat: 51.0301, lng: -114.0719 },
  { id: 2, last_service: '2024-01-01', next_service: '2024-07-01', vin: 'VIN_VAN_2', lat: 51.0852, lng: -114.1303 },
  { id: 3, last_service: '2024-01-01', next_service: '2024-07-01', vin: 'VIN_VAN_3', lat: 51.0123, lng: -114.0387 },
  { id: 4, last_service: '2024-01-01', next_service: '2024-07-01', vin: 'VIN_VAN_4', lat: 51.0624, lng: -114.0412 },
];

const equipmentData: Equipment[] = [
  { id: 5, model: 'airbag', equipment_type: 'airbag' },
  { id: 6, model: 'diag', equipment_type: 'diag' },
  { id: 7, model: 'immo', equipment_type: 'immo' },
  { id: 8, model: 'prog', equipment_type: 'prog' },
  { id: 9, model: 'AUTEL-CSC0602/01', equipment_type: 'adas' },
  { id: 10, model: 'AUTEL-CSC0806/01', equipment_type: 'adas' },
  { id: 11, model: 'AUTEL-CSC0605/01', equipment_type: 'adas' },
  { id: 12, model: 'AUTEL-CSC0601/01', equipment_type: 'adas' },
  { id: 13, model: 'AUTEL-CSC0601/15', equipment_type: 'adas' },
  { id: 14, model: 'AUTEL-CSC0601/08', equipment_type: 'adas' },
  { id: 15, model: 'AUTEL-CSC0601/07', equipment_type: 'adas' },
  { id: 16, model: 'AUTEL-CSC0601/14', equipment_type: 'adas' },
  { id: 17, model: 'AUTEL-CSC0601/03', equipment_type: 'adas' },
  { id: 18, model: 'AUTEL-CSC1004/10', equipment_type: 'adas' },
  { id: 19, model: 'AUTEL-CSC0601/24/01', equipment_type: 'adas' },
  { id: 20, model: 'AUTEL-CSC1004/02', equipment_type: 'adas' },
  { id: 21, model: 'AUTEL-CSC0601/11', equipment_type: 'adas' },
  { id: 22, model: 'AUTEL-CSC0601/06', equipment_type: 'adas' },
  { id: 23, model: 'AUTEL-CSC0601/25', equipment_type: 'adas' },
  { id: 24, model: 'AUTEL-CSC0601/13', equipment_type: 'adas' },
  { id: 25, model: 'AUTEL-CSC1004/03', equipment_type: 'adas' },
  { id: 26, model: 'AUTEL-CSC0802', equipment_type: 'adas' },
  { id: 27, model: 'AUTEL-CSC0602/08', equipment_type: 'adas' },
  { id: 28, model: 'AUTEL-CSC0601/02', equipment_type: 'adas' },
  { id: 29, model: 'AUTEL-CSC0601/17', equipment_type: 'adas' },
  { id: 30, model: 'AUTEL-CSC0611/03', equipment_type: 'adas' },
  { id: 31, model: 'AUTEL-CSC0601/11/01', equipment_type: 'adas' },
  { id: 32, model: 'AUTEL-CSC1014/17', equipment_type: 'adas' },
  { id: 33, model: 'AUTEL-CSC0602/02', equipment_type: 'adas' },
  { id: 34, model: 'AUTEL-CSC0601/22', equipment_type: 'adas' },
  { id: 35, model: 'AUTEL-CSC0611/07', equipment_type: 'adas' },
  { id: 36, model: 'AUTEL-CSC0611/05', equipment_type: 'adas' },
  { id: 37, model: 'AUTEL-CSC0601/12', equipment_type: 'adas' },
  { id: 38, model: 'AUTEL-CSC0800', equipment_type: 'adas' },
];

const ymmRefData: YmmRef[] = [
  { ymm_id: 6062, year: 2015, make: 'AUDI', model: 'Q5' },
  { ymm_id: 6977, year: 2017, make: 'HONDA', model: 'Odyssey' },
  { ymm_id: 8034, year: 2020, make: 'AUDI', model: 'A6' },
  { ymm_id: 7970, year: 2019, make: 'TOYOTA', model: 'Avalon' },
  { ymm_id: 8456, year: 2021, make: 'AUDI', model: 'A7' },
  { ymm_id: 4326, year: 2010, make: 'AUDI', model: 'Q7' },
  { ymm_id: 4321, year: 2010, make: 'AUDI', model: 'A5' },
  { ymm_id: 6373, year: 2015, make: 'SUBARU', model: 'WRX' },
  { ymm_id: 9719, year: 2023, make: 'VOLKSWAGEN', model: 'Other' },
  { ymm_id: 4976, year: 2012, make: 'AUDI', model: 'A4' },
  { ymm_id: 8834, year: 2021, make: 'VOLKSWAGEN', model: 'Golf' },
  { ymm_id: 9082, year: 2022, make: 'HYUNDAI', model: 'Venue' },
  { ymm_id: 1062, year: 2025, make: 'VOLKSWAGEN', model: 'Taos' },
  { ymm_id: 8058, year: 2020, make: 'AUDI', model: 'TT' },
  { ymm_id: 7984, year: 2019, make: 'TOYOTA', model: 'RAV4' },
  { ymm_id: 6983, year: 2017, make: 'HYUNDAI', model: 'Elantra' },
  { ymm_id: 6431, year: 2016, make: 'ACURA', model: 'TLX' },
  { ymm_id: 9257, year: 2022, make: 'TOYOTA', model: 'Mirai' },
  { ymm_id: 7159, year: 2017, make: 'TOYOTA', model: 'Other' },
  { ymm_id: 8869, year: 2022, make: 'AUDI', model: 'A5' },
  { ymm_id: 6030, year: 2014, make: 'VOLKSWAGEN', model: 'Other' },
  { ymm_id: 1057, year: 2025, make: 'SUBARU', model: 'Legacy' },
  { ymm_id: 8228, year: 2020, make: 'HYUNDAI', model: 'Venue' },
  { ymm_id: 9720, year: 2023, make: 'VOLKSWAGEN', model: 'Taos' },
  { ymm_id: 9238, year: 2022, make: 'SUBARU', model: 'Other' },
  { ymm_id: 5998, year: 2014, make: 'TOYOTA', model: 'Camry' },
  { ymm_id: 6010, year: 2014, make: 'TOYOTA', model: 'Prius V' },
  { ymm_id: 4470, year: 2010, make: 'INFINITI', model: 'Other' },
  { ymm_id: 6445, year: 2016, make: 'AUDI', model: 'R8' },
  { ymm_id: 7181, year: 2017, make: 'VOLKSWAGEN', model: 'Other' },
  { ymm_id: 6986, year: 2017, make: 'HYUNDAI', model: 'Other' },
  { ymm_id: 8630, year: 2021, make: 'HONDA', model: 'Odyssey' },
  { ymm_id: 8217, year: 2020, make: 'HYUNDAI', model: 'Ioniq' },
  { ymm_id: 9283, year: 2022, make: 'VOLVO', model: 'C40' },
  { ymm_id: 7112, year: 2017, make: 'NISSAN', model: 'Rogue' },
  { ymm_id: 4599, year: 2010, make: 'TOYOTA', model: 'Prius' },
  { ymm_id: 4851, year: 2011, make: 'MAZDA', model: 'CX-9' },
  { ymm_id: 7890, year: 2019, make: 'MAZDA', model: 'Mazda3' },
  { ymm_id: 5252, year: 2012, make: 'SUBARU', model: 'Impreza' },
  { ymm_id: 7500, year: 2018, make: 'MITSUBISHI', model: 'Other' },
  { ymm_id: 9688, year: 2023, make: 'TOYOTA', model: 'Corolla' },
  { ymm_id: 4616, year: 2010, make: 'VOLKSWAGEN', model: 'Other' },
  { ymm_id: 7061, year: 2017, make: 'MASERATI', model: 'Other' },
  { ymm_id: 9668, year: 2023, make: 'SUBARU', model: 'Ascent' },
  { ymm_id: 8803, year: 2021, make: 'TESLA', model: 'Model 3' },
];

const servicesData: Service[] = [
  { id: 1, service_name: 'Front Radar', service_category: 'adas', slug: 'front-radar' },
  { id: 2, service_name: 'Windshield Camera', service_category: 'adas', slug: 'windshield-camera' },
  { id: 3, service_name: '360 Camera or Side Mirror', service_category: 'adas', slug: '360-camera-side-mirror' },
  { id: 4, service_name: 'Blind Spot Monitor', service_category: 'adas', slug: 'blind-spot-monitor' },
  { id: 5, service_name: 'Parking Assist Sensor', service_category: 'adas', slug: 'parking-assist-sensor' },
  { id: 6, service_name: 'ECM', service_category: 'prog', slug: 'ecm' },
  { id: 7, service_name: 'TCM', service_category: 'prog', slug: 'tcm' },
  { id: 8, service_name: 'BCM', service_category: 'prog', slug: 'bcm' },
  { id: 9, service_name: 'Airbag Module Reset', service_category: 'airbag', slug: 'airbag-module-reset' },
  { id: 10, service_name: 'Instrument Cluster', service_category: 'prog', slug: 'instrument-cluster' },
  { id: 14, service_name: 'Headlamp Module', service_category: 'prog', slug: 'headlamp-module' },
  { id: 15, service_name: 'Other', service_category: 'prog', slug: 'other-prog' },
  { id: 16, service_name: 'Immobilizer R&R', service_category: 'immo', slug: 'immobilizer-rr' },
  { id: 17, service_name: 'All Keys Lost', service_category: 'immo', slug: 'all-keys-lost' },
  { id: 18, service_name: 'Adding Spare Keys', service_category: 'immo', slug: 'adding-spare-keys' },
  { id: 19, service_name: 'Diagnostic or Wiring', service_category: 'diag', slug: 'diagnostic-wiring' },
];

const customerVehiclesData: CustomerVehicle[] = [
  { id: 1, vin: 'VIN60620000000000', make: 'AUDI', model: 'Q5', year: 2015 },
  { id: 2, vin: 'VIN69770000000000', make: 'HONDA', model: 'Odyssey', year: 2017 },
  { id: 3, vin: 'VIN80340000000000', make: 'AUDI', model: 'A6', year: 2020 },
  { id: 4, vin: 'VIN79700000000000', make: 'TOYOTA', model: 'Avalon', year: 2019 },
  { id: 5, vin: 'VIN84560000000000', make: 'AUDI', model: 'A7', year: 2021 },
  { id: 6, vin: 'VIN43260000000000', make: 'AUDI', model: 'Q7', year: 2010 },
  { id: 7, vin: 'VIN43210000000000', make: 'AUDI', model: 'A5', year: 2010 },
  { id: 8, vin: 'VIN63730000000000', make: 'SUBARU', model: 'WRX', year: 2015 },
  { id: 9, vin: 'VIN97190000000000', make: 'VOLKSWAGEN', model: 'Other', year: 2023 },
  { id: 10, vin: 'VIN49760000000000', make: 'AUDI', model: 'A4', year: 2012 },
  { id: 11, vin: 'VIN88340000000000', make: 'VOLKSWAGEN', model: 'Golf', year: 2021 },
  { id: 12, vin: 'VIN90820000000000', make: 'HYUNDAI', model: 'Venue', year: 2022 },
  { id: 13, vin: 'VIN10620000000000', make: 'VOLKSWAGEN', model: 'Taos', year: 2025 },
  { id: 14, vin: 'VIN80580000000000', make: 'AUDI', model: 'TT', year: 2020 },
  { id: 15, vin: 'VIN79840000000000', make: 'TOYOTA', model: 'RAV4', year: 2019 },
  { id: 16, vin: 'VIN69830000000000', make: 'HYUNDAI', model: 'Elantra', year: 2017 },
  { id: 17, vin: 'VIN64310000000000', make: 'ACURA', model: 'TLX', year: 2016 },
  { id: 18, vin: 'VIN92570000000000', make: 'TOYOTA', model: 'Mirai', year: 2022 },
  { id: 19, vin: 'VIN71590000000000', make: 'TOYOTA', model: 'Other', year: 2017 },
  { id: 20, vin: 'VIN88690000000000', make: 'AUDI', model: 'A5', year: 2022 },
  { id: 21, vin: 'VIN60300000000000', make: 'VOLKSWAGEN', model: 'Other', year: 2014 },
  { id: 22, vin: 'VIN10570000000000', make: 'SUBARU', model: 'Legacy', year: 2025 },
  { id: 23, vin: 'VIN82280000000000', make: 'HYUNDAI', model: 'Venue', year: 2020 },
  { id: 24, vin: 'VIN97200000000000', make: 'VOLKSWAGEN', model: 'Taos', year: 2023 },
  { id: 25, vin: 'VIN92380000000000', make: 'SUBARU', model: 'Other', year: 2022 },
  { id: 26, vin: 'VIN59980000000000', make: 'TOYOTA', model: 'Camry', year: 2014 },
  { id: 27, vin: 'VIN60100000000000', make: 'TOYOTA', model: 'Prius V', year: 2014 },
  { id: 28, vin: 'VIN44700000000000', make: 'INFINITI', model: 'Other', year: 2010 },
  { id: 29, vin: 'VIN64450000000000', make: 'AUDI', model: 'R8', year: 2016 },
  { id: 30, vin: 'VIN71810000000000', make: 'VOLKSWAGEN', model: 'Other', year: 2017 },
  { id: 31, vin: 'VIN69860000000000', make: 'HYUNDAI', model: 'Other', year: 2017 },
  { id: 32, vin: 'VIN86300000000000', make: 'HONDA', model: 'Odyssey', year: 2021 },
  { id: 33, vin: 'VIN82170000000000', make: 'HYUNDAI', model: 'Ioniq', year: 2020 },
  { id: 34, vin: 'VIN92830000000000', make: 'VOLVO', model: 'C40', year: 2022 },
  { id: 35, vin: 'VIN71120000000000', make: 'NISSAN', model: 'Rogue', year: 2017 },
  { id: 36, vin: 'VIN45990000000000', make: 'TOYOTA', model: 'Prius', year: 2010 },
  { id: 37, vin: 'VIN48510000000000', make: 'MAZDA', model: 'CX-9', year: 2011 },
  { id: 38, vin: 'VIN78900000000000', make: 'MAZDA', model: 'Mazda3', year: 2019 },
  { id: 39, vin: 'VIN52520000000000', make: 'SUBARU', model: 'Impreza', year: 2012 },
  { id: 40, vin: 'VIN75000000000000', make: 'MITSUBISHI', model: 'Other', year: 2018 },
  { id: 41, vin: 'VIN96880000000000', make: 'TOYOTA', model: 'Corolla', year: 2023 },
  { id: 42, vin: 'VIN46160000000000', make: 'VOLKSWAGEN', model: 'Other', year: 2010 },
  { id: 43, vin: 'VIN70610000000000', make: 'MASERATI', model: 'Other', year: 2017 },
  { id: 44, vin: 'VIN96680000000000', make: 'SUBARU', model: 'Ascent', year: 2023 },
  { id: 45, vin: 'VIN88030000000000', make: 'TESLA', model: 'Model 3', year: 2021 },
];

const techniciansData: Technician[] = [
  { id: 1, user_id: '00000000-0000-0000-0000-000000000001', assigned_van_id: 1, workload: 100 },
  { id: 2, user_id: '00000000-0000-0000-0000-000000000002', assigned_van_id: 2, workload: 100 },
  { id: 3, user_id: '00000000-0000-0000-0000-000000000003', assigned_van_id: 3, workload: 80 },
  { id: 4, user_id: '00000000-0000-0000-0000-000000000004', assigned_van_id: 4, workload: 100 },
];

const diagRequirementsData: RequirementInsertBase[] = [
  { ymm_id: 6062, service_id: 19 },
  { ymm_id: 6977, service_id: 19 },
  { ymm_id: 8034, service_id: 19 },
  { ymm_id: 7970, service_id: 19 },
  { ymm_id: 8456, service_id: 19 },
  { ymm_id: 4326, service_id: 19 },
  { ymm_id: 4321, service_id: 19 },
  { ymm_id: 6373, service_id: 19 },
  { ymm_id: 9719, service_id: 19 },
  { ymm_id: 4976, service_id: 19 },
  { ymm_id: 8834, service_id: 19 },
  { ymm_id: 9082, service_id: 19 },
  { ymm_id: 1062, service_id: 19 },
  { ymm_id: 8058, service_id: 19 },
  { ymm_id: 7984, service_id: 19 },
  { ymm_id: 6983, service_id: 19 },
  { ymm_id: 6431, service_id: 19 },
  { ymm_id: 9257, service_id: 19 },
  { ymm_id: 7159, service_id: 19 },
  { ymm_id: 8869, service_id: 19 },
  { ymm_id: 6030, service_id: 19 },
  { ymm_id: 1057, service_id: 19 },
  { ymm_id: 8228, service_id: 19 },
  { ymm_id: 9720, service_id: 19 },
  { ymm_id: 9238, service_id: 19 },
  { ymm_id: 5998, service_id: 19 },
  { ymm_id: 6010, service_id: 19 },
  { ymm_id: 4470, service_id: 19 },
  { ymm_id: 6445, service_id: 19 },
  { ymm_id: 7181, service_id: 19 },
  { ymm_id: 6986, service_id: 19 },
  { ymm_id: 8630, service_id: 19 },
  { ymm_id: 8217, service_id: 19 },
  { ymm_id: 9283, service_id: 19 },
  { ymm_id: 7112, service_id: 19 },
  { ymm_id: 4599, service_id: 19 },
  { ymm_id: 4851, service_id: 19 },
  { ymm_id: 7890, service_id: 19 },
  { ymm_id: 5252, service_id: 19 },
  { ymm_id: 7500, service_id: 19 },
  { ymm_id: 9688, service_id: 19 },
  { ymm_id: 4616, service_id: 19 },
  { ymm_id: 7061, service_id: 19 },
  { ymm_id: 9668, service_id: 19 },
  { ymm_id: 8803, service_id: 19 },
];

const immoRequirementsData: RequirementInsertBase[] = [
  { ymm_id: 6062, service_id: 16 }, { ymm_id: 6062, service_id: 17 }, { ymm_id: 6062, service_id: 18 },
  { ymm_id: 6977, service_id: 16 }, { ymm_id: 6977, service_id: 17 }, { ymm_id: 6977, service_id: 18 },
  { ymm_id: 8034, service_id: 16 }, { ymm_id: 8034, service_id: 17 }, { ymm_id: 8034, service_id: 18 },
  { ymm_id: 7970, service_id: 16 }, { ymm_id: 7970, service_id: 17 }, { ymm_id: 7970, service_id: 18 },
  { ymm_id: 8456, service_id: 16 }, { ymm_id: 8456, service_id: 17 }, { ymm_id: 8456, service_id: 18 },
  { ymm_id: 4326, service_id: 16 }, { ymm_id: 4326, service_id: 17 }, { ymm_id: 4326, service_id: 18 },
  { ymm_id: 4321, service_id: 16 }, { ymm_id: 4321, service_id: 17 }, { ymm_id: 4321, service_id: 18 },
  { ymm_id: 6373, service_id: 16 }, { ymm_id: 6373, service_id: 17 }, { ymm_id: 6373, service_id: 18 },
  { ymm_id: 9719, service_id: 16 }, { ymm_id: 9719, service_id: 17 }, { ymm_id: 9719, service_id: 18 },
  { ymm_id: 4976, service_id: 16 }, { ymm_id: 4976, service_id: 17 }, { ymm_id: 4976, service_id: 18 },
  { ymm_id: 8834, service_id: 16 }, { ymm_id: 8834, service_id: 17 }, { ymm_id: 8834, service_id: 18 },
  { ymm_id: 9082, service_id: 16 }, { ymm_id: 9082, service_id: 17 }, { ymm_id: 9082, service_id: 18 },
  { ymm_id: 1062, service_id: 16 }, { ymm_id: 1062, service_id: 17 }, { ymm_id: 1062, service_id: 18 },
  { ymm_id: 8058, service_id: 16 }, { ymm_id: 8058, service_id: 17 }, { ymm_id: 8058, service_id: 18 },
  { ymm_id: 7984, service_id: 16 }, { ymm_id: 7984, service_id: 17 }, { ymm_id: 7984, service_id: 18 },
  { ymm_id: 6983, service_id: 16 }, { ymm_id: 6983, service_id: 17 }, { ymm_id: 6983, service_id: 18 },
  { ymm_id: 6431, service_id: 16 }, { ymm_id: 6431, service_id: 17 }, { ymm_id: 6431, service_id: 18 },
  { ymm_id: 9257, service_id: 16 }, { ymm_id: 9257, service_id: 17 }, { ymm_id: 9257, service_id: 18 },
  { ymm_id: 7159, service_id: 16 }, { ymm_id: 7159, service_id: 17 }, { ymm_id: 7159, service_id: 18 },
  { ymm_id: 8869, service_id: 16 }, { ymm_id: 8869, service_id: 17 }, { ymm_id: 8869, service_id: 18 },
  { ymm_id: 6030, service_id: 16 }, { ymm_id: 6030, service_id: 17 }, { ymm_id: 6030, service_id: 18 },
  { ymm_id: 1057, service_id: 16 }, { ymm_id: 1057, service_id: 17 }, { ymm_id: 1057, service_id: 18 },
  { ymm_id: 8228, service_id: 16 }, { ymm_id: 8228, service_id: 17 }, { ymm_id: 8228, service_id: 18 },
  { ymm_id: 9720, service_id: 16 }, { ymm_id: 9720, service_id: 17 }, { ymm_id: 9720, service_id: 18 },
  { ymm_id: 9238, service_id: 16 }, { ymm_id: 9238, service_id: 17 }, { ymm_id: 9238, service_id: 18 },
  { ymm_id: 5998, service_id: 16 }, { ymm_id: 5998, service_id: 17 }, { ymm_id: 5998, service_id: 18 },
  { ymm_id: 6010, service_id: 16 }, { ymm_id: 6010, service_id: 17 }, { ymm_id: 6010, service_id: 18 },
  { ymm_id: 4470, service_id: 16 }, { ymm_id: 4470, service_id: 17 }, { ymm_id: 4470, service_id: 18 },
  { ymm_id: 6445, service_id: 16 }, { ymm_id: 6445, service_id: 17 }, { ymm_id: 6445, service_id: 18 },
  { ymm_id: 7181, service_id: 16 }, { ymm_id: 7181, service_id: 17 }, { ymm_id: 7181, service_id: 18 },
  { ymm_id: 6986, service_id: 16 }, { ymm_id: 6986, service_id: 17 }, { ymm_id: 6986, service_id: 18 },
  { ymm_id: 8630, service_id: 16 }, { ymm_id: 8630, service_id: 17 }, { ymm_id: 8630, service_id: 18 },
  { ymm_id: 8217, service_id: 16 }, { ymm_id: 8217, service_id: 17 }, { ymm_id: 8217, service_id: 18 },
  { ymm_id: 9283, service_id: 16 }, { ymm_id: 9283, service_id: 17 }, { ymm_id: 9283, service_id: 18 },
  { ymm_id: 7112, service_id: 16 }, { ymm_id: 7112, service_id: 17 }, { ymm_id: 7112, service_id: 18 },
  { ymm_id: 4599, service_id: 16 }, { ymm_id: 4599, service_id: 17 }, { ymm_id: 4599, service_id: 18 },
  { ymm_id: 4851, service_id: 16 }, { ymm_id: 4851, service_id: 17 }, { ymm_id: 4851, service_id: 18 },
  { ymm_id: 7890, service_id: 16 }, { ymm_id: 7890, service_id: 17 }, { ymm_id: 7890, service_id: 18 },
  { ymm_id: 5252, service_id: 16 }, { ymm_id: 5252, service_id: 17 }, { ymm_id: 5252, service_id: 18 },
  { ymm_id: 7500, service_id: 16 }, { ymm_id: 7500, service_id: 17 }, { ymm_id: 7500, service_id: 18 },
  { ymm_id: 9688, service_id: 16 }, { ymm_id: 9688, service_id: 17 }, { ymm_id: 9688, service_id: 18 },
  { ymm_id: 4616, service_id: 16 }, { ymm_id: 4616, service_id: 17 }, { ymm_id: 4616, service_id: 18 },
  { ymm_id: 7061, service_id: 16 }, { ymm_id: 7061, service_id: 17 }, { ymm_id: 7061, service_id: 18 },
  { ymm_id: 9668, service_id: 16 }, { ymm_id: 9668, service_id: 17 }, { ymm_id: 9668, service_id: 18 },
  { ymm_id: 8803, service_id: 16 }, { ymm_id: 8803, service_id: 17 }, { ymm_id: 8803, service_id: 18 },
];

const progRequirementsData: RequirementInsertBase[] = [
  { ymm_id: 6062, service_id: 6 }, { ymm_id: 6062, service_id: 7 }, { ymm_id: 6062, service_id: 8 }, { ymm_id: 6062, service_id: 10 }, { ymm_id: 6062, service_id: 14 }, { ymm_id: 6062, service_id: 15 },
  { ymm_id: 6977, service_id: 6 }, { ymm_id: 6977, service_id: 7 }, { ymm_id: 6977, service_id: 8 }, { ymm_id: 6977, service_id: 10 }, { ymm_id: 6977, service_id: 14 }, { ymm_id: 6977, service_id: 15 },
  { ymm_id: 8034, service_id: 6 }, { ymm_id: 8034, service_id: 7 }, { ymm_id: 8034, service_id: 8 }, { ymm_id: 8034, service_id: 10 }, { ymm_id: 8034, service_id: 14 }, { ymm_id: 8034, service_id: 15 },
  { ymm_id: 7970, service_id: 6 }, { ymm_id: 7970, service_id: 7 }, { ymm_id: 7970, service_id: 8 }, { ymm_id: 7970, service_id: 10 }, { ymm_id: 7970, service_id: 14 }, { ymm_id: 7970, service_id: 15 },
  { ymm_id: 8456, service_id: 6 }, { ymm_id: 8456, service_id: 7 }, { ymm_id: 8456, service_id: 8 }, { ymm_id: 8456, service_id: 10 }, { ymm_id: 8456, service_id: 14 }, { ymm_id: 8456, service_id: 15 },
  { ymm_id: 4326, service_id: 6 }, { ymm_id: 4326, service_id: 7 }, { ymm_id: 4326, service_id: 8 }, { ymm_id: 4326, service_id: 10 }, { ymm_id: 4326, service_id: 14 }, { ymm_id: 4326, service_id: 15 },
  { ymm_id: 4321, service_id: 6 }, { ymm_id: 4321, service_id: 7 }, { ymm_id: 4321, service_id: 8 }, { ymm_id: 4321, service_id: 10 }, { ymm_id: 4321, service_id: 14 }, { ymm_id: 4321, service_id: 15 },
  { ymm_id: 6373, service_id: 6 }, { ymm_id: 6373, service_id: 7 }, { ymm_id: 6373, service_id: 8 }, { ymm_id: 6373, service_id: 10 }, { ymm_id: 6373, service_id: 14 }, { ymm_id: 6373, service_id: 15 },
  { ymm_id: 9719, service_id: 6 }, { ymm_id: 9719, service_id: 7 }, { ymm_id: 9719, service_id: 8 }, { ymm_id: 9719, service_id: 10 }, { ymm_id: 9719, service_id: 14 }, { ymm_id: 9719, service_id: 15 },
  { ymm_id: 4976, service_id: 6 }, { ymm_id: 4976, service_id: 7 }, { ymm_id: 4976, service_id: 8 }, { ymm_id: 4976, service_id: 10 }, { ymm_id: 4976, service_id: 14 }, { ymm_id: 4976, service_id: 15 },
  { ymm_id: 8834, service_id: 6 }, { ymm_id: 8834, service_id: 7 }, { ymm_id: 8834, service_id: 8 }, { ymm_id: 8834, service_id: 10 }, { ymm_id: 8834, service_id: 14 }, { ymm_id: 8834, service_id: 15 },
  { ymm_id: 9082, service_id: 6 }, { ymm_id: 9082, service_id: 7 }, { ymm_id: 9082, service_id: 8 }, { ymm_id: 9082, service_id: 10 }, { ymm_id: 9082, service_id: 14 }, { ymm_id: 9082, service_id: 15 },
  { ymm_id: 1062, service_id: 6 }, { ymm_id: 1062, service_id: 7 }, { ymm_id: 1062, service_id: 8 }, { ymm_id: 1062, service_id: 10 }, { ymm_id: 1062, service_id: 14 }, { ymm_id: 1062, service_id: 15 },
  { ymm_id: 8058, service_id: 6 }, { ymm_id: 8058, service_id: 7 }, { ymm_id: 8058, service_id: 8 }, { ymm_id: 8058, service_id: 10 }, { ymm_id: 8058, service_id: 14 }, { ymm_id: 8058, service_id: 15 },
  { ymm_id: 7984, service_id: 6 }, { ymm_id: 7984, service_id: 7 }, { ymm_id: 7984, service_id: 8 }, { ymm_id: 7984, service_id: 10 }, { ymm_id: 7984, service_id: 14 }, { ymm_id: 7984, service_id: 15 },
  { ymm_id: 6983, service_id: 6 }, { ymm_id: 6983, service_id: 7 }, { ymm_id: 6983, service_id: 8 }, { ymm_id: 6983, service_id: 10 }, { ymm_id: 6983, service_id: 14 }, { ymm_id: 6983, service_id: 15 },
  { ymm_id: 6431, service_id: 6 }, { ymm_id: 6431, service_id: 7 }, { ymm_id: 6431, service_id: 8 }, { ymm_id: 6431, service_id: 10 }, { ymm_id: 6431, service_id: 14 }, { ymm_id: 6431, service_id: 15 },
  { ymm_id: 9257, service_id: 6 }, { ymm_id: 9257, service_id: 7 }, { ymm_id: 9257, service_id: 8 }, { ymm_id: 9257, service_id: 10 }, { ymm_id: 9257, service_id: 14 }, { ymm_id: 9257, service_id: 15 },
  { ymm_id: 7159, service_id: 6 }, { ymm_id: 7159, service_id: 7 }, { ymm_id: 7159, service_id: 8 }, { ymm_id: 7159, service_id: 10 }, { ymm_id: 7159, service_id: 14 }, { ymm_id: 7159, service_id: 15 },
  { ymm_id: 8869, service_id: 6 }, { ymm_id: 8869, service_id: 7 }, { ymm_id: 8869, service_id: 8 }, { ymm_id: 8869, service_id: 10 }, { ymm_id: 8869, service_id: 14 }, { ymm_id: 8869, service_id: 15 },
  { ymm_id: 6030, service_id: 6 }, { ymm_id: 6030, service_id: 7 }, { ymm_id: 6030, service_id: 8 }, { ymm_id: 6030, service_id: 10 }, { ymm_id: 6030, service_id: 14 }, { ymm_id: 6030, service_id: 15 },
  { ymm_id: 1057, service_id: 6 }, { ymm_id: 1057, service_id: 7 }, { ymm_id: 1057, service_id: 8 }, { ymm_id: 1057, service_id: 10 }, { ymm_id: 1057, service_id: 14 }, { ymm_id: 1057, service_id: 15 },
  { ymm_id: 8228, service_id: 6 }, { ymm_id: 8228, service_id: 7 }, { ymm_id: 8228, service_id: 8 }, { ymm_id: 8228, service_id: 10 }, { ymm_id: 8228, service_id: 14 }, { ymm_id: 8228, service_id: 15 },
  { ymm_id: 9720, service_id: 6 }, { ymm_id: 9720, service_id: 7 }, { ymm_id: 9720, service_id: 8 }, { ymm_id: 9720, service_id: 10 }, { ymm_id: 9720, service_id: 14 }, { ymm_id: 9720, service_id: 15 },
  { ymm_id: 9238, service_id: 6 }, { ymm_id: 9238, service_id: 7 }, { ymm_id: 9238, service_id: 8 }, { ymm_id: 9238, service_id: 10 }, { ymm_id: 9238, service_id: 14 }, { ymm_id: 9238, service_id: 15 },
  { ymm_id: 5998, service_id: 6 }, { ymm_id: 5998, service_id: 7 }, { ymm_id: 5998, service_id: 8 }, { ymm_id: 5998, service_id: 10 }, { ymm_id: 5998, service_id: 14 }, { ymm_id: 5998, service_id: 15 },
  { ymm_id: 6010, service_id: 6 }, { ymm_id: 6010, service_id: 7 }, { ymm_id: 6010, service_id: 8 }, { ymm_id: 6010, service_id: 10 }, { ymm_id: 6010, service_id: 14 }, { ymm_id: 6010, service_id: 15 },
  { ymm_id: 4470, service_id: 6 }, { ymm_id: 4470, service_id: 7 }, { ymm_id: 4470, service_id: 8 }, { ymm_id: 4470, service_id: 10 }, { ymm_id: 4470, service_id: 14 }, { ymm_id: 4470, service_id: 15 },
  { ymm_id: 6445, service_id: 6 }, { ymm_id: 6445, service_id: 7 }, { ymm_id: 6445, service_id: 8 }, { ymm_id: 6445, service_id: 10 }, { ymm_id: 6445, service_id: 14 }, { ymm_id: 6445, service_id: 15 },
  { ymm_id: 7181, service_id: 6 }, { ymm_id: 7181, service_id: 7 }, { ymm_id: 7181, service_id: 8 }, { ymm_id: 7181, service_id: 10 }, { ymm_id: 7181, service_id: 14 }, { ymm_id: 7181, service_id: 15 },
  { ymm_id: 6986, service_id: 6 }, { ymm_id: 6986, service_id: 7 }, { ymm_id: 6986, service_id: 8 }, { ymm_id: 6986, service_id: 10 }, { ymm_id: 6986, service_id: 14 }, { ymm_id: 6986, service_id: 15 },
  { ymm_id: 8630, service_id: 6 }, { ymm_id: 8630, service_id: 7 }, { ymm_id: 8630, service_id: 8 }, { ymm_id: 8630, service_id: 10 }, { ymm_id: 8630, service_id: 14 }, { ymm_id: 8630, service_id: 15 },
  { ymm_id: 8217, service_id: 6 }, { ymm_id: 8217, service_id: 7 }, { ymm_id: 8217, service_id: 8 }, { ymm_id: 8217, service_id: 10 }, { ymm_id: 8217, service_id: 14 }, { ymm_id: 8217, service_id: 15 },
  { ymm_id: 9283, service_id: 6 }, { ymm_id: 9283, service_id: 7 }, { ymm_id: 9283, service_id: 8 }, { ymm_id: 9283, service_id: 10 }, { ymm_id: 9283, service_id: 14 }, { ymm_id: 9283, service_id: 15 },
  { ymm_id: 7112, service_id: 6 }, { ymm_id: 7112, service_id: 7 }, { ymm_id: 7112, service_id: 8 }, { ymm_id: 7112, service_id: 10 }, { ymm_id: 7112, service_id: 14 }, { ymm_id: 7112, service_id: 15 },
  { ymm_id: 4599, service_id: 6 }, { ymm_id: 4599, service_id: 7 }, { ymm_id: 4599, service_id: 8 }, { ymm_id: 4599, service_id: 10 }, { ymm_id: 4599, service_id: 14 }, { ymm_id: 4599, service_id: 15 },
  { ymm_id: 4851, service_id: 6 }, { ymm_id: 4851, service_id: 7 }, { ymm_id: 4851, service_id: 8 }, { ymm_id: 4851, service_id: 10 }, { ymm_id: 4851, service_id: 14 }, { ymm_id: 4851, service_id: 15 },
  { ymm_id: 7890, service_id: 6 }, { ymm_id: 7890, service_id: 7 }, { ymm_id: 7890, service_id: 8 }, { ymm_id: 7890, service_id: 10 }, { ymm_id: 7890, service_id: 14 }, { ymm_id: 7890, service_id: 15 },
  { ymm_id: 5252, service_id: 6 }, { ymm_id: 5252, service_id: 7 }, { ymm_id: 5252, service_id: 8 }, { ymm_id: 5252, service_id: 10 }, { ymm_id: 5252, service_id: 14 }, { ymm_id: 5252, service_id: 15 },
  { ymm_id: 7500, service_id: 6 }, { ymm_id: 7500, service_id: 7 }, { ymm_id: 7500, service_id: 8 }, { ymm_id: 7500, service_id: 10 }, { ymm_id: 7500, service_id: 14 }, { ymm_id: 7500, service_id: 15 },
  { ymm_id: 9688, service_id: 6 }, { ymm_id: 9688, service_id: 7 }, { ymm_id: 9688, service_id: 8 }, { ymm_id: 9688, service_id: 10 }, { ymm_id: 9688, service_id: 14 }, { ymm_id: 9688, service_id: 15 },
  { ymm_id: 4616, service_id: 6 }, { ymm_id: 4616, service_id: 7 }, { ymm_id: 4616, service_id: 8 }, { ymm_id: 4616, service_id: 10 }, { ymm_id: 4616, service_id: 14 }, { ymm_id: 4616, service_id: 15 },
  { ymm_id: 7061, service_id: 6 }, { ymm_id: 7061, service_id: 7 }, { ymm_id: 7061, service_id: 8 }, { ymm_id: 7061, service_id: 10 }, { ymm_id: 7061, service_id: 14 }, { ymm_id: 7061, service_id: 15 },
  { ymm_id: 9668, service_id: 6 }, { ymm_id: 9668, service_id: 7 }, { ymm_id: 9668, service_id: 8 }, { ymm_id: 9668, service_id: 10 }, { ymm_id: 9668, service_id: 14 }, { ymm_id: 9668, service_id: 15 },
  { ymm_id: 8803, service_id: 6 }, { ymm_id: 8803, service_id: 7 }, { ymm_id: 8803, service_id: 8 }, { ymm_id: 8803, service_id: 10 }, { ymm_id: 8803, service_id: 14 }, { ymm_id: 8803, service_id: 15 },
];

const airbagRequirementsData: RequirementInsertBase[] = [
  { ymm_id: 6062, service_id: 9 },
  { ymm_id: 6977, service_id: 9 },
  { ymm_id: 8034, service_id: 9 },
  { ymm_id: 7970, service_id: 9 },
  { ymm_id: 8456, service_id: 9 },
  { ymm_id: 4326, service_id: 9 },
  { ymm_id: 4321, service_id: 9 },
  { ymm_id: 6373, service_id: 9 },
  { ymm_id: 9719, service_id: 9 },
  { ymm_id: 4976, service_id: 9 },
  { ymm_id: 8834, service_id: 9 },
  { ymm_id: 9082, service_id: 9 },
  { ymm_id: 1062, service_id: 9 },
  { ymm_id: 8058, service_id: 9 },
  { ymm_id: 7984, service_id: 9 },
  { ymm_id: 6983, service_id: 9 },
  { ymm_id: 6431, service_id: 9 },
  { ymm_id: 9257, service_id: 9 },
  { ymm_id: 7159, service_id: 9 },
  { ymm_id: 8869, service_id: 9 },
  { ymm_id: 6030, service_id: 9 },
  { ymm_id: 1057, service_id: 9 },
  { ymm_id: 8228, service_id: 9 },
  { ymm_id: 9720, service_id: 9 },
  { ymm_id: 9238, service_id: 9 },
  { ymm_id: 5998, service_id: 9 },
  { ymm_id: 6010, service_id: 9 },
  { ymm_id: 4470, service_id: 9 },
  { ymm_id: 6445, service_id: 9 },
  { ymm_id: 7181, service_id: 9 },
  { ymm_id: 6986, service_id: 9 },
  { ymm_id: 8630, service_id: 9 },
  { ymm_id: 8217, service_id: 9 },
  { ymm_id: 9283, service_id: 9 },
  { ymm_id: 7112, service_id: 9 },
  { ymm_id: 4599, service_id: 9 },
  { ymm_id: 4851, service_id: 9 },
  { ymm_id: 7890, service_id: 9 },
  { ymm_id: 5252, service_id: 9 },
  { ymm_id: 7500, service_id: 9 },
  { ymm_id: 9688, service_id: 9 },
  { ymm_id: 4616, service_id: 9 },
  { ymm_id: 7061, service_id: 9 },
  { ymm_id: 9668, service_id: 9 },
  { ymm_id: 8803, service_id: 9 },
];

const adasRequirementsData: AdasRequirementInsert[] = [
  { ymm_id: 4321, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 4321, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 4321, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 4321, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 4326, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 4326, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 4326, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 4326, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 4470, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 4470, service_id: 2, equipment_model: 'AUTEL-CSC0601/06' }, { ymm_id: 4470, service_id: 3, equipment_model: 'AUTEL-CSC0802' }, { ymm_id: 4470, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 4599, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 4599, service_id: 2, equipment_model: 'AUTEL-CSC0601/11/01' }, { ymm_id: 4599, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 4599, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 4616, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 4616, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 4616, service_id: 3, equipment_model: 'AUTEL-CSC0602/08' }, { ymm_id: 4616, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 4851, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 4851, service_id: 2, equipment_model: 'AUTEL-CSC0601/12' }, { ymm_id: 4851, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 4851, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 4976, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 4976, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 4976, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 4976, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 5252, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 5252, service_id: 2, equipment_model: 'AUTEL-CSC0601/17' }, { ymm_id: 5252, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 5252, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 5998, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 5998, service_id: 2, equipment_model: 'N/A' }, { ymm_id: 5998, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 5998, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 6010, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 6010, service_id: 2, equipment_model: 'AUTEL-CSC0601/11' }, { ymm_id: 6010, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 6010, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 6030, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 6030, service_id: 2, equipment_model: 'N/A' }, { ymm_id: 6030, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 6030, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 6062, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 6062, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 6062, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 6062, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 6373, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 6373, service_id: 2, equipment_model: 'AUTEL-CSC0601/14' }, { ymm_id: 6373, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 6373, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 6431, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 6431, service_id: 2, equipment_model: 'AUTEL-CSC0601/24/01' }, { ymm_id: 6431, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 6431, service_id: 4, equipment_model: 'AUTEL-CSC1004/02' },
  { ymm_id: 6445, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 6445, service_id: 2, equipment_model: 'N/A' }, { ymm_id: 6445, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 6445, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 6977, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 6977, service_id: 2, equipment_model: 'AUTEL-CSC0601/08' }, { ymm_id: 6977, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 6977, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 6983, service_id: 1, equipment_model: 'Dynamic Calibration' }, { ymm_id: 6983, service_id: 2, equipment_model: 'AUTEL-CSC0601/07' }, { ymm_id: 6983, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 6983, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 6986, service_id: 1, equipment_model: 'Dynamic Calibration' }, { ymm_id: 6986, service_id: 2, equipment_model: 'N/A' }, { ymm_id: 6986, service_id: 3, equipment_model: 'AUTEL-CSC0602/02' }, { ymm_id: 6986, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 7061, service_id: 1, equipment_model: 'Dynamic Calibration' }, { ymm_id: 7061, service_id: 2, equipment_model: 'AUTEL-CSC0611/03' }, { ymm_id: 7061, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 7061, service_id: 4, equipment_model: 'Dynamic Calibration' },
  { ymm_id: 7112, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 7112, service_id: 2, equipment_model: 'AUTEL-CSC0601/03' }, { ymm_id: 7112, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 7112, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 7159, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 7159, service_id: 2, equipment_model: 'AUTEL-CSC0601/15' }, { ymm_id: 7159, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 7159, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 7181, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 7181, service_id: 2, equipment_model: 'N/A' }, { ymm_id: 7181, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 7181, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 7500, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 7500, service_id: 2, equipment_model: 'AUTEL-CSC0601/22' }, { ymm_id: 7500, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 7500, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 7890, service_id: 1, equipment_model: 'Dynamic Calibration' }, { ymm_id: 7890, service_id: 2, equipment_model: 'AUTEL-CSC0601/13' }, { ymm_id: 7890, service_id: 3, equipment_model: 'Dynamic Calibration' }, { ymm_id: 7890, service_id: 4, equipment_model: 'AUTEL-CSC1004/03' },
  { ymm_id: 7970, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 7970, service_id: 2, equipment_model: 'AUTEL-CSC0601/15' }, { ymm_id: 7970, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 7970, service_id: 4, equipment_model: 'AUTEL-CSC1004/10' },
  { ymm_id: 7984, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 7984, service_id: 2, equipment_model: 'AUTEL-CSC0601/15' }, { ymm_id: 7984, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 7984, service_id: 4, equipment_model: 'AUTEL-CSC1004/10' },
  { ymm_id: 8034, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 8034, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 8034, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 8034, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 8058, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 8058, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 8058, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 8058, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 8217, service_id: 1, equipment_model: 'Dynamic Calibration' }, { ymm_id: 8217, service_id: 2, equipment_model: 'AUTEL-CSC0601/07' }, { ymm_id: 8217, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 8217, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 8228, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 8228, service_id: 2, equipment_model: 'AUTEL-CSC0601/07' }, { ymm_id: 8228, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 8228, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 8456, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 8456, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 8456, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 8456, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 8630, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 8630, service_id: 2, equipment_model: 'AUTEL-CSC0601/08' }, { ymm_id: 8630, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 8630, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 8719, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 8719, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 8719, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 8719, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' }, // Assuming 8719 follows Audi pattern
  { ymm_id: 8869, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 8869, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 8869, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 8869, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 9082, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 9082, service_id: 2, equipment_model: 'AUTEL-CSC0601/07' }, { ymm_id: 9082, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 9082, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 9238, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 9238, service_id: 2, equipment_model: 'AUTEL-CSC0601/14' }, { ymm_id: 9238, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 9238, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 9257, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 9257, service_id: 2, equipment_model: 'AUTEL-CSC0601/15' }, { ymm_id: 9257, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 9257, service_id: 4, equipment_model: 'AUTEL-CSC1004/10' },
  { ymm_id: 9283, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 9283, service_id: 2, equipment_model: 'AUTEL-CSC0601/02' }, { ymm_id: 9283, service_id: 3, equipment_model: 'Dynamic Calibration' }, { ymm_id: 9283, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 9668, service_id: 1, equipment_model: 'N/A' }, { ymm_id: 9668, service_id: 2, equipment_model: 'AUTEL-CSC0611/05' }, { ymm_id: 9668, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 9668, service_id: 4, equipment_model: 'AUTEL-CSC1014/17' },
  { ymm_id: 9688, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 9688, service_id: 2, equipment_model: 'AUTEL-CSC0601/25' }, { ymm_id: 9688, service_id: 3, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 9688, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 9719, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 9719, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 9719, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 9719, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 9720, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 9720, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 9720, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 9720, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
  { ymm_id: 1057, service_id: 1, equipment_model: 'AUTEL-CSC0800' }, { ymm_id: 1057, service_id: 2, equipment_model: 'AUTEL-CSC0601/14' }, { ymm_id: 1057, service_id: 3, equipment_model: 'N/A' }, { ymm_id: 1057, service_id: 4, equipment_model: 'N/A' },
  { ymm_id: 1062, service_id: 1, equipment_model: 'AUTEL-CSC0605/01' }, { ymm_id: 1062, service_id: 2, equipment_model: 'AUTEL-CSC0601/01' }, { ymm_id: 1062, service_id: 3, equipment_model: 'AUTEL-CSC0602/01' }, { ymm_id: 1062, service_id: 4, equipment_model: 'AUTEL-CSC0806/01' },
];

/**
 * Seeds the database with baseline data (addresses, users, vehicles, equipment, etc.)
 * corresponding to 05-merged-custom-test-data.sql and 06-equipment-requirements-test-data.sql.
 * Parameterized by the number of technicians to create.
 *
 * @param supabase The Supabase client instance.
 * @param technicianCount The number of technicians (1-4) to include in the baseline.
 */
export async function seedBaseline(
  supabase: SupabaseClient<Database>, // Use the generated Database interface for public schema
  technicianCount: 1 | 2 | 3 | 4
): Promise<void> {
  console.log(`Seeding baseline data with ${technicianCount} technicians...`);

  if (technicianCount < 1 || technicianCount > 4) {
    throw new Error('Technician count must be between 1 and 4.');
  }

  // Data arrays are defined above this function

  try {
    // 1. Cleanup Logic Placeholder
    console.log('Cleaning previous baseline data (Placeholder - Not Implemented)...');
    // TODO: Implement or import and call the actual cleanup function here.
    // Example: await cleanupAllTestData(supabase);

    // 2. Filter technician-related data
    console.log(`Filtering data for ${technicianCount} technicians...`);
    const techUserSeedData = authUsersData
      .filter(u => u.email.startsWith('tech'))
      .slice(0, technicianCount);

    const customerUserSeedData = authUsersData.filter(u => !u.email.startsWith('tech'));

    const filteredAuthUserSeedData = [...techUserSeedData, ...customerUserSeedData];
    const filteredAuthUserIds = filteredAuthUserSeedData.map(u => u.id);

    const filteredPublicUsers = publicUsersData.filter(u => filteredAuthUserIds.includes(u.id));
    const filteredTechnicians = techniciansData.filter(t => filteredAuthUserIds.includes(t.user_id!));
    const techVanIds = filteredTechnicians.map(t => t.assigned_van_id!).filter(id => id !== null) as number[];
    const filteredVans = vansData.filter(v => techVanIds.includes(v.id));

    // 3. Insertion Logic
    console.log('Inserting baseline data...');

    // Insert independent public tables first
    await insertData(supabase, 'addresses', addressesData);
    await insertData(supabase, 'equipment', equipmentData);
    await insertData(supabase, 'ymm_ref', ymmRefData);
    await insertData(supabase, 'services', servicesData);

    // Insert Auth Users using Admin Client
    console.log(`Creating ${filteredAuthUserSeedData.length} auth users...`);
    // IMPORTANT: Ensure the Supabase client was initialized with the SERVICE_ROLE_KEY
    for (const userSeed of filteredAuthUserSeedData) {
      const { data: { user }, error } = await supabase.auth.admin.createUser({
          id: userSeed.id, // Use the predefined UUID from seed data
          email: userSeed.email,
          password: userSeed.password || 'password123', // Use defined or default password
          email_confirm: true, // Auto-confirm users since email verification is off for staging
          // Optionally add user_metadata here if needed
      });

      if (error) {
          // Handle potential errors, e.g., user already exists
          // Check each condition separately
          if (error.message.includes('duplicate key value violates unique constraint "users_pkey"') || error.message.includes('User already exists')) {
               console.warn(`Auth user ${userSeed.email} (ID: ${userSeed.id}) already exists. Skipping creation.`);
          } else {
              console.error(`Error creating auth user ${userSeed.email}:`, error);
              throw error;
          }
      } else {
          console.log(`Created/verified auth user: ${user?.email}`);
      }
    }

    // Now insert corresponding public user profiles
    await insertData(supabase, 'users', filteredPublicUsers);

    // Insert Vans, Vehicles, Technicians, Requirements
    await insertData(supabase, 'vans', filteredVans);
    await insertData(supabase, 'customer_vehicles', customerVehiclesData);
    await insertData(supabase, 'technicians', filteredTechnicians);
    await insertData(supabase, 'diag_equipment_requirements', diagRequirementsData);
    await insertData(supabase, 'immo_equipment_requirements', immoRequirementsData);
    await insertData(supabase, 'prog_equipment_requirements', progRequirementsData);
    await insertData(supabase, 'airbag_equipment_requirements', airbagRequirementsData);
    await insertData(supabase, 'adas_equipment_requirements', adasRequirementsData);

    console.log(`✅ Baseline data seeded successfully with ${technicianCount} technicians.`);

  } catch (error) {
    console.error('❌ Error seeding baseline data:', error);
    throw error; // Re-throw error to be caught by the caller
  }
}

// --- Helper Functions (TODO: Implement) ---

async function insertData<T extends keyof Database['public']['Tables']>(
    supabase: SupabaseClient<Database>,
    tableName: T,
    data: any[] // Use any[] here for simplicity, rely on data array typing
) {
    if (!data || data.length === 0) {
        console.log(`Skipping insertion for ${tableName}: No data.`);
        return;
    }
    console.log(`Inserting ${data.length} records into ${tableName}...`);
    const { error } = await supabase.from(tableName).insert(data as any);

    if (error) {
        console.error(`Error inserting data into ${tableName}:`, error);
        throw error;
    }
}

// TODO: Implement filtering functions (filterAuthUsers, filterPublicUsers, etc.)
// TODO: Implement cleanupBaselineData function if needed

// Example filter (adjust based on actual data structure)
// function filterTechnicians(data: Technician[], count: number): Technician[] {
//   // Assuming technicians have an ID or predictable order
//   return data.slice(0, count);
// } 