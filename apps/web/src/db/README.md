# Database Description

## 1. Users (users)

**Purpose:** Stores all user accounts in the system, including customers, admins, and technicians.

**Fields**

- **id** (uuid, PK) - Primary key, also references auth.users
- **full_name** (varchar(100)) - User's full name
- **phone** (varchar(100)) - Contact phone number
- **home_address_id** (int, FK → addresses.id) - Reference to user's home address
- **is_admin** (boolean) - Indicates if the user is an administrator (default: false)
- **customer_type** (enum: 'residential', 'commercial', 'insurance') - Defines the type of customer

**Key Points**

- Any user—customer, technician, or admin—exists here.
- CustomerType is used for determining job priority.
- Links to the auth.users table for authentication.

---

## 2. Technicians (technicians)

**Purpose:** Extends the `Users` table for technician-specific details, including which van they drive and their current workload.

**Fields**

- **id** (int, PK)
- **user_id** (uuid, FK → users.id) - References the main user record
- **assigned_van_id** (int, FK → vans.id) - Which van they currently use
- **workload** (int) - A numeric indicator of workload (must be >= 0)

**Key Points**

- Every technician is also a user.
- The technician is associated with a single van at a time.
- Workload can help with scheduling to see who is most available.

---

## 3. Vans (vans)

**Purpose:** Represents each service van in the fleet. Basic info includes last/next service dates.

**Fields**

- **id** (int, PK)
- **last_service** (timestamp with time zone)
- **next_service** (timestamp with time zone)
- **vin** (varchar, FK → customer_vehicles.vin) - Vehicle identification number

**Key Points**

- Detailed equipment is tracked separately in `van_equipment`.
- A technician is assigned to one van at a time.

---

## 4. Addresses (addresses)

**Purpose:** Standardizes location information (street addresses plus coordinates) used by orders, users, and jobs for routing.

**Fields**

- **id** (int, PK)
- **street_address** (varchar(255))
- **lat** (numeric) - Latitude coordinate
- **lng** (numeric) - Longitude coordinate

**Key Points**

- Coordinates enable route optimization (e.g., traveling salesman problem).
- Multiple users (or orders/jobs) can reference the same address.
- Has an index on coordinates for efficient geospatial queries.

---

## 5. User Addresses (user_addresses)

**Purpose:** A many-to-many link between `Users` and `Addresses`, so one user can have multiple addresses, and one address can belong to multiple users.

**Fields**

- **user_id** (uuid, FK → users.id)
- **address_id** (int, FK → addresses.id)

**Key Points**

- Useful for shared addresses (e.g., multiple customers using the same body shop).
- Has a composite primary key of (user_id, address_id).

---

## 6. Orders (orders)

**Purpose:** Records a customer's service request (an order). An order may be split into multiple jobs if needed.

**Fields**

- **id** (int, PK)
- **user_id** (uuid, FK → users.id) - The customer placing the order
- **vehicle_id** (int, FK → customer_vehicles.id) - The vehicle being serviced
- **repair_order_number** (varchar(50)) - Used by insurance or external reference
- **address_id** (int, FK → addresses.id) - Where service is requested
- **earliest_available_time** (timestamp with time zone) - Earliest time the vehicle is available
- **notes** (text) - Any additional instructions from the customer
- **invoice** (int) - Placeholder for QuickBooks or accounting reference

**Key Points**

- Captures all high-level info about the request.
- Detailed services for the order go into `order_services`.
- File uploads are tracked in `order_uploads`.

---

## 7. Order Services (order_services)

**Purpose:** A junction table listing which services the customer requested for a particular order.

**Fields**

- **order_id** (int, FK → orders.id)
- **service_id** (int, FK → services.id)

**Key Points**

- One order can request multiple services.
- Used by logic to determine if a single van can handle all requested services or if multiple jobs are required.

---

## 8. Order Uploads (order_uploads)

**Purpose:** Tracks file uploads associated with an order.

**Fields**

- **id** (int, PK)
- **order_id** (int, FK → orders.id)
- **file_name** (varchar(255))
- **file_type** (varchar(100))
- **file_url** (text)
- **uploaded_at** (timestamp with time zone) - Defaults to current timestamp

**Key Points**

- Stores metadata about uploaded files (photos, scans, etc.)
- Links back to the original order

---

## 9. Jobs (jobs)

**Purpose:** Represents an individual work assignment that can be scheduled and dispatched to a single technician.

