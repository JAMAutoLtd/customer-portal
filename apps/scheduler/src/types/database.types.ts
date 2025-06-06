// Based on DB.md schema

export interface Address {
  id: number;
  street_address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface User {
  id: string; // uuid references auth.users
  full_name: string | null;
  phone: string | null;
  home_address_id: number | null;
  is_admin: boolean | null;
  customer_type: 'residential' | 'commercial' | 'insurance' | null;
}

export interface Van {
  id: number;
  last_service: string | null; // timestamp with time zone
  next_service: string | null; // timestamp with time zone
  vin: string | null;
  lat: number | null;
  lng: number | null;
  onestepgps_device_id?: string | null;
}

export interface Technician {
  id: number;
  user_id: string; // uuid, FK -> users.id
  assigned_van_id: number | null;
  workload: number | null;
  // Potentially join user and van data when fetching
  user?: User;
  van?: Van;
  current_location?: { lat: number; lng: number }; // Added for scheduler convenience
  earliest_availability?: string; // Added for scheduler convenience
  home_location?: { lat: number; lng: number }; // Added for multi-day overflow
  availability?: TechnicianAvailability[]; // Optional: Full availability schedule
}

export type JobStatus = 
  // Core statuses used by runFullReplan final update:
  | 'queued' // Job is scheduled with technician and time
  | 'pending_review' // Job could not be scheduled within the overflow window
  // Other potentially relevant statuses (read by scheduler):
  | 'en_route'
  | 'in_progress'
  | 'fixed_time'
  // Statuses potentially used by other processes or older versions:
  | 'assigned' 
  | 'scheduled' // Older equivalent of 'queued'?
  | 'pending_revisit' 
  | 'completed' 
  | 'cancelled' 
  // Deprecated statuses (no longer primary output of runFullReplan):
  | 'overflow' 
  | 'scheduled_future' 
  | 'unschedulable_overflow'; 

export interface Job {
  id: number;
  order_id: number;
  assigned_technician: number | null;
  address_id: number;
  priority: number;
  status: JobStatus;
  requested_time: string | null; // timestamp with time zone
  estimated_sched: string | null; // timestamp with time zone
  job_duration: number; // minutes
  notes: string | null;
  technician_notes: string | null;
  service_id: number;
  fixed_assignment: boolean | null;
  fixed_schedule_time: string | null; // timestamp with time zone
  // Joined data for convenience
  address?: Address;
  service?: Service;
  order_details?: {
    earliest_available_time: string | null;
  } | null;
}

export interface Equipment {
  id: number;
  equipment_type: 'adas' | 'airbag' | 'immo' | 'prog' | 'diag';
  model: string | null;
}

export interface VanEquipment {
  van_id: number;
  equipment_id: number;
  equipment_model: string | null;
  // Joined data
  equipment?: Equipment;
}

export type ServiceCategory = 'adas' | 'airbag' | 'immo' | 'prog' | 'diag';

export interface Service {
  id: number;
  service_name: string;
  service_category: ServiceCategory;
}

export interface YmmRef {
  ymm_id: number;
  year: number;
  make: string;
  model: string;
}

// Interface for Equipment Requirements (Generic structure)
// Specific tables are adas_, prog_, immo_, airbag_, diag_equipment_requirements
export interface EquipmentRequirement {
  id: number;
  ymm_id: number;
  service_id: number;
  equipment_model: string;
  // Field specific to adas_
  has_adas_service?: boolean;
}

// Type for job bundles used in scheduling
export interface JobBundle {
  order_id: number;
  jobs: Job[];
  total_duration: number;
  priority: number;
  address_id: number;
  address?: Address;
  required_equipment_models: string[];
  eligible_technician_ids: number[];
}

// Derived type representing a single job ready for scheduling, including eligibility
export interface SchedulableJob extends Job {
  eligibleTechnicians: Technician[];
  originalItem: Job; // Reference to the original DB Job object
  order_details?: { 
    earliest_available_time: string | null;
  } | null;
}

export type SchedulableItem = JobBundle | SchedulableJob;

// Type for technician availability calculated for a specific day
export interface TechnicianAvailability {
  technicianId: number;
  availabilityStartTimeISO: string;
  availabilityEndTimeISO: string;
  startLocation: { lat: number; lng: number };
} 