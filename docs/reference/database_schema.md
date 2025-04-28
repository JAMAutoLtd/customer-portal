# Database Schema Reference

This document outlines the structure of the Supabase database defined in `schema.sql`.

## Custom Types (ENUMs)

### `availability_exception_type`

*   `time_off`
*   `custom_hours`

### `customer_type`

*   `residential`
*   `commercial`
*   `insurance`

### `job_status`

*   `pending_review`
*   `queued`
*   `en_route`
*   `pending_revisit`
*   `fixed_time`
*   `completed`
*   `cancelled`
*   `paid`
*   `in_progress`

### `service_category`

*   `adas`
*   `airbag`
*   `immo`
*   `prog`
*   `diag`

## Tables

### `adas_equipment_requirements`

| Column Name        | Type           | Nullable | Default         | Constraints        |
| :----------------- | :------------- | :------- | :-------------- | :----------------- |
| id                 | integer        | NO       | nextval(...)    | PK                 |
| ymm_id             | integer        | NO       |                 | FK -> ymm_ref(ymm_id) |
| service_id         | integer        | NO       |                 | FK -> services(id) |
| equipment_model    | varchar(100)   | NO       |                 |                    |
| has_adas_service | boolean        | NO       | false           |                    |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `ymm_id` -> `ymm_ref(ymm_id)`
    *   `service_id` -> `services(id)`
*   **Unique Constraints:**
    *   `adas_equipment_data_ymm_id_service_id_key`: (`ymm_id`, `service_id`)

### `ymm_ref`

| Column Name | Type         | Nullable | Default      | Constraints |
| :---------- | :----------- | :------- | :----------- | :---------- |
| ymm_id      | integer      | NO       | nextval(...) | PK          |
| year        | smallint     | NO       |              |             |
| make        | varchar(50)  | NO       |              |             |
| model       | varchar(100) | NO       |              |             |

*   **Primary Key:** `(ymm_id)`
*   **Unique Constraints:**
    *   `adas_ymm_ref_year_make_model_key`: (`year`, `make`, `model`)

### `addresses`

| Column Name    | Type         | Nullable | Default      | Constraints |
| :------------- | :----------- | :------- | :----------- | :---------- |
| id             | integer      | NO       | nextval(...) | PK          |
| street_address | varchar(255) | NO       |              |             |
| lat            | numeric(9,6) | YES      |              |             |
| lng            | numeric(9,6) | YES      |              |             |

*   **Primary Key:** `(id)`
*   **Indexes:** `idx_addresses_coords` on (`lat`, `lng`)

### `airbag_equipment_requirements`

| Column Name     | Type    | Nullable | Default        | Constraints        |
| :-------------- | :------ | :------- | :------------- | :----------------- |
| id              | integer | NO       | nextval(...)   | PK                 |
| ymm_id          | integer | NO       |                | FK -> ymm_ref(ymm_id) |
| service_id      | integer | NO       |                | FK -> services(id) |
| equipment_model | text    | NO       | 'airbag'::text |                    |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `service_id` -> `services(id)`
    *   `ymm_id` -> `ymm_ref(ymm_id)`
*   **Unique Constraints:**
    *   `airbag_equipment_requirements_ymm_id_service_id_key`: (`ymm_id`, `service_id`)

### `customer_vehicles`

| Column Name | Type         | Nullable | Default      | Constraints |
| :---------- | :----------- | :------- | :----------- | :---------- |
| id          | integer      | NO       | nextval(...) | PK          |
| vin         | varchar(17)  | YES      |              | UNIQUE      |
| make        | varchar(100) | NO       |              |             |
| year        | smallint     | YES      |              |             |
| model       | varchar(100) | YES      |              |             |

*   **Primary Key:** `(id)`
*   **Unique Constraints:**
    *   `vehicles_vin_key`: (`vin`)

### `diag_equipment_requirements`

| Column Name     | Type    | Nullable | Default      | Constraints        |
| :-------------- | :------ | :------- | :----------- | :----------------- |
| id              | integer | NO       | nextval(...) | PK                 |
| ymm_id          | integer | NO       |              | FK -> ymm_ref(ymm_id) |
| service_id      | integer | NO       |              | FK -> services(id) |
| equipment_model | text    | NO       | 'diag'::text |                    |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `service_id` -> `services(id)`
    *   `ymm_id` -> `ymm_ref(ymm_id)`
