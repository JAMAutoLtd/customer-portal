# Overview

## 1. Order Submission

**Customer provides the following information:**

- **Vehicle Information:**
    - **VIN** \(or **Year/Make/Model** if VIN is unavailable; form auto-calculates YMM from VIN\)
- **Repair Order Number:** _\(Insurance customers only\)_
- **Address:** Selected from saved addresses \(modifiable by admin or customer; addresses may be shared\)
- **Earliest Available Date & Time**
- **Services Required:** _\(Multiple selections allowed\)_
    - **ADAS:**
        - Front Radar
        - Windshield Camera
        - 360 Camera/Side Mirror
        - Blind Spot Monitor
        - Parking Assist Sensor
    - **Module Replacement Programming:**
        - ECM, TCM, BCM, Airbag Module, Instrument Cluster, Front Radar, Windshield Camera, Blind Spot Monitor, Headlamp Module, Other
    - **Keys or Immobilizer Programming:**
        - Immobilizer Module Replaced
        - All Keys Lost/No Working Keys
            - **Push Button Start:**
                - JAM Provides Keys \(with Key Quantity\)
                - Customer Provides Keys \(with Key Quantity\)
            - **Blade Ignition:**
                - JAM Provides Keys \(with Key Quantity\)
                - Customer Provides Keys \(with Key Quantity\)
        - Adding Spare Keys _\(same options as above\)_
    - **Diagnostic or Wiring Repair**
- **Additional Details:**
    - Notes
    - Uploads \(pictures, scan reports, etc.\)

---
## 2. Checks & Processes

- **ADAS Equipment Check:**
    - For each service requested, find the equipment required for the service/vehicle in our database, e.g. for Front Radar service on vehicle 2022 ACURA ILX, use AUTEL-CSC0602/01.
