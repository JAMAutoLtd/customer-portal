# Database Description

This document describes the PostgreSQL database schema used by the dynamic job scheduler application, based on the definitions in `schema.sql`.

## 1. Users (`public.users`)

**Purpose:** Stores all user accounts, including customers, admins, and technicians. Links to `auth.users`.

**Fields:**

-   **`id`** (`uuid`, PK, FK → `auth.users.id`) - Primary key, references authentication user.
-   **`full_name`** (`varchar(100)`, NOT NULL) - User's full name.
-   **`phone`** (`varchar(100)`, nullable) - Contact phone number.
-   **`home_address_id`** (`int`, nullable, FK → `addresses.id`) - Reference to user's primary address.
-   **`is_admin`** (`boolean`, nullable, default: `false`) - Indicates if the user is an administrator.
-   **`customer_type`** (`customer_type` ENUM, NOT NULL) - Defines the type of customer ('residential', 'commercial', 'insurance').

## 2. Technicians (`public.technicians`)

**Purpose:** Extends the `users` table for technician-specific details.

**Fields:**

-   **`id`** (`int`, PK, sequence: `technicians_id_seq`) - Unique identifier for the technician record.
-   **`user_id`** (`uuid`, nullable, FK → `users.id`) - References the main user record.
-   **`assigned_van_id`** (`int`, nullable, FK → `vans.id`) - The van currently assigned (can be NULL).
-   **`workload`** (`int`, nullable, CHECK >= 0) - A numeric indicator of workload.

## 3. Vans (`public.vans`)

**Purpose:** Represents service vans in the fleet.

**Fields:**

-   **`id`** (`int`, PK, sequence: `fleet_vehicles_id_seq`) - Unique identifier for the van.
-   **`last_service`** (`timestamp with time zone`, nullable) - Date/time of last service.
-   **`next_service`** (`timestamp with time zone`, nullable) - Date/time of next scheduled service.
-   **`vin`** (`varchar`, nullable) - Vehicle identification number.
-   **`lat`** (`numeric`, nullable) - Last known latitude coordinate.
-   **`lng`** (`numeric`, nullable) - Last known longitude coordinate.

## 4. Addresses (`public.addresses`)

**Purpose:** Stores standardized location information (street addresses and geographic coordinates).

**Fields:**

-   **`id`** (`int`, PK, sequence: `addresses_id_seq`) - Unique identifier for the address.
-   **`street_address`** (`varchar(255)`, NOT NULL) - Full street address text.
-   **`lat`** (`numeric(9,6)`, nullable) - Latitude coordinate.
-   **`lng`** (`numeric(9,6)`, nullable) - Longitude coordinate.
-   **Index:** `idx_addresses_coords` on (`lat`, `lng`).

## 5. User Addresses (`public.user_addresses`)

**Purpose:** Many-to-many link between `users` and `addresses`.

**Fields:**

-   **`user_id`** (`uuid`, PK, FK → `users.id`) - User identifier.
-   **`address_id`** (`int`, PK, FK → `addresses.id`) - Address identifier.

## 6. Orders (`public.orders`)

**Purpose:** Records customer service requests (orders). An order can contain multiple services and may result in multiple jobs.

**Fields:**

-   **`id`** (`int`, PK, sequence: `orders_id_seq`) - Unique identifier for the order.
-   **`user_id`** (`uuid`, nullable, FK → `users.id`) - The customer placing the order.
-   **`vehicle_id`** (`int`, nullable, FK → `customer_vehicles.id`) - The vehicle being serviced.
-   **`repair_order_number`** (`varchar(50)`, nullable) - External reference number.
-   **`address_id`** (`int`, nullable, FK → `addresses.id`) - Location where service is requested.
-   **`earliest_available_time`** (`timestamp with time zone`, nullable) - Earliest time the vehicle/customer is available for service (used as a constraint).
-   **`notes`** (`text`, nullable) - Customer instructions or general notes.
-   **`invoice`** (`int`, nullable) - Placeholder for external accounting reference.

## 7. Order Services (`public.order_services`)

**Purpose:** Junction table listing which services are requested for a specific order.

**Fields:**

-   **`order_id`** (`int`, PK, FK → `orders.id`) - Order identifier.
-   **`service_id`** (`int`, PK, FK → `services.id`) - Service identifier.

## 8. Order Uploads (`public.order_uploads`)

**Purpose:** Tracks file uploads associated with orders.