*   **Unique Constraints:**
    *   `diag_equipment_requirements_ymm_service_key`: (`ymm_id`, `service_id`)

### `equipment`

| Column Name    | Type             | Nullable | Default      | Constraints |
| :------------- | :--------------- | :------- | :----------- | :---------- |
| id             | integer          | NO       | nextval(...) | PK          |
| model          | text             | YES      |              |             |
| equipment_type | service_category | YES      |              |             |

*   **Primary Key:** `(id)`

### `vans`

| Column Name    | Type                   | Nullable | Default      | Constraints |
| :------------- | :--------------------- | :------- | :----------- | :---------- |
| id             | integer                | NO       | nextval(...) | PK          |
| last_service   | timestamp with time zone | YES      |              |             |
| next_service   | timestamp with time zone | YES      |              |             |
| vin            | varchar                | YES      |              |             |
| lat            | numeric                | YES      |              |             |
| lng            | numeric                | YES      |              |             |
| onestepgps_device_id | VARCHAR           | YES      |              |             |

*   **Primary Key:** `(id)`

### `immo_equipment_requirements`

| Column Name     | Type    | Nullable | Default        | Constraints        |
| :-------------- | :------ | :------- | :------------- | :----------------- |
| id              | integer | NO       | nextval(...)   | PK                 |
| ymm_id          | integer | NO       |                | FK -> ymm_ref(ymm_id) |
| service_id      | integer | NO       |                | FK -> services(id) |
| equipment_model | text    | NO       | 'immo'::text |                    |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `service_id` -> `services(id)`
    *   `ymm_id` -> `ymm_ref(ymm_id)`
*   **Unique Constraints:**
    *   `immo_equipment_requirements_ymm_id_service_id_key`: (`ymm_id`, `service_id`)

### `jobs`

| Column Name         | Type                   | Nullable | Default      | Constraints              |
| :------------------ | :--------------------- | :------- | :----------- | :----------------------- |
| id                  | integer                | NO       | nextval(...) | PK                       |
| order_id            | integer                | YES      |              | FK -> orders(id)         |
| assigned_technician | integer                | YES      |              | FK -> technicians(id)    |
| address_id          | integer                | YES      |              | FK -> addresses(id)      |
| priority            | integer                | YES      |              | CHECK (priority >= 0)    |
| status              | job_status             | NO       |              |                          |
| requested_time      | timestamp with time zone | YES      |              |                          |
| estimated_sched     | timestamp with time zone | YES      |              |                          |
| job_duration        | integer                | YES      |              | CHECK (job_duration > 0) |
| notes               | text                   | YES      |              |                          |
| service_id          | integer                | YES      |              | FK -> services(id)       |
| fixed_assignment    | boolean                | NO       | false        |                          |
| fixed_schedule_time | timestamp with time zone | YES      |              |                          |
| technician_notes    | text                   | YES      |              |                          |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `address_id` -> `addresses(id)` ON DELETE RESTRICT
    *   `assigned_technician` -> `technicians(id)` ON DELETE RESTRICT
    *   `order_id` -> `orders(id)` ON DELETE RESTRICT
    *   `service_id` -> `services(id)`
*   **Check Constraints:**
    *   `jobs_job_duration_check`: (`job_duration` > 0)
    *   `jobs_priority_check`: (`priority` >= 0)
*   **Indexes:**
    *   `idx_jobs_estimated_sched` on (`estimated_sched`)
    *   `idx_jobs_status` on (`status`)

### `keys`

| Column Name    | Type           | Nullable | Default | Constraints              |
| :------------- | :------------- | :------- | :------ | :----------------------- |
| sku_id         | varchar(50)    | NO       |         | PK                       |
| quantity       | integer        | NO       |         | CHECK (quantity >= 0)    |
| min_quantity   | integer        | NO       |         | CHECK (min_quantity >= 0) |
| part_number    | varchar(50)    | YES      |         |                          |
| purchase_price | numeric(10,2)  | YES      |         |                          |
| sale_price     | numeric(10,2)  | YES      |         |                          |
| supplier       | varchar(100)   | YES      |         |                          |
| fcc_id         | varchar(50)    | YES      |         |                          |

*   **Primary Key:** `(sku_id)`
*   **Check Constraints:**
    *   `keys_min_quantity_check`: (`min_quantity` >= 0)
    *   `keys_quantity_check`: (`quantity` >= 0)

### `order_services`