**Fields**

- **id** (int, PK)
- **order_id** (int, FK → orders.id) - Links back to the original order
- **assigned_technician** (int, FK → technicians.id) - Who will perform this job
- **address_id** (int, FK → addresses.id) - Service location
- **priority** (int) - Scheduling priority (must be >= 0)
- **status** (USER-DEFINED) - e.g., 'Pending', 'Scheduled', 'InProgress', 'Completed'
- **requested_time** (timestamp with time zone) - Customer's requested time
- **estimated_sched** (timestamp with time zone) - The dispatch-scheduled time
- **job_duration** (int) - Estimated minutes to complete (must be > 0)
- **notes** (text)

**Key Points**

- An order can be split into multiple jobs if no single van can handle all services.
- Each job is assigned to exactly one technician (and thus one van).
- `job_services` will specify which services this job includes.
- Has indexes on status and estimated_sched for efficient querying.

---

## 10. Job Services (job_services)

**Purpose:** Links each job to the specific services it will perform.

**Fields**

- **job_id** (int, FK → jobs.id)
- **service_id** (int, FK → services.id)

**Key Points**

- A single job can handle multiple services.
- Has a composite primary key on (job_id, service_id).

---

## 11. Keys (keys)

**Purpose:** Tracks inventory of car key blanks and related key parts for immobilizer jobs.

**Fields**

- **sku_id** (varchar(50), PK)
- **quantity** (int) - Must be >= 0
- **min_quantity** (int) - Must be >= 0
- **part_number** (varchar(50))
- **purchase_price** (numeric)
- **sale_price** (numeric)
- **supplier** (varchar(100))
- **fcc_id** (varchar(50))

**Key Points**

- This table is not directly linked to the Orders/Jobs schema, but the logic layer checks key availability when scheduling key/immobilizer jobs.
- Helps decide if you need to order new keys before scheduling.

---

## 12. Services (services)

**Purpose:** Defines the various services offered (e.g., ADAS calibration, module programming, key programming, etc.).

**Fields**

- **id** (int, PK)
- **service_name** (varchar(100)) - Must be unique
- **service_category** (enum: 'adas', 'airbag', 'immo', 'prog', 'diag') - Type of service

**Key Points**

- Basic service definitions.
- Required equipment is defined in the specialized `*_equipment_requirements` tables based on service and vehicle.
- Ties to `order_services` and `job_services` to indicate requested and assigned services.
- Service categories are strictly controlled via enum.

---

## 13. Equipment (equipment)

**Purpose:** A master list of all possible equipment/tools needed to perform services (e.g., cones, calibration plates, doppler, etc.).

**Fields**

- **id** (int, PK)
- **equipment_type** (enum: 'adas', 'airbag', 'immo', 'prog', 'diag') - Must be unique
- **model** (text)

**Key Points**

- Used in `van_equipment` to specify which van has which gear.
- Equipment requirements for specific services and vehicles are defined in the specialized `*_equipment_requirements` tables.
- Equipment types align with service categories for consistency.

---

## 14. Van Equipment (van_equipment)

**Purpose:** Indicates which equipment items are available in each service van.

**Fields**

- **van_id** (int, FK → vans.id)
- **equipment_id** (int, FK → equipment.id)
- **equipment_model** (text)

**Key Points**

- Has a composite primary key on (van_id, equipment_id).
- Includes the specific model of equipment in each van.

---

## 15. Customer Vehicles (customer_vehicles)

**Purpose:** Stores information about customer vehicles that can be serviced.

**Fields**

- **id** (int, PK)
- **vin** (varchar(17)) - Vehicle identification number, must be unique
- **make** (varchar(100))
- **year** (smallint)
- **model** (varchar)

**Key Points**

- Referenced by orders to identify which vehicle needs service
- Referenced by vans to identify service vehicles

---

## 16. YMM Reference (ymm_ref)

**Purpose:** Standardized reference table for year/make/model combinations used across the system.

**Fields**
- **ymm_id** (int, PK)
- **year** (smallint) NOT NULL
- **make** (varchar(50)) NOT NULL
- **model** (varchar(100)) NOT NULL
- Unique constraint on (year, make, model)

**Key Points**
- Used for vehicle identification across the system
- Provides consistent vehicle information for both customer vehicles and service vans
- Used by equipment requirements tables to determine required equipment for specific vehicles

---

## 17. Equipment Requirements Tables