**Fields:**

-   **`id`** (`int`, PK, sequence: `order_uploads_id_seq`) - Unique identifier for the upload record.
-   **`order_id`** (`int`, nullable, FK → `orders.id`) - The associated order.
-   **`file_name`** (`varchar(255)`, NOT NULL) - Name of the uploaded file.
-   **`file_type`** (`varchar(100)`, nullable) - MIME type or file extension.
-   **`file_url`** (`text`, NOT NULL) - URL where the file is stored.
-   **`uploaded_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`) - Time the file was uploaded.

## 9. Jobs (`public.jobs`)

**Purpose:** Represents an individual work assignment derived from an order, schedulable to a single technician.

**Fields:**

-   **`id`** (`int`, PK, sequence: `jobs_id_seq`) - Unique identifier for the job.
-   **`order_id`** (`int`, nullable, FK → `orders.id`) - Links back to the original order.
-   **`assigned_technician`** (`int`, nullable, FK → `technicians.id`) - Technician assigned by the scheduler.
-   **`address_id`** (`int`, nullable, FK → `addresses.id`) - Service location address.
-   **`priority`** (`int`, nullable, CHECK >= 0) - Scheduling priority (lower number = higher priority).
-   **`status`** (`job_status` ENUM, nullable) - Current status (e.g., 'queued', 'pending_review', 'in_progress').
-   **`requested_time`** (`timestamp with time zone`, nullable) - Customer's preferred service time (informational).
-   **`estimated_sched`** (`timestamp with time zone`, nullable) - The start time calculated by the scheduling algorithm (in UTC).
-   **`job_duration`** (`int`, nullable, CHECK > 0) - Estimated minutes to complete the service.
-   **`notes`** (`text`, nullable) - General notes about the job.
-   **`technician_notes`** (`text`, nullable) - Notes specifically for or from the technician.
-   **`service_id`** (`int`, nullable, FK → `services.id`) - The specific service this job covers.
-   **`fixed_assignment`** (`boolean`, NOT NULL, default: `false`) - If true, this job assignment should not be changed by the dynamic scheduler.
-   **`fixed_schedule_time`** (`timestamp with time zone`, nullable) - If set, specifies a mandatory start time (used as a constraint).
-   **Indexes:** `idx_jobs_estimated_sched`, `idx_jobs_status`.

## 10. Keys (`public.keys`)

**Purpose:** Tracks inventory of car key blanks and related parts. (Not directly linked to core scheduling logic).

**Fields:**

-   **`sku_id`** (`varchar(50)`, PK) - Stock Keeping Unit identifier.
-   **`quantity`** (`int`, NOT NULL, CHECK >= 0) - Current quantity in stock.
-   **`min_quantity`** (`int`, NOT NULL, CHECK >= 0) - Minimum stock level trigger.
-   **`part_number`** (`varchar(50)`, nullable) - Manufacturer part number.
-   **`purchase_price`** (`numeric(10,2)`, nullable) - Cost price.
-   **`sale_price`** (`numeric(10,2)`, nullable) - Selling price.
-   **`supplier`** (`varchar(100)`, nullable) - Supplier name.
-   **`fcc_id`** (`varchar(50)`, nullable) - FCC identifier, if applicable.

## 11. Services (`public.services`)

**Purpose:** Defines the services offered by the business.

**Fields:**

-   **`id`** (`int`, PK, sequence: `services_id_seq`) - Unique identifier for the service.
-   **`service_name`** (`varchar(100)`, NOT NULL, UNIQUE) - Name of the service (must be unique).
-   **`slug`** (`text`, nullable) - A URL-friendly slug for the service name.
-   **`service_category`** (`service_category` ENUM, nullable) - Category of the service ('adas', 'airbag', 'immo', 'prog', 'diag').

## 12. Equipment (`public.equipment`)

**Purpose:** Master list of all tools and equipment used for services.

**Fields:**

-   **`id`** (`int`, PK, sequence: `equipment_id_seq`) - Unique identifier for the equipment item.
-   **`model`** (`text`, nullable) - Model name or identifier (e.g., 'AUTEL-CSC0602/01', 'prog', 'immo').
-   **`equipment_type`** (`service_category` ENUM, nullable) - Type/category of the equipment, aligning with service categories.

## 13. Van Equipment (`public.van_equipment`)

**Purpose:** Junction table indicating which equipment items are available in which service vans.

