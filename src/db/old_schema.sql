                                                         create_statement                                                         
----------------------------------------------------------------------------------------------------------------------------------
 -- Table: adas_equipment_data                                                                                                   +
 CREATE TABLE IF NOT EXISTS adas_equipment_data (                                                                                +
     id integer NOT NULL DEFAULT nextval('adas_equipment_data_id_seq'::regclass),                                                +
     ymm_id integer NOT NULL,                                                                                                    +
     service_id integer NOT NULL,                                                                                                +
     equipment_model character varying(100) NOT NULL,                                                                            +
     has_service boolean NOT NULL DEFAULT false,                                                                                 +
     UNIQUE (ymm_id, service_id),                                                                                                +
     PRIMARY KEY (id),                                                                                                           +
     FOREIGN KEY (service_id) REFERENCES adas_services(service_id),                                                              +
     FOREIGN KEY (ymm_id) REFERENCES adas_ymm_ref(ymm_id)                                                                        +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX adas_equipment_data_pkey ON public.adas_equipment_data USING btree (id);                                    +
 CREATE UNIQUE INDEX adas_equipment_data_ymm_id_service_id_key ON public.adas_equipment_data USING btree (ymm_id, service_id);   +
 
 -- Table: adas_services                                                                                                         +
 CREATE TABLE IF NOT EXISTS adas_services (                                                                                      +
     service_id integer NOT NULL DEFAULT nextval('adas_services_service_id_seq'::regclass),                                      +
     service_code character varying(30) NOT NULL,                                                                                +
     service_name character varying(100) NOT NULL,                                                                               +
     UNIQUE (service_code),                                                                                                      +
     PRIMARY KEY (service_id)                                                                                                    +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX adas_services_pkey ON public.adas_services USING btree (service_id);                                        +
 CREATE UNIQUE INDEX adas_services_service_code_key ON public.adas_services USING btree (service_code);                          +
 
 -- Table: adas_ymm_ref                                                                                                          +
 CREATE TABLE IF NOT EXISTS adas_ymm_ref (                                                                                       +
     ymm_id integer NOT NULL DEFAULT nextval('adas_ymm_ref_ymm_id_seq'::regclass),                                               +
     year smallint NOT NULL,                                                                                                     +
     make character varying(50) NOT NULL,                                                                                        +
     model character varying(100) NOT NULL,                                                                                      +
     UNIQUE (year, make, model),                                                                                                 +
     PRIMARY KEY (ymm_id)                                                                                                        +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX adas_ymm_ref_pkey ON public.adas_ymm_ref USING btree (ymm_id);                                              +
 CREATE UNIQUE INDEX adas_ymm_ref_year_make_model_key ON public.adas_ymm_ref USING btree (year, make, model);                    +
 
 -- Table: addresses                                                                                                             +
 CREATE TABLE IF NOT EXISTS addresses (                                                                                          +
     id integer NOT NULL DEFAULT nextval('addresses_id_seq'::regclass),                                                          +
     street_address character varying(255) NOT NULL,                                                                             +
     lat numeric,                                                                                                                +
     lng numeric,                                                                                                                +
     PRIMARY KEY (id)                                                                                                            +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX addresses_pkey ON public.addresses USING btree (id);                                                        +
 CREATE INDEX idx_addresses_coords ON public.addresses USING btree (lat, lng);                                                   +
 
 -- Table: equipment                                                                                                             +
 CREATE TABLE IF NOT EXISTS equipment (                                                                                          +
     id integer NOT NULL DEFAULT nextval('equipment_id_seq'::regclass),                                                          +
     equipment_type enum('adas', 'airbag', 'immo', 'prog', 'diag') NOT NULL,                                                     +
     model text,                                                                                                                 +
     UNIQUE (equipment_type),                                                                                                    +
     PRIMARY KEY (id)                                                                                                            +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX equipment_equipment_type_key ON public.equipment USING btree (equipment_type);                              +
 CREATE UNIQUE INDEX equipment_pkey ON public.equipment USING btree (id);                                                        +
 
 -- Table: fleet_vehicle_equipment                                                                                               +
 CREATE TABLE IF NOT EXISTS fleet_vehicle_equipment (                                                                            +
     fleet_vehicle_id integer NOT NULL,                                                                                          +
     equipment_id integer NOT NULL,                                                                                              +
     equipment_model text,                                                                                                       +
     PRIMARY KEY (fleet_vehicle_id, equipment_id),                                                                               +
     FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,                                                      +
     FOREIGN KEY (fleet_vehicle_id) REFERENCES fleet_vehicles(id) ON DELETE CASCADE                                              +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX fleet_vehicle_equipment_pkey ON public.fleet_vehicle_equipment USING btree (fleet_vehicle_id, equipment_id);+
 
 -- Table: fleet_vehicles                                                                                                        +
 CREATE TABLE IF NOT EXISTS fleet_vehicles (                                                                                     +
     id integer NOT NULL DEFAULT nextval('fleet_vehicles_id_seq'::regclass),                                                     +
     last_service timestamp with time zone,                                                                                      +
     next_service timestamp with time zone,                                                                                      +
     vin character varying,                                                                                                      +
     PRIMARY KEY (id),                                                                                                           +
     FOREIGN KEY (vin) REFERENCES vehicles(vin) ON UPDATE CASCADE                                                                +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX fleet_vehicles_pkey ON public.fleet_vehicles USING btree (id);                                              +
 
 -- Table: job_services                                                                                                          +
 CREATE TABLE IF NOT EXISTS job_services (                                                                                       +
     job_id integer NOT NULL,                                                                                                    +
     service_id integer NOT NULL,                                                                                                +
     PRIMARY KEY (job_id, service_id),                                                                                           +
     FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,                                                                 +
     FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE                                                          +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX job_services_pkey ON public.job_services USING btree (job_id, service_id);                                  +
 
 -- Table: jobs                                                                                                                  +
 CREATE TABLE IF NOT EXISTS jobs (                                                                                               +
     id integer NOT NULL DEFAULT nextval('jobs_id_seq'::regclass),                                                               +
     order_id integer,                                                                                                           +
     assigned_technician integer,                                                                                                +
     address_id integer,                                                                                                         +
     priority integer,                                                                                                           +
     status USER-DEFINED NOT NULL,                                                                                               +
     requested_time timestamp with time zone,                                                                                    +
     estimated_sched timestamp with time zone,                                                                                   +
     job_duration integer,                                                                                                       +
     notes text,                                                                                                                 +
     PRIMARY KEY (id),                                                                                                           +
     FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE RESTRICT,                                                       +
     FOREIGN KEY (assigned_technician) REFERENCES technicians(id) ON DELETE RESTRICT,                                            +
     FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,                                                            +
     CHECK ((job_duration > 0)),                                                                                                 +
     CHECK ((priority >= 0))                                                                                                     +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE INDEX idx_jobs_estimated_sched ON public.jobs USING btree (estimated_sched);                                             +
 CREATE INDEX idx_jobs_status ON public.jobs USING btree (status);                                                               +
 CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id);                                                                  +
 
 -- Table: keys                                                                                                                  +
 CREATE TABLE IF NOT EXISTS keys (                                                                                               +
     sku_id character varying(50) NOT NULL,                                                                                      +
     quantity integer NOT NULL,                                                                                                  +
     min_quantity integer NOT NULL,                                                                                              +
     part_number character varying(50),                                                                                          +
     purchase_price numeric,                                                                                                     +
     sale_price numeric,                                                                                                         +
     supplier character varying(100),                                                                                            +
     fcc_id character varying(50),                                                                                               +
     PRIMARY KEY (sku_id),                                                                                                       +
     CHECK ((min_quantity >= 0)),                                                                                                +
     CHECK ((quantity >= 0))                                                                                                     +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX keys_pkey ON public.keys USING btree (sku_id);                                                              +
 
 -- Table: order_services                                                                                                        +
 CREATE TABLE IF NOT EXISTS order_services (                                                                                     +
     order_id integer NOT NULL,                                                                                                  +
     service_id integer NOT NULL,                                                                                                +
     PRIMARY KEY (order_id, service_id),                                                                                         +
     FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,                                                             +
     FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE                                                          +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX order_services_pkey ON public.order_services USING btree (order_id, service_id);                            +
 
 -- Table: order_uploads                                                                                                         +
 CREATE TABLE IF NOT EXISTS order_uploads (                                                                                      +
     id integer NOT NULL DEFAULT nextval('order_uploads_id_seq'::regclass),                                                      +
     order_id integer,                                                                                                           +
     file_name character varying(255) NOT NULL,                                                                                  +
     file_type character varying(100),                                                                                           +
     file_url text NOT NULL,                                                                                                     +
     uploaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,                                                             +
     PRIMARY KEY (id),                                                                                                           +
     FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE                                                              +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX order_uploads_pkey ON public.order_uploads USING btree (id);                                                +
 
 -- Table: orders                                                                                                                +
 CREATE TABLE IF NOT EXISTS orders (                                                                                             +
     id integer NOT NULL DEFAULT nextval('orders_id_seq'::regclass),                                                             +
     user_id uuid,                                                                                                               +
     vehicle_id integer,                                                                                                         +
     repair_order_number character varying(50),                                                                                  +
     address_id integer,                                                                                                         +
     earliest_available_time timestamp with time zone,                                                                           +
     notes text,                                                                                                                 +
     invoice integer,                                                                                                            +
     PRIMARY KEY (id),                                                                                                           +
     FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE RESTRICT,                                                       +
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,                                                              +
     FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT                                                         +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id);                                                              +
 
 -- Table: service_equipment                                                                                                     +
 CREATE TABLE IF NOT EXISTS service_equipment (                                                                                  +
     service_id integer NOT NULL,                                                                                                +
     equipment_id integer NOT NULL,                                                                                              +
     PRIMARY KEY (service_id, equipment_id),                                                                                     +
     FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,                                                      +
     FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE                                                          +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX service_equipment_pkey ON public.service_equipment USING btree (service_id, equipment_id);                  +
 
 -- Table: services                                                                                                              +
 CREATE TABLE IF NOT EXISTS services (                                                                                           +
     id integer NOT NULL DEFAULT nextval('services_id_seq'::regclass),                                                           +
     service_name character varying(100) NOT NULL,                                                                               +
     service_category enum('adas', 'airbag', 'immo', 'prog', 'diag') NOT NULL,                                                   +
     UNIQUE (service_name),                                                                                                      +
     PRIMARY KEY (id)                                                                                                            +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);                                                          +
 CREATE UNIQUE INDEX services_service_name_key ON public.services USING btree (service_name);                                    +
 
 -- Table: technicians                                                                                                           +
 CREATE TABLE IF NOT EXISTS technicians (                                                                                        +
     id integer NOT NULL DEFAULT nextval('technicians_id_seq'::regclass),                                                        +
     user_id uuid,                                                                                                               +
     assigned_van_id integer,                                                                                                    +
     workload integer,                                                                                                           +
     PRIMARY KEY (id),                                                                                                           +
     FOREIGN KEY (assigned_van_id) REFERENCES vans(id) ON DELETE SET NULL,                                                         +
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,                                                              +
     CHECK ((workload >= 0))                                                                                                     +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX technicians_pkey ON public.technicians USING btree (id);                                                    +
 
 -- Table: user_addresses                                                                                                        +
 CREATE TABLE IF NOT EXISTS user_addresses (                                                                                     +
     user_id uuid NOT NULL,                                                                                                      +
     address_id integer NOT NULL,                                                                                                +
     PRIMARY KEY (user_id, address_id),                                                                                          +
     FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE CASCADE,                                                        +
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE                                                                +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX user_addresses_pkey ON public.user_addresses USING btree (user_id, address_id);                             +
 
 -- Table: users                                                                                                                 +
 CREATE TABLE IF NOT EXISTS users (                                                                                              +
     id uuid NOT NULL,                                                                                                           +
     full_name character varying(100) NOT NULL,                                                                                  +
     phone character varying(100),                                                                                               +
     home_address_id integer,                                                                                                    +
     is_admin boolean DEFAULT false,                                                                                             +
     customer_type USER-DEFINED NOT NULL,                                                                                        +
     PRIMARY KEY (id),                                                                                                           +
     FOREIGN KEY (home_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,                                                  +
     FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE                                                                +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);                                                                +
 
 -- Table: vehicles                                                                                                              +
 CREATE TABLE IF NOT EXISTS vehicles (                                                                                           +
     id integer NOT NULL DEFAULT nextval('vehicles_id_seq'::regclass),                                                           +
     vin character varying(17),                                                                                                  +
     make character varying(100) NOT NULL,                                                                                       +
     year smallint,                                                                                                              +
     model character varying,                                                                                                    +
     UNIQUE (vin),                                                                                                               +
     PRIMARY KEY (id)                                                                                                            +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX vehicles_pkey ON public.vehicles USING btree (id);                                                          +
 CREATE UNIQUE INDEX vehicles_vin_key ON public.vehicles USING btree (vin);                                                      +
 
 -- Table: vans                                                                                                                  +
 CREATE TABLE IF NOT EXISTS vans (                                                                                               +
     id integer NOT NULL DEFAULT nextval('vans_id_seq'::regclass),                                                                 +
     last_service timestamp with time zone,                                                                                        +
     next_service timestamp with time zone,                                                                                        +
     vin character varying,                                                                                                        +
     PRIMARY KEY (id),                                                                                                             +
     FOREIGN KEY (vin) REFERENCES customer_vehicles(vin) ON UPDATE CASCADE                                                          +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX vans_pkey ON public.vans USING btree (id);                                                                      +
 
 -- Table: customer_vehicles                                                                                                     +
 CREATE TABLE IF NOT EXISTS customer_vehicles (                                                                                   +
     id integer NOT NULL DEFAULT nextval('customer_vehicles_id_seq'::regclass),                                                     +
     vin character varying(17),                                                                                                     +
     make character varying(100) NOT NULL,                                                                                           +
     year smallint,                                                                                                                 +
     model character varying,                                                                                                         +
     UNIQUE (vin),                                                                                                                   +
     PRIMARY KEY (id)                                                                                                                 +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX customer_vehicles_pkey ON public.customer_vehicles USING btree (id);                                               +
 CREATE UNIQUE INDEX customer_vehicles_vin_key ON public.customer_vehicles USING btree (vin);                                             +
 
 -- Table: van_equipment                                                                                                         +
 CREATE TABLE IF NOT EXISTS van_equipment (                                                                                       +
     van_id integer NOT NULL,                                                                                                     +
     equipment_id integer NOT NULL,                                                                                                 +
     equipment_model text,                                                                                                           +
     PRIMARY KEY (van_id, equipment_id),                                                                                             +
     FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,                                                          +
     FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE CASCADE                                                                      +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX van_equipment_pkey ON public.van_equipment USING btree (van_id, equipment_id);                                       +
 
 -- Table: ymm_ref                                                                                                               +
 CREATE TABLE IF NOT EXISTS ymm_ref (                                                                                               +
     ymm_id integer NOT NULL DEFAULT nextval('ymm_ref_ymm_id_seq'::regclass),                                                           +
     year smallint NOT NULL,                                                                                                             +
     make character varying(50) NOT NULL,                                                                                                +
     model character varying(100) NOT NULL,                                                                                               +
     UNIQUE (year, make, model),                                                                                                             +
     PRIMARY KEY (ymm_id)                                                                                                                   +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX ymm_ref_pkey ON public.ymm_ref USING btree (ymm_id);                                                                   +
 CREATE UNIQUE INDEX ymm_ref_year_make_model_key ON public.ymm_ref USING btree (year, make, model);                                         +
 
 -- Table: equipment_requirements                                                                                                 +
 CREATE TABLE IF NOT EXISTS equipment_requirements (                                                                                   +
     id integer NOT NULL DEFAULT nextval('equipment_requirements_id_seq'::regclass),                                                     +
     ymm_id integer NOT NULL,                                                                                                               +
     service_id integer NOT NULL,                                                                                                               +
     adas_equipment_model character varying(100) NOT NULL,                                                                                   +
     has_adas_service boolean NOT NULL DEFAULT false,                                                                                      +
     UNIQUE (ymm_id, service_id),                                                                                                               +
     PRIMARY KEY (id),                                                                                                                       +
     FOREIGN KEY (service_id) REFERENCES services(id),                                                                                     +
     FOREIGN KEY (ymm_id) REFERENCES ymm_ref(ymm_id)                                                                                       +
 );                                                                                                                              +
                                                                                                                                 +
 CREATE UNIQUE INDEX equipment_requirements_pkey ON public.equipment_requirements USING btree (id);                                           +
 CREATE UNIQUE INDEX equipment_requirements_ymm_id_service_id_key ON public.equipment_requirements USING btree (ymm_id, service_id);             +
 
(19 rows)

