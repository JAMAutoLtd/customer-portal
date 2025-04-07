# Scheduler Development Tasks

## Phase 1: Core Models & Data Access

-   [x] **Define Data Models (`src/scheduler/models.py`):**
    -   [x] Create Python classes/dataclasses for `Address`, `Technician`, `Van`, `Equipment`, `Job`, `Order`, `Service`, `SchedulableUnit`, `DailyAvailability`.
    -   [x] Include relevant fields based on `DATABASE.md` (e.g., IDs, location coordinates, equipment lists, job duration, priority, fixed status, etc.).
    -   [x] Implement helper methods on `Technician` for `has_equipment(required_equipment)` and `has_all_equipment(order_jobs)`.
-   [x] **Implement Data Interface (`src/scheduler/data_interface.py`):**
    -   [x] Function to fetch all active technicians with their associated van and equipment details.
    -   [x] Function to fetch all pending/dynamic jobs eligible for scheduling (not fixed, appropriate status).
    -   [x] Function(s) to fetch necessary related data for jobs/orders (services, vehicle ymm_id, address_id, customer details for priority).
    -   [x] Function(s) to fetch equipment requirements based on service_id and ymm_id.
    -   [x] Function to update a job's assignment (`assigned_technician`, `status`, potentially `estimated_sched`).
    -   [x] Function to update job ETAs (e.g., `estimated_sched` field).

## Phase 1.5: API Layer Implementation (New Phase)

-   [ ] **Define API Data Models (Pydantic):**
    -   [ ] Create Pydantic models for API request/response bodies based on agreed-upon structure (e.g., `TechnicianAPIModel`, `JobAPIModel`, `EquipmentRequirementAPIModel`, etc.).
-   [ ] **Implement API Endpoints (FastAPI):**
    -   [ ] Set up a basic FastAPI application structure.
    -   [ ] Implement `GET /technicians` endpoint with backend logic (SQLAlchemy/SQLModel) to fetch active technicians, vans, and equipment.
    -   [ ] Implement `GET /jobs/schedulable` endpoint with backend logic to fetch pending/dynamic jobs meeting scheduler criteria.
    -   [ ] Implement `GET /equipment/requirements` endpoint with backend logic to query appropriate `*_equipment_requirements` tables based on service and YMM ID.
    -   [ ] Implement `PATCH /jobs/{job_id}/assignment` endpoint with backend logic to update job assignment and status.
    -   [ ] Implement `PATCH /jobs/etas` endpoint with backend logic to bulk update job ETAs.
    -   [ ] Implement `PATCH /jobs/{job_id}/schedule` endpoint with backend logic to set or clear the `fixed_schedule_time` for a job.
    -   [ ] Implement necessary helper endpoints (e.g., `GET /addresses/{id}`, potentially others as needed during implementation).
-   [ ] **Database Schema Updates:**
    -   [ ] Add `fixed` (boolean, default: false) field to the `jobs` table.
    -   [ ] Add `fixed_schedule_time` (nullable timestamp) field to the `jobs` table.
    -   [ ] Add `estimated_sched_end`, `customer_eta_start`, `customer_eta_end` (nullable timestamps) to the `jobs` table.
    -   [ ] Create database migrations for these changes.
    -   [ ] Add `fixed_assignment` (boolean, default: false) field to the `jobs` table.
    -   [ ] Add `fixed_schedule_time` (nullable timestamp) field to the `jobs` table.
    -   [ ] Add `estimated_sched_end`, `customer_eta_start`, `customer_eta_end` (nullable timestamps) to the `jobs` table.
    -   [ ] Create database migrations for these changes.