**Fields:**

-   **`van_id`** (`int`, PK, FK → `vans.id`) - Van identifier.
-   **`equipment_id`** (`int`, PK, FK → `equipment.id`) - Equipment identifier.

## 14. Customer Vehicles (`public.customer_vehicles`)

**Purpose:** Stores information about customer vehicles.

**Fields:**

-   **`id`** (`int`, PK, sequence: `vehicles_id_seq`) - Unique identifier for the vehicle record.
-   **`vin`** (`varchar(17)`, nullable, UNIQUE) - Vehicle Identification Number.
-   **`make`** (`varchar(100)`, NOT NULL) - Vehicle make (e.g., 'Toyota').
-   **`year`** (`smallint`, nullable) - Vehicle model year.
-   **`model`** (`varchar(100)`, nullable) - Vehicle model (e.g., 'Camry').

## 15. YMM Reference (`public.ymm_ref`)

**Purpose:** Standardized reference table for Year/Make/Model combinations.

**Fields:**

-   **`ymm_id`** (`int`, PK, sequence: `adas_ymm_ref_ymm_id_seq`) - Unique identifier for the YMM combination.
-   **`year`** (`smallint`, NOT NULL) - Vehicle model year.
-   **`make`** (`varchar(50)`, NOT NULL) - Vehicle make.
-   **`model`** (`varchar(100)`, NOT NULL) - Vehicle model.
-   **Unique Constraint:** On (`year`, `make`, `model`).

## 16. Equipment Requirements Tables

These tables define the specific equipment required for a given service on a specific vehicle type (identified by `ymm_id`). The scheduler uses the job's `service_category` to determine which table to query.

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
-   **`equipment_model`** (`text`, NOT NULL, default: ''prog'') - Usually the generic category name.
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

### Immobilizer Equipment Requirements (`public.immo_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, default: `nextval('adas_equipment_data_id_seq'::regclass)`) - *Note: Uses ADAS sequence based on schema dump.*
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`text`, NOT NULL, default: ''immo'')
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

### Airbag Equipment Requirements (`public.airbag_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, default: `nextval('adas_equipment_data_id_seq'::regclass)`) - *Note: Uses ADAS sequence based on schema dump.*
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`text`, NOT NULL, default: ''airbag'')
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

### Diagnostic Equipment Requirements (`public.diag_equipment_requirements`)

**Fields:**

-   **`id`** (`int`, PK, sequence: `diag_equipment_requirements_id_seq`)
-   **`ymm_id`** (`int`, NOT NULL, FK → `ymm_ref.ymm_id`)
-   **`service_id`** (`int`, NOT NULL, FK → `services.id`)
-   **`equipment_model`** (`text`, NOT NULL, default: ''diag'')
-   **Unique Constraint:** On (`ymm_id`, `service_id`).

## 17. Technician Availability Tables (Not Yet Used by Scheduler)

*Note: These tables exist in the schema but are not currently integrated into the primary scheduling logic (`src/scheduler/availability.ts`).*

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
-   **`exception_type`** (`technician_availability_exception_type` ENUM, NOT NULL) - 'time_off', 'custom_hours'.
-   **`date`** (`date`, NOT NULL) - The date the exception applies to.
-   **`is_available`** (`boolean`, NOT NULL) - Indicates if the technician is available at all on this date.
-   **`start_time`** (`time without time zone`, nullable) - Custom start time (if `exception_type` is 'custom_hours' and `is_available` is true).
-   **`end_time`** (`time without time zone`, nullable) - Custom end time (if `exception_type` is 'custom_hours' and `is_available` is true).
-   **`reason`** (`text`, nullable) - Optional reason for the exception.
-   **`created_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`)
-   **`updated_at`** (`timestamp with time zone`, nullable, default: `CURRENT_TIMESTAMP`)

## 18. Enum Types

-   **`customer_type`**: 'residential', 'commercial', 'insurance' (Used in `users`)
-   **`job_status`**: 'pending_review', 'queued', 'en_route', 'in_progress', 'fixed_time', 'pending_revisit', 'completed', 'cancelled', 'paid' (Used in `jobs`)
-   **`service_category`**: 'adas', 'airbag', 'immo', 'prog', 'diag' (Used in `services`, `equipment`)
-   **`technician_availability_exception_type`**: 'time_off', 'custom_hours' (Used in `technician_availability_exceptions`)
