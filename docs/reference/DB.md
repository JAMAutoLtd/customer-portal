# Database Description

This document describes the PostgreSQL database schema used by the dynamic job scheduler application, primarily focusing on the `public` schema defined in `schema.sql`. The database also utilizes standard Supabase/Postgres schemas like `auth`, `storage`, `graphql`, and `extensions` (e.g., for `pgcrypto`, `uuid-ossp`) which are not detailed here.

## Helper Functions

- `public.update_updated_at_column()`: Trigger function to automatically update `updated_at` timestamps.
- `public.get_user_id_by_email()`: Utility function to retrieve a user's UUID from their email address.

## 1. Users (`public.users`)

**Purpose:** Stores all user accounts in the system, including customers, admins, and technicians. Links to `auth.users`.

**Fields:**

-   **`id`** (`uuid`, PK, FK → `auth.users.id`) - Primary key, references authentication user.
-   **`full_name`** (`varchar(100)`, NOT NULL) - User\'s full name.
-   **`phone`** (`varchar(100)`, nullable) - Contact phone number.
-   **`home_address_id`** (`int`, nullable, FK → `addresses.id`) - Reference to user\'s primary address.
-   **`is_admin`** (`boolean`, nullable, default: `false`) - Indicates if the user is an administrator.
-   **`customer_type`** (`customer_type` ENUM, NOT NULL) - Defines the type of customer (\'residential\', \'commercial\', \'insurance\').

**Key Points**

- Any user—customer, technician, or admin—exists here.
- CustomerType is used for determining job priority.
- Links to the auth.users table for authentication.

## 2. Technicians (`public.technicians`)

**Purpose:** Extends the `users` table for technician-specific details, including which van they drive and their current workload.

**Fields:**

-   **`id`** (`int`, PK, sequence: `technicians_id_seq`) - Unique identifier for the technician record.
-   **`user_id`** (`uuid`, nullable, FK → `users.id`) - References the main user record.
-   **`assigned_van_id`** (`int`, nullable, FK → `vans.id`) - The van currently assigned (can be NULL).
-   **`workload`** (`int`, nullable, CHECK >= 0) - A numeric indicator of workload.

**Key Points**

- Every technician is also a user.
- The technician is associated with a single van at a time.
- Workload can help with scheduling to see who is most available.

## 3. Vans (`public.vans`)

**Purpose:** Represents service vans in the fleet. Basic info includes last/next service dates and potentially last known location and the associated GPS device ID.

**Fields:**

-   **`id`** (`int`, PK, sequence: `fleet_vehicles_id_seq`) - Unique identifier for the van.
-   **`last_service`** (`timestamp with time zone`, nullable) - Date/time of last service.
-   **`next_service`** (`timestamp with time zone`, nullable) - Date/time of next scheduled service.
-   **`vin`** (`varchar`, nullable) - Vehicle identification number.
-   **`lat`** (`numeric`, nullable) - Last known latitude coordinate.
-   **`lng`** (`numeric`, nullable) - Last known longitude coordinate.
-   **`onestepgps_device_id`** (`varchar`, nullable) - Device identifier for the One Step GPS unit installed in the van.

**Key Points**

- Detailed equipment is tracked separately in `van_equipment`.
- A technician is assigned to one van at a time.
- `lat`/`lng` can store last known location (e.g., from One Step GPS).
- `onestepgps_device_id` links the van to its tracking device.

## 4. Addresses (`public.addresses`)

**Purpose:** Stores standardized location information (street addresses and geographic coordinates) used by orders, users, and jobs for routing.

**Fields:**

-   **`id`** (`int`, PK, sequence: `addresses_id_seq`) - Unique identifier for the address.
-   **`street_address`** (`varchar(255)`, NOT NULL) - Full street address text.
-   **`lat`** (`numeric(9,6)`, nullable) - Latitude coordinate.
-   **`lng`** (`numeric(9,6)`, nullable) - Longitude coordinate.
-   **Index:** `idx_addresses_coords` on (`lat`, `lng`).

**Key Points**

- Coordinates enable route optimization (e.g., traveling salesman problem).
- Multiple users (or orders/jobs) can reference the same address.
- Has an index on coordinates for efficient geospatial queries.

## 5. User Addresses (`public.user_addresses`)

**Purpose:** A many-to-many link between `users` and `addresses`, allowing users to have multiple saved addresses.

**Fields:**

-   **`user_id`** (`uuid`, PK, FK → `users.id`) - User identifier.
-   **`address_id`** (`int`, PK, FK → `addresses.id`) - Address identifier.

**Key Points**

- Useful for shared addresses (e.g., multiple customers using the same body shop) or users with multiple locations.
- Has a composite primary key of (user_id, address_id).

## 6. Orders (`public.orders`)

**Purpose:** Records a customer\'s service request (an order). An order may contain multiple services and can result in multiple jobs.

**Fields:**

-   **`id`** (`int`, PK, sequence: `orders_id_seq`) - Unique identifier for the order.
-   **`user_id`** (`uuid`, nullable, FK → `users.id`) - The customer placing the order.
-   **`vehicle_id`** (`int`, nullable, FK → `customer_vehicles.id`) - The vehicle being serviced.
-   **`repair_order_number`** (`varchar(50)`, nullable) - External reference number (e.g., from insurance).
-   **`address_id`** (`int`, nullable, FK → `addresses.id`) - Location where service is requested.
-   **`earliest_available_time`** (`timestamp with time zone`, nullable) - Earliest time the vehicle/customer is available for service (used as a constraint).
-   **`notes`** (`text`, nullable) - Customer instructions or general notes.
-   **`invoice`** (`int`, nullable) - Placeholder for external accounting reference (e.g., QuickBooks).

**Key Points**

- Captures all high-level info about the service request.
- Detailed services for the order go into `order_services`.
- File uploads related to the order are tracked in `order_uploads`.

## 7. Order Services (`public.order_services`)

**Purpose:** Junction table listing which services are requested for a specific order.

**Fields:**

-   **`order_id`** (`int`, PK, FK → `orders.id`) - Order identifier.
-   **`service_id`** (`int`, PK, FK → `services.id`) - Service identifier.

**Key Points**

- One order can request multiple services.
- Used by logic to determine if a single van/technician can handle all requested services or if multiple jobs are required.

## 8. Order Uploads (`public.order_uploads`)

**Purpose:** Tracks file uploads (e.g., photos, scan reports) associated with orders.

**Fields:**

-   **`id`** (`int`, PK, sequence: `order_uploads_id_seq`) - Unique identifier for the upload record.
-   **`order_id`** (`int`, nullable, FK → `orders.id`) - The associated order.
-   **`file_name`** (`varchar(255)`, NOT NULL) - Name of the uploaded file.
-   **`file_type`** (`varchar(100)`, nullable) - MIME type or file extension.
-   **`file_url`** (`text`, NOT NULL) - URL where the file is stored (e.g., Supabase Storage).
-   **`uploaded_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`) - Time the file was uploaded.