The system uses separate tables for different types of equipment requirements, each following a similar structure but specialized for different service categories:

### ADAS Equipment Requirements (adas_equipment_requirements)

**Purpose:** Defines ADAS-specific equipment requirements for vehicle models and services.

**Fields**
- **id** (int, PK)
- **ymm_id** (int, FK → ymm_ref.ymm_id)
- **service_id** (int, FK → services.id)
- **equipment_model** (varchar(100)) NOT NULL
- **has_adas_service** (boolean) - Default: false
- Unique constraint on (ymm_id, service_id)

### Programming Equipment Requirements (prog_equipment_requirements)

**Purpose:** Defines programming-specific equipment requirements for vehicle models and services.

**Fields**
- **id** (int, PK)
- **ymm_id** (int, FK → ymm_ref.ymm_id)
- **service_id** (int, FK → services.id)
- **equipment_model** (text) NOT NULL - Default: 'prog'
- Unique constraint on (ymm_id, service_id)

### Immobilizer Equipment Requirements (immo_equipment_requirements)

**Purpose:** Defines immobilizer-specific equipment requirements for vehicle models and services.

**Fields**
- Same structure as prog_equipment_requirements
- equipment_model defaults to 'immo'

### Airbag Equipment Requirements (airbag_equipment_requirements)

**Purpose:** Defines airbag-specific equipment requirements for vehicle models and services.

**Fields**
- Same structure as prog_equipment_requirements
- equipment_model defaults to 'airbag'

### Diagnostic Equipment Requirements (diag_equipment_requirements)

**Purpose:** Defines diagnostic-specific equipment requirements for vehicle models and services.

**Fields**
- Same structure as prog_equipment_requirements
- equipment_model defaults to 'diag'

**Key Points for All Equipment Requirement Tables**
- Each table links vehicles and services to required equipment
- Used for scheduling and equipment allocation
- Helps determine if a specific van has the right equipment for a job
- Each maintains a unique constraint on (ymm_id, service_id)

---

## 18. Enums

The database uses several enum types to ensure data consistency:

1. **customer_type**
   - Values: 'residential', 'commercial', 'insurance'
   - Used in: users table

2. **job_status**
   - Values: 'pending_review', 'assigned', 'scheduled', 'pending_revisit', 'completed', 'cancelled'
   - Used in: jobs table

   - 'pending_review' - no van is equipped with the necessary equipment model
   - 'assigned' - a van is equipped with the necessary equipment model (for complex services) or type (for simple services) and a technician/van is assigned
   - 'scheduled' - a technician is assigned to the job and time is scheduled
   - 'pending_revisit' - a job wasn't completed and needs to be revisited
   - 'completed' - the job is completed
   - 'cancelled' - the job is cancelled

3. **service_category**
   - Values: 'adas', 'airbag', 'immo', 'prog', 'diag'
   - Used in: services table and equipment table

---

## 19. Schema Changes Summary

The database schema has been updated with the following changes:

1. **Terminology Standardization**:
   - Renamed "fleet vehicles" to "vans" throughout the schema
   - Renamed "vehicles" to "customer_vehicles" to clarify its purpose

2. **Service Structure**:
   - Updated the services table to use `service_category` instead of `service_slug`
   - Categories are standardized as: 'adas', 'airbag', 'immo', 'prog', 'diag'
   - Consolidated ADAS services information into the main services table
   - Removed the separate `adas_services` table
   - Removed `service_code` field from services table, using only id, service_name, and service_category
   - Removed the `service_equipment` table; service-equipment requirements are now directly defined in the specialized `*_equipment_requirements` tables.

3. **Vehicle Reference System**:
   - Renamed `adas_ymm_ref` to `ymm_ref` to support all vehicle types
   - This table now serves as a central reference for all vehicle year/make/model combinations

4. **Equipment Categorization**:
   - Renamed `equipment_name` to `equipment_type`
   - Equipment types now align with service categories for consistency
   - This allows for better filtering and organization of equipment

5. **Equipment Data Refinement**:
   - Renamed `equipment_model` to `adas_equipment_model` for clarity
   - Renamed `has_service` to `has_adas_service` to be more specific
   - Renamed `equipment_data` table to `equipment_requirements` for better clarity

6. **Relationship Updates**:
   - Updated all foreign key references to reflect the new table names
   - Maintained existing relationships while simplifying the schema

These changes improve the consistency and clarity of the database structure while reducing redundancy and making the system more maintainable.

