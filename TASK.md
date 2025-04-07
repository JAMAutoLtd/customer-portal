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
    -   [ ] Implement `calculate_eta(technician, jobs_to_consider)`: Simulates adding `jobs_to_consider` (as a unit) into the technician's *existing* multi-day schedule, respecting daily limits, and returns the predicted ETA for the *first* job in the unit. This will likely need to call parts of the daily planning logic internally.
    -   [ ] Implement `assign_job_to_technician(job, technician)`: Handles the logic/database update for assigning a job. (May call data interface function).
    -   [ ] Implement `assign_jobs(all_eligible_jobs, all_technicians)` based on pseudocode, using the helper functions/classes defined above.
    -   [ ] Implement `update_job_queues_and_routes(all_technicians)` based on pseudocode, using the helper functions/classes.
-   [ ] **Implement Triggering Mechanism (Location TBD):**
    -   [ ] Design and implement how the `assign_jobs` and `update_job_queues_and_routes` cycle is triggered (e.g., listener on new jobs, scheduled task).

## Phase 4: Integration & Testing

-   [ ] **Integration:** Ensure all components work together seamlessly.
-   [ ] **Testing:**
    -   [ ] Unit tests for utility functions, routing calculations, availability logic.
    -   [ ] Integration tests for `assign_jobs` and `update_job_queues_and_routes` with mock data.
    -   [ ] End-to-end tests simulating event triggers and verifying schedule/ETA updates.

## Discovered During Work
-   [x] **Implement Database Logic (`src/scheduler/data_interface.py`):** Replace placeholder functions with actual database queries using an appropriate ORM (e.g., SQLAlchemy, SQLModel) or database driver. (Added: 2023-10-27)
-   [ ] **Implement Availability Logic (`src/scheduler/availability.py`):** Replace placeholder function `get_technician_availability` with actual logic to retrieve technician availability (e.g., from database, external calendar). (Added: 2023-10-27)
-   [ ] **Implement Routing Logic (`src/scheduler/routing.py`):** Replace placeholder functions (`calculate_travel_time`, `optimize_daily_route_and_get_time`, `update_etas_for_schedule`) with actual routing API/TSP solver integration and ETA calculation logic. (Added: 2023-10-27)
-   [ ] **Refine `calculate_eta` Simulation (`src/scheduler/scheduler.py`):** Replace simplified time simulation with a more robust calculation considering travel between existing jobs in the technician's schedule. (Added: 2024-05-16)
-   [ ] **Replace Placeholders in `scheduler.py` (`src/scheduler/scheduler.py`):** Update HACK/TODO comments to use actual imported models (`Technician`, `Job`, `SchedulableUnit`, `Address`) and utility functions (`group_jobs_by_order`, `create_schedulable_units`, `find_unit_in_list`, `get_technician_availability`, `calculate_travel_time`, `optimize_daily_route_and_get_time`, `update_etas_for_schedule`, `update_job_assignment`) once they are fully implemented. (Added: 2024-05-16)

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
