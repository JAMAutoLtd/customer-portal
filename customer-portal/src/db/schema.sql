CREATE TYPE customer_type AS ENUM ('residential', 'commercial', 'insurance');
CREATE TYPE job_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');

CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    street_address VARCHAR(255) NOT NULL,
    lat DECIMAL(9,6),
    lng DECIMAL(9,6)
);

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(100),
    home_address_id INTEGER REFERENCES addresses(id) ON DELETE RESTRICT,
    is_admin BOOLEAN DEFAULT FALSE,
    customer_type customer_type NOT NULL
);

CREATE TABLE fleet_vehicles (
    id SERIAL PRIMARY KEY,
    last_service TIMESTAMP WITH TIME ZONE,
    next_service TIMESTAMP WITH TIME ZONE
);

CREATE TABLE technicians (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    assigned_van_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
    workload INTEGER CHECK (workload >= 0)
);

CREATE TABLE user_addresses (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    address_id INTEGER REFERENCES addresses(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, address_id)
);

CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY,
    vin VARCHAR(17) UNIQUE,
    ymm VARCHAR(100) NOT NULL
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE RESTRICT,
    repair_order_number VARCHAR(50),
    address_id INTEGER REFERENCES addresses(id) ON DELETE RESTRICT,
    earliest_available_time TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    invoice INTEGER
);

CREATE TABLE order_uploads (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_url TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE order_services (
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (order_id, service_id)
);

CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
    assigned_technician INTEGER REFERENCES technicians(id) ON DELETE RESTRICT,
    address_id INTEGER REFERENCES addresses(id) ON DELETE RESTRICT,
    priority INTEGER CHECK (priority >= 0),
    status job_status NOT NULL,
    requested_time TIMESTAMP WITH TIME ZONE,
    estimated_sched TIMESTAMP WITH TIME ZONE,
    job_duration INTEGER CHECK (job_duration > 0),
    notes TEXT
);

CREATE TABLE job_services (
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, service_id)
);

CREATE TABLE keys (
    sku_id VARCHAR(50) PRIMARY KEY,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    min_quantity INTEGER NOT NULL CHECK (min_quantity >= 0),
    part_number VARCHAR(50),
    purchase_price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    supplier VARCHAR(100),
    fcc_id VARCHAR(50)
);

CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    equipment_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE service_equipment (
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, equipment_id)
);

CREATE TABLE fleet_vehicle_equipment (
    fleet_vehicle_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
    equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
    PRIMARY KEY (fleet_vehicle_id, equipment_id)
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_estimated_sched ON jobs(estimated_sched);
CREATE INDEX idx_addresses_coords ON addresses(lat, lng);