-   [ ] **API Testing:**
    -   [ ] Implement basic unit/integration tests for API endpoints (e.g., using FastAPI's TestClient).

## Phase 2: Utilities & Core Logic

-   [x] **Implement Availability Logic (`src/scheduler/availability.py`):**
    -   [x] Implement `get_technician_availability(tech_id, day_number)`: Fetches/calculates `start_time`, `end_time`, `total_duration` for a given tech on a specific day (relative to today). Define how availability is stored/retrieved. (Placeholder added)
-   [x] **Implement Utility Functions (`src/scheduler/utils.py`):**
    -   [x] Implement `group_jobs_by_order(list_of_jobs)`: Groups jobs based on their `order_id`.
    -   [x] Implement `create_schedulable_units(jobs_by_order)`: Converts grouped jobs into `SchedulableUnit` objects, calculating block priority, aggregate duration, and determining the primary location.
    -   [x] Implement `find_unit_in_list(unit_to_find, list_to_search)`: Helper for removing units.
-   [x] **Implement Routing & Time Calculations (`src/scheduler/routing.py`):**
    -   [x] Implement `calculate_travel_time(loc1: Address, loc2: Address)`: Integrates with a mapping API or uses a pre-computed distance matrix to estimate travel time. (Placeholder added)
    -   [x] Implement `optimize_daily_route_and_get_time(units: List[SchedulableUnit], start_location: Address)`:
        -   Requires integrating a TSP solver (e.g., `python-tsp`, OR-Tools).
        -   Takes a list of units and a start location.
        -   Returns the optimized sequence of units and the total calculated time (travel + durations). (Placeholder added)
    -   [x] Implement `update_etas_for_schedule(technician)`: Calculates specific start/end times and customer-facing ETAs for all jobs in the `technician.schedule` multi-day structure. (Placeholder added)

## Phase 3: Main Scheduler Implementation

-   [ ] **Implement Main Scheduler Logic (`src/scheduler/scheduler.py`):**
    -   [ ] Implement `calculate_eta(technician, jobs_to_consider)`: Simulates adding `jobs_to_consider` (as a unit) into the technician's *existing* multi-day schedule, respecting daily limits **and fixed-time job constraints**, and returns the predicted ETA for the *first* job in the unit. This will likely need to call parts of the daily planning logic internally.
    -   [ ] Implement `assign_job_to_technician(job, technician)`: Handles the logic/database update for assigning a job. (May call data interface function).
    -   [ ] Implement `assign_jobs(all_eligible_jobs, all_technicians)` based on pseudocode, using the helper functions/classes defined above.
    -   [ ] Implement `update_job_queues_and_routes(all_technicians)` based on pseudocode, using the helper functions/classes:
        -   [ ] Modify daily planning loop to first place fixed-time jobs and calculate remaining time windows.
        -   [ ] Modify dynamic unit filling logic to respect fragmented time windows.
    -   [ ] Implement `update_job_queues_and_routes(all_technicians)` based on pseudocode, using the helper functions/classes:
        -   [x] Modify daily planning loop to first place fixed-time jobs and calculate remaining time windows.
        -   [x] Modify dynamic unit filling logic to respect fragmented time windows (basic implementation).
-   [ ] **Implement Triggering Mechanism (Location TBD):**
    -   [ ] Design and implement how the `assign_jobs` and `update_job_queues_and_routes` cycle is triggered (e.g., listener on new jobs, scheduled task).

## Phase 4: Integration & Testing

-   [ ] **Integration:** Ensure all components work together seamlessly.
-   [ ] **Testing:**
    -   [ ] Unit tests for utility functions, routing calculations, availability logic.
    -   [ ] Integration tests for `assign_jobs` and `update_job_queues_and_routes` with mock data.
    -   [ ] End-to-end tests simulating event triggers and verifying schedule/ETA updates.

## Discovered During Work
-   [x] **Implement Database Logic (`src/scheduler/data_interface.py`):** Replace placeholder functions with actual database queries using an appropriate ORM (e.g., SQLAlchemy, SQLModel) or database driver. (Added: 2023-10-27) **-> Superseded by API Integration**
-   [ ] **Integrate Scheduler with API (`src/scheduler/data_interface.py`):**
    -   [ ] Modify functions in `data_interface.py` to make HTTP calls to the new API endpoints (using `requests` or `httpx`).
    -   [ ] Handle API responses and errors appropriately.
    -   [ ] Update scheduler tests to mock HTTP calls instead of database functions.
    (Added: 2024-05-17)
-   [ ] **Implement Availability Logic (`src/scheduler/availability.py`):** Replace placeholder function `get_technician_availability` with actual logic to retrieve technician availability (e.g., from database, external calendar). (Added: 2023-10-27)
-   [ ] **Implement Routing Logic (`src/scheduler/routing.py`):** Replace placeholder functions (`calculate_travel_time`, `optimize_daily_route_and_get_time`, `update_etas_for_schedule`) with actual routing API/TSP solver integration and ETA calculation logic:
        -   [x] Ensure `optimize_daily_route_and_get_time` accepts time window constraints (`time_constraints` param added).
        -   [ ] **Implement** time constraint handling within the TSP solver logic (basic check added for brute-force, **needs implementation for nearest neighbor/real solver**).
-   [x] **Add OR-Tools Dependency:** Add `ortools` to the project's dependency management (e.g., `requirements.txt`). (Added: 2024-05-17)
-   [ ] **Implement Routing Logic with OR-Tools (`src/scheduler/routing.py`):** 
        -   [ ] Replace placeholder `calculate_travel_time` with actual routing API integration (e.g., Google Maps) or keep placeholder if external API is deferred.
        -   [x] Replace placeholder `optimize_daily_route_and_get_time` with implementation using Google OR-Tools Routing library:
            -   [x] Create OR-Tools data model (distance matrix/callback, time dimension).
            -   [x] Set up routing parameters (single vehicle, start/end locations).
            -   [x] Implement time window constraints based on `time_constraints` parameter.
            -   [x] Add service time for each stop (unit duration).
            -   [x] Solve the routing problem and extract the optimized sequence and total time.
            -   [x] Refine OR-Tools implementation: Add error handling, ensure timezone consistency. (**TODO**)
        -   [x] Refine `update_etas_for_schedule` logic to use precise timings from the OR-Tools solution (when available). (**Done**)
-   [ ] **Refine `calculate_eta` Simulation (`src/scheduler/scheduler.py`):** Improve accuracy of calculating `last_scheduled_event_end_time` and `last_location`. (**TODO**)
-   [ ] **Refine Window Filling Logic (`src/scheduler/scheduler.py`):** Improve travel time calculation accuracy when fitting dynamic units into windows in `update_job_queues_and_routes`. (**TODO**)
-   [ ] **Replace Placeholders in `scheduler.py` (`src/scheduler/scheduler.py`):** Update HACK/TODO comments to use actual imported models and utility functions once available/implemented.

## Future Enhancements
-   [ ] **Enhance Availability System:** Replace the fixed Mon-Fri 9:00-18:30 schedule with a more sophisticated system supporting:
    - Database-driven schedules
    - External calendar integration
    - PTO/vacation tracking
    - Flexible work hours
    - Break times
    - Holidays
    - Multiple shifts
    (Added: 2024-05-16)
-   [ ] **Enhance Routing System:** Replace the simplified routing calculations with a production-ready system:
    - Integrate with Google Maps Distance Matrix API or Here Maps API
    - Implement pre-computed distance matrices for common locations
    - Use professional TSP solver (e.g., OR-Tools)
    - Add traffic-aware routing
    - Consider historical travel time data
    - Handle time windows and constraints
    - Support route optimization across multiple days
    - Add break and lunch period scheduling
    (Added: 2024-05-16)