- **Inventory Check for Key Jobs:**
    - Check inventory with [Boxhero Inventory Management](https://www.boxhero.io).
    - If keys are out of stock:
        - Generate a quote using [Keydirect](https://keydirect.ca/) \(CAD\) and [UHS Hardware](https://www.uhs-hardware.com/) \(USD, customs\).
        - On customer acceptance, notify admin to order keys and confirm the job schedule.
        - Key jobs are scheduled only after keys are confirmed in stock or ordered, with a 3-day wait if keys must be ordered.
- **Invoice Generation \(Insurance Orders\):**
- Create unsent invoices to the customer using QuickBooks, incorporating the Repair Order Number, vehicle details, and any attached order files.

---
## 3. Job Creation & Prioritization

- **Job Creation:**
- Jobs are created from orders, creating a job for each service requested. The results of the _equipment_requirements check will be used in determining the assigned technicians.

- **Job Prioritization:**
- Jobs are assigned priorty based on the following:
    1. Insurance customer jobs
    2. Commercial customer ADAS jobs
    3. Airbag jobs
    4. Key/Immobilizer jobs
    5. Commercial customer module replacement and diagnostic jobs
    6. Residential customer module replacement jobs
    7. Residential customer ADAS jobs
    8. Residential customer diagnostic jobs

---
## SCHEDULER SYSTEM OVERVIEW

The scheduler is a dynamic system designed to continuously optimize job assignments and technician routes, balancing efficiency, customer ETAs, and job priorities within daily operational constraints.

### Core Components

1.  **Technician Assignment Logic**
    *   **Eligibility:** Determines technician suitability based on `van_equipment` versus job `equipment_requirements`.
    *   **Order Grouping Preference:** For multi-job orders, prioritizes assigning all jobs to a single, fully equipped technician if available. If not, jobs from the order are assigned individually based on best fit.
    *   **ETA Optimization:** When multiple technicians are eligible, selects the one predicted to have the earliest ETA. **Note:** ETA prediction during assignment must simulate placement within the technician's multi-day schedule respecting daily constraints and existing fixed-time appointments.
    *   **Fixed Assignments:** Supports manual ("fixed") job assignments (`jobs.fixed_assignment` field). Jobs with `fixed_assignment=true` *cannot* be dynamically reassigned but *are* included in their assigned technician's route optimization.
    *   **Fixed Schedule Times:** Supports optional fixed start times (`jobs.fixed_schedule_time` field). These jobs act as anchors in the daily schedule.

2.  **Job Queuing & Routing Logic (Daily Planning)**
    *   **Daily Boundaries:** Routes are planned on a day-by-day basis, respecting each technician's specific working hours and availability for that day.
    *   **Starting Locations:** Route calculation starts from the technician's *current location* for the first day (today) and from their *home base* for subsequent days.
    *   **Handling Fixed Times:** Jobs with a `fixed_schedule_time` for the current planning day are scheduled first. They consume their required time slots, potentially fragmenting the remaining available time for dynamic jobs.
    *   **Schedulable Units:** Dynamic (non-fixed-time) jobs are grouped into units: indivisible blocks for multi-job orders assigned to the same tech, or individual units for single jobs. Block priority is determined by the highest priority job within it.
    *   **Priority & Daily Fit (Dynamic Units):** Dynamic units are sorted by priority. The system iteratively fills the *available time windows* within each day, selecting the highest priority units that fit (considering travel + duration).
    *   **Route Optimization (Daily TSP):** A TSP algorithm optimizes the sequence of *all* units scheduled *within each specific day* (both fixed-time and dynamic) to minimize travel time. **Google OR-Tools will be used** for this task due to its robust capabilities and native support for time window constraints, which are essential for handling `fixed_schedule_time` jobs correctly.
    *   **Multi-Day Schedule:** The result is a multi-day schedule for each technician (e.g., `tech.schedule = {day1: [unitA_fixed, unitB, unitC_fixed], day2: [unitD]}`).
    *   **Continuous ETA Updates:** ETAs for *all* jobs (across all scheduled days) are calculated and updated based on their position in the final, optimized multi-day schedule.

### Dynamic Operation & Recalculation

The system operates dynamically, constantly seeking the optimal state:

*   **Recalculation Loop:** Core assignment and daily routing logic is re-evaluated in response to specific events.
*   **Re-evaluation Scope:** Re-evaluation considers *all* active, non-fixed jobs against the current multi-day schedules and technician statuses.
*   **Event Triggers:** Recalculations are typically triggered by: new jobs, job status changes, technician status/location changes, manual interventions, or optional periodic timers.

This continuous re-optimization ensures the system adapts to changing conditions, always aiming for the best possible job assignments and ETAs according to defined priorities and daily operational constraints.

---
## API LAYER FOR DATA ACCESS

To facilitate interaction between the dynamic scheduler components and the underlying database, a dedicated API layer will be implemented (likely using FastAPI and SQLAlchemy/SQLModel). This layer serves several key purposes:

1.  **Abstraction:** Decouples the scheduler logic from direct database interaction. The scheduler only needs to know how to communicate with the API endpoints.
2.  **Encapsulation:** The API enforces how data is accessed and modified, containing the necessary database query logic, joins, and data transformations (e.g., deriving YMM IDs, fetching related user/address data).
3.  **Scalability & Maintainability:** Allows the scheduler and the data access logic to be developed, scaled, and maintained independently.
4.  **Production Readiness:** Replaces placeholder functions, direct database calls, or development-specific tools (like AI tool queries) with a standard, robust HTTP-based interface suitable for deployment.

The scheduler's `data_interface.py` module will be responsible for making HTTP requests to this API layer to fetch data (like technicians, pending jobs, equipment requirements) and push updates (like job assignments and ETAs).

---
## SCHEDULER PSEUDOCODE

# Revised assign_jobs pseudocode (Job-centric assignment)
def assign_jobs(all_jobs, technicians):
    # Filter out jobs that are already assigned and marked as fixed
    dynamic_jobs_to_consider = [job for job in all_jobs if not job.fixed]

    # Group ONLY the dynamic jobs by order
    for order in group_jobs_by_order(dynamic_jobs_to_consider):
        best_tech_for_order = None
        eligible_techs = [] # Initialize eligible_techs

        # Check if this is a multi-job order
        if len(order.jobs) > 1:
            # Identify technicians fully equipped for the entire order
            fully_equipped_techs = [tech for tech in technicians if tech.has_all_equipment(order)]
            if fully_equipped_techs:
                eligible_techs = fully_equipped_techs
                # Calculate ETAs for fully equipped techs based on the whole order
                # Note: calculate_eta needs to simulate insertion considering existing fixed_schedule_time constraints
                etas = {tech: calculate_eta(tech, order.jobs) for tech in eligible_techs}
                best_tech_for_order = min(etas, key=etas.get)
            else:
                # No single tech is fully equipped; handle jobs individually later
                pass 
        else: # Single job order
            single_job = order.jobs[0]
            eligible_techs = [tech for tech in technicians if tech.has_equipment(single_job.equipment_required)]
            if eligible_techs:
                 # Calculate ETAs for the single job
                 # Note: calculate_eta needs to simulate insertion considering existing fixed_schedule_time constraints
                etas = {tech: calculate_eta(tech, [single_job]) for tech in eligible_techs}
                best_tech_for_order = min(etas, key=etas.get)

        # --- Assignment Phase ---
        if best_tech_for_order is not None:
            # Assign ALL jobs in this order to the determined best technician
            for job in order.jobs:
                assign_job_to_technician(job, best_tech_for_order)
        else:
            # Handle multi-job orders where NO single tech was fully equipped
            # Process each job individually to find the best available tech for THAT job
            if len(order.jobs) > 1: # Check needed as single jobs are handled above
                for job in order.jobs:
                    individual_eligible = [tech for tech in technicians if tech.has_equipment(job.equipment_required)]
                    if individual_eligible:
                        # Note: calculate_eta needs to simulate insertion considering existing fixed_schedule_time constraints
                        etas = {tech: calculate_eta(tech, [job]) for tech in individual_eligible}
                        best_tech_for_job = min(etas, key=etas.get)
                        assign_job_to_technician(job, best_tech_for_job)
                    # Else: Handle case where no tech can do this specific job (optional logging/error handling)

    # Routing update remains the same (processes all assigned jobs per tech)
    update_job_queues_and_routes(technicians)

# Revised update_job_queues_and_routes with fixed schedule time handling
def update_job_queues_and_routes(technicians):
    for tech in technicians:
        all_assigned_jobs = tech.queue # Get all jobs assigned to the tech

        # 1. Group jobs & Create schedulable units
        jobs_by_order = group_jobs_by_order(all_assigned_jobs)
        all_units = create_schedulable_units(jobs_by_order) # Includes priority, fixed_assignment, fixed_schedule_time

        # 2. Separate fixed-time and dynamic units
        fixed_time_units = [u for u in all_units if u.fixed_schedule_time is not None]
        dynamic_units = [u for u in all_units if u.fixed_schedule_time is None]
        
        # 3. Sort dynamic units by priority
        dynamic_units.sort(key=lambda unit: unit.priority)

        # 4. Plan schedule day by day
        tech_schedule = {} # Stores the final plan {day_num: [unit1, unit2], ...}
        remaining_dynamic_units = list(dynamic_units)
        pending_fixed_units = list(fixed_time_units) # Track fixed units yet to be placed
        day_number = 1
        max_planning_days = 14 # Or some reasonable limit

        while (remaining_dynamic_units or pending_fixed_units) and day_number <= max_planning_days:
            # Get tech availability for this specific day
            daily_availability = get_technician_availability(tech, day_number)
            if not daily_availability or daily_availability['total_duration'] <= timedelta(0):
                if not remaining_dynamic_units and not pending_fixed_units: break
                day_number += 1
                continue

            day_start = daily_availability['start_time']
            day_end = daily_availability['end_time']
            tech_schedule[day_number] = [] # Initialize empty schedule for the day

            # 4a. Place fixed units for *this* day & determine available windows
            scheduled_fixed_today = []
            available_windows = []
            current_window_start = day_start
            fixed_for_today_sorted = sorted(
                [u for u in pending_fixed_units if u.fixed_schedule_time.date() == day_start.date()],
                key=lambda u: u.fixed_schedule_time
            )
            units_not_scheduled_fixed = []

            for fixed_unit in fixed_for_today_sorted:
                fixed_start = fixed_unit.fixed_schedule_time
                fixed_end = fixed_start + fixed_unit.duration
                if fixed_start >= current_window_start and fixed_end <= day_end:
                    # Add window before this fixed unit
                    if fixed_start > current_window_start:
                        available_windows.append((current_window_start, fixed_start))
                    scheduled_fixed_today.append(fixed_unit)
                    current_window_start = fixed_end # Advance start for next potential window
                else:
                    log(f"Warning: Fixed unit {fixed_unit.id} conflicts on day {day_number}")
                    units_not_scheduled_fixed.append(fixed_unit)
            
            # Add final window after the last fixed unit
            if current_window_start < day_end:
                available_windows.append((current_window_start, day_end))

            # Update overall pending fixed list
            pending_fixed_units = [u for u in pending_fixed_units if u not in fixed_for_today_sorted] + units_not_scheduled_fixed

            # 4b. Fill available windows with dynamic units (prioritized)
            scheduled_dynamic_today = []
            temp_remaining_dynamic = list(remaining_dynamic_units) # Work on a copy
            units_scheduled_ids = set()

            for dyn_unit in temp_remaining_dynamic: # Already sorted by priority
                fitted = False
                # Try to fit dyn_unit into the earliest possible slot in available_windows
                # This requires simulating travel time from the previous event (fixed or dynamic)
                # Simplified logic: find first window where it fits sequentially after last placement
                # (Pseudocode omits complex travel simulation within windows for brevity)
                for i, (win_start, win_end) in enumerate(available_windows):
                    # Simplified check: does duration fit in window?
                    if dyn_unit.duration <= (win_end - win_start): 
                         # Assume it fits (needs travel check in reality)
                         scheduled_dynamic_today.append(dyn_unit)
                         units_scheduled_ids.add(dyn_unit.id)
                         fitted = True
                         # TODO: Refine window logic (remove/split window after placement)
                         break # Place in first available window for simplicity
                # If fitted, it's removed from consideration for this day (handled later)
            
            # 4c. Combine and Optimize the day's schedule
            all_units_today = scheduled_fixed_today + scheduled_dynamic_today
            if all_units_today:
                start_location = tech.current_location if day_number == 1 else tech.home_location
                time_constraints = {u.id: u.fixed_schedule_time for u in scheduled_fixed_today}
                
                # Call optimizer with time constraints
                optimized_units, total_time = optimize_daily_route_and_get_time(
                    all_units_today, start_location, time_constraints
                )

                # Final check against total daily duration
                if total_time <= daily_availability['total_duration']:
                    tech_schedule[day_number] = optimized_units
                    # Remove successfully scheduled dynamic units from main list
                    remaining_dynamic_units = [u for u in remaining_dynamic_units if u.id not in units_scheduled_ids]
                else:
                    log(f"Warning: Optimized route for tech {tech.id} day {day_number} too long. Only scheduling fixed.")
                    # Only keep fixed units if optimized route failed
                    tech_schedule[day_number] = [u for u in optimized_units if u in scheduled_fixed_today]
                    # Dynamic units remain in remaining_dynamic_units

            # 4d. Prepare for next day
            day_number += 1

        # 5. Store the final multi-day schedule
        tech.schedule = tech_schedule

        # 6. Update ETAs for ALL jobs based on the final schedule
        update_etas_for_schedule(tech)

# --- Helper function signatures needed ---
# def create_schedulable_units(jobs_by_order): -> list_of_units (with jobs, priority, location, duration, fixed_assignment, fixed_schedule_time)
# def get_technician_availability(tech, day_number): -> dict (with start_time, end_time, total_duration) or None
# def calculate_travel_time(loc1, loc2): -> timedelta
# def optimize_daily_route_and_get_time(units_for_day, start_location, time_constraints=None): -> (list_of_units_ordered, total_timedelta) # Runs TSP using OR-Tools, respects constraints
# def find_unit_in_list(unit_to_find, list_to_search): -> found_unit # Needs comparison logic
# def update_etas_for_schedule(tech): # Updates Job ETAs based on tech.schedule structure