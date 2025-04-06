-- Create enum types
CREATE TYPE customer_type_enum AS ENUM ('insurance', 'commercial', 'residential');
CREATE TYPE job_status_enum AS ENUM ('pending_review', 'assigned', 'scheduled', 'pending_revisit', 'completed', 'cancelled');
CREATE TYPE service_category AS ENUM ('adas', 'airbag', 'immo', 'prog', 'diag');

-- Table: addresses
CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    street_address VARCHAR(255) NOT NULL,
    lat NUMERIC,
    lng NUMERIC
);

CREATE INDEX idx_addresses_coords ON addresses (lat, lng);

-- Table: customer_vehicles
CREATE TABLE customer_vehicles (
    id SERIAL PRIMARY KEY,
    vin VARCHAR(17) UNIQUE,
    make VARCHAR(100) NOT NULL,
    year SMALLINT,
    model VARCHAR(100)
);

-- Table: ymm_ref
CREATE TABLE ymm_ref (
    ymm_id SERIAL PRIMARY KEY,
    year SMALLINT NOT NULL,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    UNIQUE (year, make, model)
);

-- Table: users
CREATE TABLE users (
    id UUID PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(100),
    home_address_id INTEGER REFERENCES addresses(id) ON DELETE RESTRICT,
    is_admin BOOLEAN DEFAULT false,
    customer_type customer_type_enum NOT NULL,
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Table: user_addresses
CREATE TABLE user_addresses (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_id INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, address_id)
);

-- Table: vans
CREATE TABLE vans (
    id SERIAL PRIMARY KEY,
    last_service TIMESTAMPTZ,
    next_service TIMESTAMPTZ,
    vin VARCHAR(17) REFERENCES customer_vehicles(vin) ON UPDATE CASCADE
);

-- Table: technicians
CREATE TABLE technicians (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_van_id INTEGER REFERENCES vans(id) ON DELETE SET NULL,
    workload INTEGER CHECK (workload >= 0)
);

-- Table: equipment
CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    equipment_type service_category UNIQUE,
    model TEXT
);

-- Table: van_equipment
CREATE TABLE van_equipment (
    van_id INTEGER NOT NULL REFERENCES vans(id) ON DELETE CASCADE,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    equipment_model TEXT,
    PRIMARY KEY (van_id, equipment_id)
);

-- Table: services
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) UNIQUE NOT NULL,
    service_category service_category NOT NULL
);

-- Table: service_equipment
CREATE TABLE service_equipment (
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, equipment_id)
);

-- Table: adas_equipment_requirements
CREATE TABLE adas_equipment_requirements (
    id SERIAL PRIMARY KEY,
    ymm_id INTEGER NOT NULL REFERENCES ymm_ref(ymm_id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    adas_equipment_model VARCHAR(100) NOT NULL,
    has_adas_service BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (ymm_id, service_id)
);

-- Table: orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    vehicle_id INTEGER REFERENCES customer_vehicles(id) ON DELETE RESTRICT,
    repair_order_number VARCHAR(50),
    address_id INTEGER REFERENCES addresses(id) ON DELETE RESTRICT,
    earliest_available_time TIMESTAMPTZ,
    notes TEXT,
    invoice INTEGER
);

-- Table: order_services
CREATE TABLE order_services (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (order_id, service_id)
);

-- Table: order_uploads
CREATE TABLE order_uploads (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: jobs
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
    assigned_technician INTEGER REFERENCES technicians(id) ON DELETE RESTRICT,
    address_id INTEGER REFERENCES addresses(id) ON DELETE RESTRICT,
    priority INTEGER CHECK (priority >= 0),
    status job_status_enum NOT NULL,
    requested_time TIMESTAMPTZ,
    estimated_sched TIMESTAMPTZ,
    job_duration INTEGER CHECK (job_duration > 0),
    notes TEXT
);

CREATE INDEX idx_jobs_estimated_sched ON jobs (estimated_sched);
CREATE INDEX idx_jobs_status ON jobs (status);

-- Table: job_services
CREATE TABLE job_services (
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, service_id)
);

-- Table: keys
CREATE TABLE keys (
    sku_id VARCHAR(50) PRIMARY KEY,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    min_quantity INTEGER NOT NULL CHECK (min_quantity >= 0),
    part_number VARCHAR(50),
    purchase_price NUMERIC,
    sale_price NUMERIC,
    supplier VARCHAR(100),
    fcc_id VARCHAR(50)
);

-- Add comments to tables
COMMENT ON TABLE users IS 'Stores all user accounts in the system, including customers, admins, and technicians';
COMMENT ON TABLE technicians IS 'Extends the Users table for technician-specific details, including which van they drive and their current workload';
COMMENT ON TABLE vans IS 'Represents each service van in the fleet. Basic info includes last/next service dates';
COMMENT ON TABLE addresses IS 'Standardizes location information (street addresses plus coordinates) used by orders, users, and jobs for routing';
COMMENT ON TABLE user_addresses IS 'A many-to-many link between Users and Addresses, so one user can have multiple addresses, and one address can belong to multiple users';
COMMENT ON TABLE orders IS 'Records a customer''s service request (an order). An order may be split into multiple jobs if needed';
COMMENT ON TABLE order_services IS 'A junction table listing which services the customer requested for a particular order';
COMMENT ON TABLE order_uploads IS 'Tracks file uploads associated with an order';
COMMENT ON TABLE jobs IS 'Represents an individual work assignment that can be scheduled and dispatched to a single technician';
COMMENT ON TABLE job_services IS 'Links each job to the specific services it will perform';
COMMENT ON TABLE keys IS 'Tracks inventory of car key blanks and related key parts for immobilizer jobs';
COMMENT ON TABLE services IS 'Defines the various services offered (e.g., ADAS calibration, module programming, key programming, etc.)';
COMMENT ON TABLE service_equipment IS 'Defines which equipment items are required for a given service';
COMMENT ON TABLE equipment IS 'A master list of all possible equipment/tools needed to perform services';
COMMENT ON TABLE van_equipment IS 'Indicates which equipment items are available in each service van';
COMMENT ON TABLE customer_vehicles IS 'Stores information about customer vehicles that can be serviced';
COMMENT ON TABLE ymm_ref IS 'Standardized reference table for year/make/model combinations used across the system';
COMMENT ON TABLE adas_equipment_requirements IS 'Defines what equipment is required for specific vehicle models and services'; 

-- job_status_enum
-- 'pending_review' - no van is equipped with the necessary equipment model
-- 'assigned' - a van is equipped with the necessary equipment model (for complex services) or type (for simple services) and a technician/van is assigned
-- 'scheduled' - a technician is assigned to the job and time is scheduled
-- 'pending_revisit' - a job wasn't completed and needs to be revisited
-- 'completed' - the job is completed
-- 'cancelled' - the job is cancelled