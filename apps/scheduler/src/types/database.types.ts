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
  // Add new fields for detailed availability records
  defaultHours?: TechnicianDefaultHours[];
  availabilityExceptions?: TechnicianAvailabilityException[];
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

// Interface for Equipment Requirements (Unified structure)
// Single unified table: equipment_requirements
export interface EquipmentRequirement {
  id: number;
  ymm_id: number;
  service_id: number;
  equipment_model: string;
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

// Add new interfaces for availability records
export interface TechnicianDefaultHours {
  id: number;
  technician_id: number;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  start_time: string; // time without time zone, e.g., '09:00:00'
  end_time: string; // time without time zone, e.g., '17:00:00'
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
  is_available: boolean | null;
}

export interface TechnicianAvailabilityException {
  id: number;
  technician_id: number;
  exception_type: 'time_off' | 'custom_hours';
  date: string; // date, e.g., '2024-08-15'
  is_available: boolean;
  start_time: string | null; // time without time zone, e.g., '10:00:00'
  end_time: string | null; // time without time zone, e.g., '15:00:00'
  reason: string | null;
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
}

// --- Start: New Types for Scheduling State Management ---

/**
 * Reasons why a job might fail scheduling.
 * Includes classification for persistence.
 */
export enum FailureReason {
  // Persistent Failures (Eligibility Issues)
  NO_ELIGIBLE_TECHNICIAN_EQUIPMENT = 'NO_ELIGIBLE_TECHNICIAN_EQUIPMENT', // No tech has required equipment
  NO_ASSIGNED_VAN = 'NO_ASSIGNED_VAN', // Technician does not have an assigned van
  // Add other potential persistent reasons if needed (e.g., service area)
  
  // Transient Failures (Optimizer Issues for a Specific Day)
  OPTIMIZER_TIME_CONSTRAINT = 'OPTIMIZER_TIME_CONSTRAINT',         // Optimizer couldn't fit within time window/dependencies
  OPTIMIZER_CAPACITY_CONSTRAINT = 'OPTIMIZER_CAPACITY_CONSTRAINT', // Optimizer couldn't fit due to technician capacity
  OPTIMIZER_OTHER = 'OPTIMIZER_OTHER',                           // Other optimizer reason (e.g., high penalty)
  
  // Unknown/Other
  UNKNOWN = 'UNKNOWN',
  NO_TECHNICIAN_AVAILABILITY = 'no_technician_availability' // Added for this scenario
}

// Helper to check if a reason is considered persistent
export const isPersistentFailure = (reason: FailureReason | null | undefined): boolean => {
  if (!reason) return false;
  return [
    FailureReason.NO_ELIGIBLE_TECHNICIAN_EQUIPMENT,
    FailureReason.NO_ASSIGNED_VAN,
    // Add other persistent reasons here
  ].includes(reason);
};

/**
 * Represents a single scheduling attempt for a job.
 */
export interface SchedulingAttempt {
  timestamp: string; // ISO timestamp of the attempt
  planningDay: string; // Date string (YYYY-MM-DD) the attempt was for
  success: boolean;
  failureReason: FailureReason | null;
  assignedTechnicianId?: number | null; // Only if successful
  assignedTimeISO?: string | null; // Only if successful
}

/**
 * Holds the complete scheduling state history for a single job.
 */
export interface JobSchedulingState {
  jobId: number;
  attempts: SchedulingAttempt[];
  lastStatus: 'pending' | 'scheduled' | 'failed_persistent' | 'failed_transient'; // Current assessment
}

// --- End: New Types for Scheduling State Management ---

// Add interface for CustomerVehicle based on selection in orders.ts
export interface CustomerVehicle {
  id: number;
  year: number | null;
  make: string | null;
  model: string | null;
}

export interface TravelTimeCache {
  id: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  is_predictive: boolean;
  target_hour_utc: number | null;
  target_day_of_week_utc: number | null;
  travel_time_seconds: number;
  distance_meters: number | null;
  retrieved_at: string;
  expires_at: string;
} 