**Key Points**

- Stores metadata about uploaded files.
- Links back to the original order.

## 9. Jobs (`public.jobs`)

**Purpose:** Represents an individual work assignment derived from an order, schedulable to a single technician. An order might be split into multiple jobs.

**Fields:**

-   **`id`** (`int`, PK, sequence: `jobs_id_seq`) - Unique identifier for the job.
-   **`order_id`** (`int`, nullable, FK → `orders.id`) - Links back to the original order.
-   **`assigned_technician`** (`int`, nullable, FK → `technicians.id`) - Technician assigned by the scheduler.
-   **`address_id`** (`int`, nullable, FK → `addresses.id`) - Service location address.
-   **`priority`** (`int`, nullable, CHECK >= 0) - Scheduling priority (lower number = higher priority).
-   **`status`** (`job_status` ENUM, nullable) - Current status (e.g., \'queued\', \'pending_review\', \'in_progress\').
-   **`requested_time`** (`timestamp with time zone`, nullable) - Customer\'s preferred service time (informational).
-   **`estimated_sched`** (`timestamp with time zone`, nullable) - The start time calculated by the scheduling algorithm (in UTC).
-   **`job_duration`** (`int`, nullable, CHECK > 0) - Estimated minutes to complete the service.
-   **`notes`** (`text`, nullable) - General notes about the job.
-   **`technician_notes`** (`text`, nullable) - Notes specifically for or from the technician.
-   **`service_id`** (`int`, nullable, FK → `services.id`) - The specific service this job covers.
-   **`fixed_assignment`** (`boolean`, NOT NULL, default: `false`) - If true, this job assignment should not be changed by the dynamic scheduler.
-   **`fixed_schedule_time`** (`timestamp with time zone`, nullable) - If set, specifies a mandatory start time (used as a constraint).
-   **Indexes:** `idx_jobs_estimated_sched`, `idx_jobs_status`.

**Key Points**

- An order can be split into multiple jobs if no single van/technician can handle all services.
- Each job is assigned to exactly one technician (and thus one van).
- `service_id` specifies which service this job includes (linking back to `job_services` is implicit if needed).
- `fixed_assignment` and `fixed_schedule_time` allow manual overrides of the scheduler.
- Has indexes on status and estimated_sched for efficient querying by the scheduler.

## 10. Keys (`public.keys`)

**Purpose:** Tracks inventory of car key blanks and related parts for immobilizer jobs. (Not directly linked to core scheduling logic, but used by business logic).

**Fields:**

-   **`sku_id`** (`varchar(50)`, PK) - Stock Keeping Unit identifier.
-   **`quantity`** (`int`, NOT NULL, CHECK >= 0) - Current quantity in stock.
-   **`min_quantity`** (`int`, NOT NULL, CHECK >= 0) - Minimum stock level trigger.
-   **`part_number`** (`varchar(50)`, nullable) - Manufacturer part number.
-   **`purchase_price`** (`numeric(10,2)`, nullable) - Cost price.
-   **`sale_price`** (`numeric(10,2)`, nullable) - Selling price.
-   **`supplier`** (`varchar(100)`, nullable) - Supplier name.
-   **`fcc_id`** (`varchar(50)`, nullable) - FCC identifier, if applicable.

**Key Points**

- This table is checked by application logic when scheduling key/immobilizer jobs.
- Helps decide if keys need to be ordered before confirming a job schedule.

## 11. Services (`public.services`)

**Purpose:** Defines the various services offered by the business (e.g., ADAS calibration, module programming).

**Fields:**

-   **`id`** (`int`, PK, sequence: `services_id_seq`) - Unique identifier for the service.
-   **`service_name`** (`varchar(100)`, NOT NULL, UNIQUE) - Name of the service (must be unique).
-   **`slug`** (`text`, nullable) - A URL-friendly slug for the service name.
-   **`service_category`** (`service_category` ENUM, nullable) - Category of the service (\'adas\', \'airbag\', \'immo\', \'prog\', \'diag\').

**Key Points**

- Basic service definitions.
- Required equipment is defined in the specialized `*_equipment_requirements` tables based on service category and vehicle.
- Ties to `order_services` to indicate requested services.
- Service categories are strictly controlled via enum.

## 12. Equipment (`public.equipment`)

**Purpose:** Master list of all tools and equipment used for services (e.g., cones, calibration plates, programming tools).

**Fields:**

-   **`id`** (`int`, PK, sequence: `equipment_id_seq`) - Unique identifier for the equipment item.
-   **`model`** (`text`, nullable) - Model name or identifier (e.g., \'AUTEL-CSC0602/01\', \'prog\', \'immo\').
-   **`equipment_type`** (`service_category` ENUM, nullable) - Type/category of the equipment, aligning with service categories.

**Key Points**

- Used in `van_equipment` to specify which van has which gear.
- Equipment requirements for specific services and vehicles are defined in the specialized `*_equipment_requirements` tables.
- Equipment types align with service categories for consistency.

## 13. Van Equipment (`public.van_equipment`)

**Purpose:** Junction table indicating which equipment items are available in which service vans.

**Fields:**

-   **`van_id`** (`int`, PK, FK → `vans.id`) - Van identifier.
-   **`equipment_id`** (`int`, PK, FK → `equipment.id`) - Equipment identifier.

**Key Points**

- Has a composite primary key on (van_id, equipment_id).
- Critical for the scheduler to determine technician eligibility for jobs.

## 14. Customer Vehicles (`public.customer_vehicles`)

**Purpose:** Stores information about customer vehicles that can be serviced.

**Fields:**

-   **`id`** (`int`, PK, sequence: `vehicles_id_seq`) - Unique identifier for the vehicle record.
-   **`vin`** (`varchar(17)`, nullable, UNIQUE) - Vehicle Identification Number.
-   **`make`** (`varchar(100)`, NOT NULL) - Vehicle make (e.g., \'Toyota\').
-   **`year`** (`smallint`, nullable) - Vehicle model year.
-   **`model`** (`varchar(100)`, nullable) - Vehicle model (e.g., \'Camry\').

**Key Points**

- Referenced by orders to identify which vehicle needs service.
- Referenced by vans to identify service vehicles in the fleet (via VIN).

## 15. YMM Reference (`public.ymm_ref`)

**Purpose:** Standardized reference table for Year/Make/Model combinations, used for equipment requirements.

**Fields:**

-   **`ymm_id`** (`int`, PK, sequence: `adas_ymm_ref_ymm_id_seq`) - Unique identifier for the YMM combination.
-   **`year`** (`smallint`, NOT NULL) - Vehicle model year.
-   **`make`** (`varchar(50)`, NOT NULL) - Vehicle make.
-   **`model`** (`varchar(100)`, NOT NULL) - Vehicle model.
-   **Unique Constraint:** On (`year`, `make`, `model`).

**Key Points**

- Provides consistent vehicle identification for linking services to required equipment.
- Used by all `*_equipment_requirements` tables.

## 16. Equipment Requirements Tables

**Purpose:** These tables define the specific equipment required for a given service on a specific vehicle type (identified by `ymm_id`). The scheduler uses the job\'s `service_category` to determine which table to query.

### ADAS Equipment Requirements (`public.adas_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, sequence: `adas_equipment_data_id_seq`)
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`varchar(100)`, NOT NULL) - Specific model name required (from `equipment.model`).
-   **`has_adas_service`** (`boolean`, NOT NULL, default: `false`) - Indicates if the service is specifically ADAS-related (used for filtering?).
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

### Programming Equipment Requirements (`public.prog_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, sequence: `prog_equipment_requirements_id_seq`)
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`text`, NOT NULL, default: \'\'prog\'\') - Usually the generic category name.
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

### Immobilizer Equipment Requirements (`public.immo_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, default: `nextval(\'adas_equipment_data_id_seq\'::regclass)`) - *Note: Uses ADAS sequence based on schema dump.*\
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`text`, NOT NULL, default: \'\'immo\'\')
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

### Airbag Equipment Requirements (`public.airbag_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, default: `nextval(\'adas_equipment_data_id_seq\'::regclass)`) - *Note: Uses ADAS sequence based on schema dump.*\
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`text`, NOT NULL, default: \'\'airbag\'\')
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

### Diagnostic Equipment Requirements (`public.diag_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, sequence: `diag_equipment_requirements_id_seq`)
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`text`, NOT NULL, default: \'\'diag\'\')
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

**Key Points for All Equipment Requirement Tables**

- Link specific vehicles (via YMM) and services to the required equipment (by model name or category).
- Crucial for the scheduler's eligibility checks (`apps/scheduler/src/scheduler/eligibility.ts`).
- Helps determine if a specific van (via `van_equipment`) has the right gear for a job.

## 17. Technician Availability Tables (Not Yet Used by Scheduler)

*Note: These tables exist in the schema but are not currently integrated into the primary scheduling logic (`apps/scheduler/src/scheduler/availability.ts`). The scheduler currently assumes technicians are available during standard working hours or calculates based on real-time/fixed data.*

### Technician Default Hours (`public.technician_default_hours`)

**Purpose:** Stores standard weekly working hours for technicians.

**Fields:**

-   **`id`** (`int`, PK, sequence: `technician_default_hours_id_seq`)
-   **`technician_id`** (`int`, NOT NULL, FK → `technicians.id`)
-   **`day_of_week`** (`smallint`, NOT NULL) - 0 (Sunday) to 6 (Saturday).
-   **`start_time`** (`time without time zone`, NOT NULL)
-   **`end_time`** (`time without time zone`, NOT NULL)
-   **`created_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`)
-   **`updated_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`)
-   **Check Constraint:** `technician_default_hours_day_of_week_check` (0 <= `day_of_week` <= 6).
-   **Unique Constraint:** On (`technician_id`, `day_of_week`).

### Technician Availability Exceptions (`public.technician_availability_exceptions`)

**Purpose:** Records specific dates/times when a technician deviates from their default hours (e.g., time off, custom availability).

**Fields:**

-   **`id`** (`int`, PK, sequence: `technician_availability_exceptions_id_seq`)
-   **`technician_id`** (`int`, NOT NULL, FK → `technicians.id`)
-   **`exception_type`** (`technician_availability_exception_type` ENUM, NOT NULL) - \'time_off\', \'custom_hours\'.
-   **`date`** (`date`, NOT NULL) - The date the exception applies to.
-   **`is_available`** (`boolean`, NOT NULL) - Indicates if the technician is available at all on this date.
-   **`start_time`** (`time without time zone`, nullable) - Custom start time (if `exception_type` is \'custom_hours\' and `is_available` is true).
-   **`end_time`** (`time without time zone`, nullable) - Custom end time (if `exception_type` is \'custom_hours\' and `is_available` is true).
-   **`reason`** (`text`, nullable) - Optional reason for the exception.
-   **`created_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`)
-   **`updated_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`)

## 18. Enum Types

-   **`customer_type`**: 'residential', 'commercial', 'insurance' (Used in `users`)
-   **`job_status`**: 'pending_review', 'queued', 'en_route', 'in_progress', 'pending_revisit', 'completed', 'cancelled', 'paid', 'fixed_time' (Used in `jobs`)
-   **`service_category`**: 'adas', 'airbag', 'immo', 'prog', 'diag' (Used in `services`, `equipment`)
-   **`technician_availability_exception_type`**: 'time_off', 'custom_hours' (Used in `technician_availability_exceptions`)
