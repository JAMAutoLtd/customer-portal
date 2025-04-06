                                                              schema_output                                                              
-----------------------------------------------------------------------------------------------------------------------------------------
 -- Generated Schema                                                                                                                    +
                                                                                                                                        +
 -- Create enum types                                                                                                                   +
 CREATE TYPE customer_type AS ENUM ('residential', 'commercial', 'insurance');                                                          +
 CREATE TYPE job_status AS ENUM ('pending_review', 'assigned', 'scheduled', 'pending_revisit', 'completed', 'cancelled');               +
 CREATE TYPE service_category AS ENUM ('adas', 'airbag', 'immo', 'prog', 'diag');                                                       +
                                                                                                                                        +
 -- Create sequences                                                                                                                    +
 CREATE SEQUENCE IF NOT EXISTS adas_equipment_data_id_seq;                                                                              +
 CREATE SEQUENCE IF NOT EXISTS adas_ymm_ref_ymm_id_seq;                                                                                 +
 CREATE SEQUENCE IF NOT EXISTS addresses_id_seq;                                                                                        +
 CREATE SEQUENCE IF NOT EXISTS diag_equipment_requirements_id_seq;                                                                      +
 CREATE SEQUENCE IF NOT EXISTS equipment_id_seq;                                                                                        +
 CREATE SEQUENCE IF NOT EXISTS fleet_vehicles_id_seq;                                                                                   +
 CREATE SEQUENCE IF NOT EXISTS jobs_id_seq;                                                                                             +
 CREATE SEQUENCE IF NOT EXISTS order_uploads_id_seq;                                                                                    +
 CREATE SEQUENCE IF NOT EXISTS orders_id_seq;                                                                                           +
 CREATE SEQUENCE IF NOT EXISTS prog_equipment_requirements_id_seq;                                                                      +
 CREATE SEQUENCE IF NOT EXISTS services_id_seq;                                                                                         +
 CREATE SEQUENCE IF NOT EXISTS technicians_id_seq;                                                                                      +
 CREATE SEQUENCE IF NOT EXISTS vehicles_id_seq;                                                                                         +
                                                                                                                                        +
 -- Create tables                                                                                                                       +
 CREATE TABLE adas_equipment_requirements (\n    id integer PRIMARY KEY DEFAULT nextval('adas_equipment_data_id_seq'::regclass),        +
     ymm_id integer NOT NULL,                                                                                                           +
     service_id integer NOT NULL,                                                                                                       +
     equipment_model character varying(100) NOT NULL,                                                                                   +
     has_adas_service boolean NOT NULL DEFAULT false,                                                                                   +
     UNIQUE (ymm_id, service_id),                                                                                                       +
     FOREIGN KEY (service_id) REFERENCES services(id),                                                                                  +
     FOREIGN KEY (ymm_id) REFERENCES ymm_ref(ymm_id)                                                                                    +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE addresses (\n    id integer PRIMARY KEY DEFAULT nextval('addresses_id_seq'::regclass),                                    +
     street_address character varying(255) NOT NULL,                                                                                    +
     lat numeric(9,6),                                                                                                                  +
     lng numeric(9,6)                                                                                                                   +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE airbag_equipment_requirements (\n    id integer PRIMARY KEY DEFAULT nextval('adas_equipment_data_id_seq'::regclass),      +
     ymm_id integer NOT NULL,                                                                                                           +
     service_id integer NOT NULL,                                                                                                       +
     equipment_model text NOT NULL DEFAULT 'airbag'::text,                                                                              +
     UNIQUE (ymm_id, service_id),                                                                                                       +
     FOREIGN KEY (service_id) REFERENCES services(id),                                                                                  +
     FOREIGN KEY (ymm_id) REFERENCES ymm_ref(ymm_id)                                                                                    +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE customer_vehicles (\n    id integer PRIMARY KEY DEFAULT nextval('vehicles_id_seq'::regclass),                             +
     vin character varying(17),                                                                                                         +
     make character varying(100) NOT NULL,                                                                                              +
     year smallint,                                                                                                                     +
     model character varying,                                                                                                           +
     UNIQUE (vin)                                                                                                                       +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE diag_equipment_requirements (\n    id integer PRIMARY KEY DEFAULT nextval('diag_equipment_requirements_id_seq'::regclass),+
     ymm_id integer NOT NULL,                                                                                                           +
     service_id integer NOT NULL,                                                                                                       +
     equipment_model text NOT NULL DEFAULT 'diag'::text,                                                                                +
     UNIQUE (ymm_id, service_id),                                                                                                       +
     FOREIGN KEY (ymm_id) REFERENCES ymm_ref(ymm_id),                                                                                   +
     FOREIGN KEY (service_id) REFERENCES services(id)                                                                                   +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE equipment (\n    id integer PRIMARY KEY DEFAULT nextval('equipment_id_seq'::regclass),                                    +
     model text,                                                                                                                        +
     equipment_type service_category                                                                                                    +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE immo_equipment_requirements (\n    id integer PRIMARY KEY DEFAULT nextval('adas_equipment_data_id_seq'::regclass),        +
     ymm_id integer NOT NULL,                                                                                                           +
     service_id integer NOT NULL,                                                                                                       +
     equipment_model text NOT NULL DEFAULT 'immo'::text,                                                                                +
     UNIQUE (ymm_id, service_id),                                                                                                       +
     FOREIGN KEY (service_id) REFERENCES services(id),                                                                                  +
     FOREIGN KEY (ymm_id) REFERENCES ymm_ref(ymm_id)                                                                                    +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE job_services (\n    job_id integer NOT NULL,                                                                              +
     service_id integer NOT NULL,                                                                                                       +
     PRIMARY KEY (job_id, service_id),                                                                                                  +
     FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,                                                                        +
     FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE                                                                 +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE jobs (\n    id integer PRIMARY KEY DEFAULT nextval('jobs_id_seq'::regclass),                                              +
     order_id integer,                                                                                                                  +
     assigned_technician integer,                                                                                                       +
     address_id integer,                                                                                                                +
     priority integer,                                                                                                                  +
     status job_status NOT NULL,                                                                                                        +
     requested_time timestamp with time zone,                                                                                           +
     estimated_sched timestamp with time zone,                                                                                          +
     job_duration integer,                                                                                                              +
     notes text,                                                                                                                        +
     CHECK ((job_duration > 0)),                                                                                                        +
     CHECK ((priority >= 0)),                                                                                                           +
     FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,                                                                   +
     FOREIGN KEY (assigned_technician) REFERENCES technicians(id) ON DELETE RESTRICT,                                                   +
     FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE RESTRICT                                                               +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE keys (\n    sku_id character varying(50) PRIMARY KEY,                                                                     +
     quantity integer NOT NULL,                                                                                                         +
     min_quantity integer NOT NULL,                                                                                                     +
     part_number character varying(50),                                                                                                 +
     purchase_price numeric(10,2),                                                                                                      +
     sale_price numeric(10,2),                                                                                                          +
     supplier character varying(100),                                                                                                   +
     fcc_id character varying(50),                                                                                                      +
     CHECK ((min_quantity >= 0)),                                                                                                       +
     CHECK ((quantity >= 0))                                                                                                            +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE order_services (\n    order_id integer NOT NULL,                                                                          +
     service_id integer NOT NULL,                                                                                                       +
     PRIMARY KEY (order_id, service_id),                                                                                                +
     FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,                                                                    +
     FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE                                                                 +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE order_uploads (\n    id integer PRIMARY KEY DEFAULT nextval('order_uploads_id_seq'::regclass),                            +
     order_id integer,                                                                                                                  +
     file_name character varying(255) NOT NULL,                                                                                         +
     file_type character varying(100),                                                                                                  +
     file_url text NOT NULL,                                                                                                            +
     uploaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,                                                                    +
     FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE                                                                     +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE orders (\n    id integer PRIMARY KEY DEFAULT nextval('orders_id_seq'::regclass),                                          +
     user_id uuid,                                                                                                                      +
     vehicle_id integer,                                                                                                                +
     repair_order_number character varying(50),                                                                                         +
     address_id integer,                                                                                                                +
     earliest_available_time timestamp with time zone,                                                                                  +
     notes text,                                                                                                                        +
     invoice integer,                                                                                                                   +
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,                                                                     +
     FOREIGN KEY (vehicle_id) REFERENCES customer_vehicles(id) ON DELETE RESTRICT,                                                      +
     FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE RESTRICT                                                               +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE prog_equipment_requirements (\n    id integer PRIMARY KEY DEFAULT nextval('prog_equipment_requirements_id_seq'::regclass),+
     ymm_id integer NOT NULL,                                                                                                           +
     service_id integer NOT NULL,                                                                                                       +
     equipment_model text NOT NULL DEFAULT 'prog'::text,                                                                                +
     UNIQUE (ymm_id, service_id),                                                                                                       +
     FOREIGN KEY (ymm_id) REFERENCES ymm_ref(ymm_id),                                                                                   +
     FOREIGN KEY (service_id) REFERENCES services(id)                                                                                   +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE services (\n    id integer PRIMARY KEY DEFAULT nextval('services_id_seq'::regclass),                                      +
     service_name character varying(100) NOT NULL,                                                                                      +
     slug text,                                                                                                                         +
     service_category service_category,                                                                                                 +
     UNIQUE (service_name)                                                                                                              +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE technicians (\n    id integer PRIMARY KEY DEFAULT nextval('technicians_id_seq'::regclass),                                +
     user_id uuid,                                                                                                                      +
     assigned_van_id integer,                                                                                                           +
     workload integer,                                                                                                                  +
     CHECK ((workload >= 0)),                                                                                                           +
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,                                                                     +
     FOREIGN KEY (assigned_van_id) REFERENCES vans(id) ON DELETE SET NULL                                                               +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE user_addresses (\n    user_id uuid NOT NULL,                                                                              +
     address_id integer NOT NULL,                                                                                                       +
     PRIMARY KEY (user_id, address_id),                                                                                                 +
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,                                                                      +
     FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE CASCADE                                                                +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE users (\n    id uuid NOT NULL,                                                                                            +
     full_name character varying(100) NOT NULL,                                                                                         +
     phone character varying(100),                                                                                                      +
     home_address_id integer,                                                                                                           +
     is_admin boolean DEFAULT false,                                                                                                    +
     customer_type customer_type NOT NULL,                                                                                              +
     PRIMARY KEY (id, id),                                                                                                              +
     FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,                                                                      +
     FOREIGN KEY (home_address_id) REFERENCES addresses(id) ON DELETE RESTRICT                                                          +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE van_equipment (\n    fleet_vehicle_id integer NOT NULL,                                                                   +
     equipment_id integer NOT NULL,                                                                                                     +
     PRIMARY KEY (fleet_vehicle_id, equipment_id),                                                                                      +
     FOREIGN KEY (fleet_vehicle_id) REFERENCES vans(id) ON DELETE CASCADE,                                                              +
     FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE                                                              +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE vans (\n    id integer PRIMARY KEY DEFAULT nextval('fleet_vehicles_id_seq'::regclass),                                    +
     last_service timestamp with time zone,                                                                                             +
     next_service timestamp with time zone,                                                                                             +
     vin character varying,                                                                                                             +
     FOREIGN KEY (vin) REFERENCES customer_vehicles(vin) ON UPDATE CASCADE                                                              +
 );                                                                                                                                     +
                                                                                                                                        +
 CREATE TABLE ymm_ref (\n    ymm_id integer PRIMARY KEY DEFAULT nextval('adas_ymm_ref_ymm_id_seq'::regclass),                           +
     year smallint NOT NULL,                                                                                                            +
     make character varying(50) NOT NULL,                                                                                               +
     model character varying(100) NOT NULL,                                                                                             +
     UNIQUE (year, make, model)                                                                                                         +
 );                                                                                                                                     +
                                                                                                                                        +
 -- Create indexes                                                                                                                      +
 CREATE INDEX idx_addresses_coords ON addresses (lat, lng);                                                                             +
 CREATE INDEX idx_jobs_status ON jobs (status);                                                                                         +
 CREATE INDEX idx_jobs_estimated_sched ON jobs (estimated_sched);                                                                       +
                                                                                                                                        +
 -- Add table comments                                                                                                                  +
 COMMENT ON TABLE airbag_equipment_requirements IS 'This is a duplicate of immo_equipment_requirements';                                +
 COMMENT ON TABLE immo_equipment_requirements IS 'This is a duplicate of adas_equipment_requirements';
(1 row)