| Column Name | Type    | Nullable | Default | Constraints        |
| :---------- | :------ | :------- | :------ | :----------------- |
| order_id    | integer | NO       |         | PK, FK -> orders(id) |
| service_id  | integer | NO       |         | PK, FK -> services(id)|

*   **Primary Key:** `(order_id, service_id)`
*   **Foreign Keys:**
    *   `order_id` -> `orders(id)` ON DELETE CASCADE
    *   `service_id` -> `services(id)` ON DELETE CASCADE

### `order_uploads`

| Column Name | Type                   | Nullable | Default          | Constraints    |
| :---------- | :--------------------- | :------- | :--------------- | :------------- |
| id          | integer                | NO       | nextval(...)     | PK             |
| order_id    | integer                | YES      |                  | FK -> orders(id)|
| file_name   | varchar(255)           | NO       |                  |                |
| file_type   | varchar(100)           | YES      |                  |                |
| file_url    | text                   | NO       |                  |                |
| uploaded_at | timestamp with time zone | YES      | CURRENT_TIMESTAMP|                |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `order_id` -> `orders(id)` ON DELETE CASCADE

### `orders`

| Column Name             | Type                   | Nullable | Default      | Constraints                 |
| :---------------------- | :--------------------- | :------- | :----------- | :-------------------------- |
| id                      | integer                | NO       | nextval(...) | PK                          |
| user_id                 | uuid                   | YES      |              | FK -> users(id)             |
| vehicle_id              | integer                | YES      |              | FK -> customer_vehicles(id) |
| repair_order_number     | varchar(50)            | YES      |              |                             |
| address_id              | integer                | YES      |              | FK -> addresses(id)         |
| earliest_available_time | timestamp with time zone | YES      |              |                             |
| notes                   | text                   | YES      |              |                             |
| invoice                 | integer                | YES      |              |                             |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `address_id` -> `addresses(id)` ON DELETE RESTRICT
    *   `user_id` -> `users(id)` ON DELETE RESTRICT
    *   `vehicle_id` -> `customer_vehicles(id)` ON DELETE RESTRICT

### `prog_equipment_requirements`

| Column Name     | Type    | Nullable | Default      | Constraints        |
| :-------------- | :------ | :------- | :----------- | :----------------- |
| id              | integer | NO       | nextval(...) | PK                 |
| ymm_id          | integer | NO       |              | FK -> ymm_ref(ymm_id) |
| service_id      | integer | NO       |              | FK -> services(id) |
| equipment_model | text    | NO       | 'prog'::text |                    |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `service_id` -> `services(id)`
    *   `ymm_id` -> `ymm_ref(ymm_id)`
*   **Unique Constraints:**
    *   `prog_equipment_requirements_ymm_service_key`: (`ymm_id`, `service_id`)

### `services`

| Column Name      | Type             | Nullable | Default      | Constraints |
| :--------------- | :--------------- | :------- | :----------- | :---------- |
| id               | integer          | NO       | nextval(...) | PK          |
| service_name     | varchar(100)     | NO       |              | UNIQUE      |
| slug             | text             | YES      |              |             |
| service_category | service_category | YES      |              |             |

*   **Primary Key:** `(id)`
*   **Unique Constraints:**
    *   `services_service_name_key`: (`service_name`)

### `technician_availability_exceptions`

| Column Name    | Type                              | Nullable | Default          | Constraints                         |
| :------------- | :-------------------------------- | :------- | :--------------- | :---------------------------------- |
| id             | integer                           | NO       | nextval(...)     | PK                                  |
| technician_id  | integer                           | NO       |                  | FK -> technicians(id)               |
| exception_type | availability_exception_type | NO       |                  |                                     |
| date           | date                              | NO       |                  |                                     |
| is_available   | boolean                           | NO       |                  |                                     |
| start_time     | time without time zone            | YES      |                  |                                     |
| end_time       | time without time zone            | YES      |                  |                                     |
| reason         | text                              | YES      |                  |                                     |
| created_at     | timestamp with time zone          | YES      | now()            |                                     |
| updated_at     | timestamp with time zone          | YES      | now()            |                                     |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `technician_id` -> `technicians(id)`
*   **Unique Constraints:**
    *   `unique_technician_date`: (`technician_id`, `date`)
*   **Check Constraints:**
    *   `valid_time_range`: `((("is_available" = false) AND ("start_time" IS NULL) AND ("end_time" IS NULL)) OR (("is_available" = true) AND ("start_time" < "end_time"))))`
*   **Indexes:**
    *   `idx_tech_exceptions_date` on (`technician_id`, `date`)
    *   `idx_tech_exceptions_date_range` on (`technician_id`, `date`, `start_time`, `end_time`)
*   **Triggers:** `update_technician_availability_exceptions_updated_at` (BEFORE UPDATE)

### `technician_default_hours`

| Column Name   | Type                     | Nullable | Default      | Constraints                         |
| :------------ | :----------------------- | :------- | :----------- | :---------------------------------- |
| id            | integer                  | NO       | nextval(...) | PK                                  |
| technician_id | integer                  | NO       |              | FK -> technicians(id)               |
| day_of_week   | smallint                 | NO       |              | CHECK (day_of_week >= 0 AND day_of_week <= 6) |
| start_time    | time without time zone   | NO       |              |                                     |
| end_time      | time without time zone   | NO       |              |                                     |
| created_at    | timestamp with time zone | YES      | now()        |                                     |
| updated_at    | timestamp with time zone | YES      | now()        |                                     |
| is_available  | boolean                  | YES      | false        |                                     |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `technician_id` -> `technicians(id)`
*   **Unique Constraints:**
    *   `unique_tech_day`: (`technician_id`, `day_of_week`)
    *   `unique_technician_default_hours_weekday`: (`technician_id`, `day_of_week`) *(Note: Duplicate constraint name from schema dump)*
*   **Check Constraints:**
    *   `technician_default_hours_day_of_week_check`: (`day_of_week` >= 0 AND `day_of_week` <= 6)
    *   `valid_time_range`: (`start_time` < `end_time`)
*   **Triggers:** `update_technician_default_hours_updated_at` (BEFORE UPDATE)

### `technicians`

| Column Name     | Type    | Nullable | Default      | Constraints           |
| :-------------- | :------ | :------- | :----------- | :-------------------- |
| id              | integer | NO       | nextval(...) | PK                    |
| user_id         | uuid    | YES      |              | FK -> users(id)       |
| assigned_van_id | integer | YES      |              | FK -> vans(id) ON DELETE SET NULL |
| workload        | integer | YES      |              | CHECK (workload >= 0) |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `assigned_van_id` -> `vans(id)` ON DELETE SET NULL
    *   `user_id` -> `users(id)` ON DELETE RESTRICT
*   **Check Constraints:**
    *   `technicians_workload_check`: (`workload` >= 0)

### `user_addresses`

| Column Name | Type    | Nullable | Default | Constraints        |
| :---------- | :------ | :------- | :------ | :----------------- |
| user_id     | uuid    | NO       |         | PK, FK -> users(id)|
| address_id  | integer | NO       |         | PK, FK -> addresses(id) |

*   **Primary Key:** `(user_id, address_id)`
*   **Foreign Keys:**
    *   `address_id` -> `addresses(id)` ON DELETE CASCADE
    *   `user_id` -> `users(id)` ON DELETE CASCADE

### `users`

| Column Name     | Type          | Nullable | Default | Constraints           |
| :-------------- | :------------ | :------- | :------ | :-------------------- |
| id              | uuid          | NO       |         | PK, FK -> auth.users(id) |
| full_name       | varchar(100)  | NO       |         |                       |
| phone           | varchar(100)  | YES      |         |                       |
| home_address_id | integer       | YES      |         | FK -> addresses(id)   |
| is_admin        | boolean       | YES      | false   |                       |
| customer_type   | customer_type | NO       |         |                       |

*   **Primary Key:** `(id)`
*   **Foreign Keys:**
    *   `home_address_id` -> `addresses(id)` ON DELETE RESTRICT
    *   `id` -> `auth.users(id)` ON DELETE CASCADE

### `van_equipment`

| Column Name  | Type    | Nullable | Default | Constraints          |
| :----------- | :------ | :------- | :------ | :------------------- |
| van_id       | integer | NO       |         | PK, FK -> vans(id)   |
| equipment_id | integer | NO       |         | PK, FK -> equipment(id)|

*   **Primary Key:** `(van_id, equipment_id)`
*   **Foreign Keys:**
    *   `equipment_id` -> `equipment(id)` ON DELETE CASCADE
    *   `van_id` -> `vans(id)` ON DELETE CASCADE

---

Relevant Files:
*   `schema.sql`
*   `apps/web/src/db/schema.sql`
*   `docs/reference/DB.md`
*   `apps/web/src/types/database.types.ts`
*   `apps/scheduler/src/types/database.types.ts`