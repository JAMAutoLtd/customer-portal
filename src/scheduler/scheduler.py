from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Tuple
from collections import defaultdict
import copy # Needed for deep copying lists

# Import actual data models
from .models import Technician, Job, SchedulableUnit, Address, JobStatus # Added JobStatus
# Remove placeholder classes
# class Address:
#     pass
# class Technician:
#     id: int
#     schedule: Dict[int, List['SchedulableUnit']] = {} # {day_number: [unit1, unit2]}
#     current_location: Optional[Address] = None
#     home_location: Optional[Address] = None
#     def has_equipment(self, required_equipment) -> bool: return True # Placeholder
#     def has_all_equipment(self, order_jobs) -> bool: return True # Placeholder
# 
# class Job:
#     id: int
#     order_id: int
#     fixed: bool = False
#     equipment_required: List[str] = [] # Placeholder
#     duration: timedelta = timedelta(hours=1) # Placeholder
#     location: Optional[Address] = None # Placeholder
#     priority: int = 1 # Placeholder
#     assigned_technician: Optional[Technician] = None # Placeholder
#     estimated_sched: Optional[datetime] = None # Placeholder
#     status: str = "Pending" # Placeholder
# 
# class SchedulableUnit:
#     jobs: List[Job]
#     priority: int
#     duration: timedelta
#     location: Address
#     assigned_technician_id: Optional[int] = None
#     fixed_assignment: bool = False
#     fixed_schedule_time: Optional[datetime] = None

# Import actual utility functions
from .utils import group_jobs_by_order, create_schedulable_units # Import real utils
# from .availability import get_technician_availability # Keep using placeholder for now
from .routing import calculate_travel_time, optimize_daily_route_and_get_time, update_etas_for_schedule
from .availability import get_technician_availability # Keep using placeholder for now
from .data_interface import update_job_assignment, fetch_assigned_jobs # Added fetch_assigned_jobs

# HACK: Placeholder functions for dependencies - Keep for now
# def get_technician_availability(tech: Technician, day_number: int) -> Optional[Dict]:
#     """Placeholder: Fetches technician availability for a given day."""
#     # ... (implementation remains)
# 
# def calculate_travel_time(loc1: Optional[Address], loc2: Optional[Address]) -> timedelta:
#     """Placeholder: Calculates travel time between two locations."""
#     # ... (implementation remains)

# Remove placeholder create_schedulable_units as we import the real one
# def create_schedulable_units(jobs_by_order: Dict[int, List[Job]]) -> List[SchedulableUnit]:
#     """Placeholder: Creates SchedulableUnit objects from grouped jobs."""
#     # ... (implementation removed)


# --- Phase 3 Implementation Starts Here ---

def calculate_eta(technician: Technician, jobs_to_consider: List[Job]) -> Optional[datetime]:
    """
    Calculates the predicted ETA for the first job in a potential unit.

    Simulates adding the jobs (as a unit) into the technician's existing
    multi-day schedule to find the earliest possible start time, respecting
    fixed-time job constraints by identifying and checking available windows.

    Args:
        technician: The technician whose schedule is being considered.
        jobs_to_consider: A list of jobs representing a potential SchedulableUnit.

    Returns:
        The predicted ETA (datetime) for the first job, or None if it cannot be scheduled
        within the simulation timeframe (e.g., 14 days).
    """
    if not jobs_to_consider:
        print("Warning: calculate_eta called with empty jobs_to_consider list.")
        return None

    # --- 1. Create a temporary unit representation for calculation ---
    # Use first job's location (assuming jobs in unit are typically co-located or logic groups them appropriately)
    # HACK: Use getattr for location in case job object doesn't have it yet (during testing/dev)
    temp_unit_location = getattr(jobs_to_consider[0], 'location', None)
    if not temp_unit_location:
         print(f"Warning: Job {jobs_to_consider[0].id} missing location for ETA calculation.")
         return None # Cannot calculate without location

    # Ensure job_duration exists and is timedelta
    temp_unit_duration = sum((
        getattr(job, 'job_duration', timedelta(hours=1)) for job in jobs_to_consider
        ), timedelta())
    
    if temp_unit_duration <= timedelta(0):
        print(f"Warning: Job unit duration is zero or negative ({temp_unit_duration}). Cannot calculate ETA.")
        return None

    # --- 2. Iterate through days to find the earliest fit --- 
    current_day = 1
    max_days_to_check = 14  # Limit how far ahead we look

    while current_day <= max_days_to_check:
        # --- 2a. Get Daily Availability --- 
        availability = get_technician_availability(technician, current_day)
        if not availability or availability.get('total_duration', timedelta(0)) <= timedelta(0):
            current_day += 1
            continue  # Skip days with no availability or zero duration

        day_start = availability['start_time']
        day_end = availability['end_time']
        # Determine start location for the day based on whether it's the first day or subsequent
        start_location_today = technician.current_location if current_day == 1 else technician.home_location
        if not start_location_today:
             print(f"Warning: Technician {technician.id} missing start location for day {current_day}. Cannot calculate ETA for this day.")
             current_day += 1
             continue # Cannot calculate without a starting point for the day

        # --- 2b. Identify Fixed Units and Calculate Available Windows --- 
        # Use the technician's actual schedule structure
        scheduled_units_today = technician.schedule.get(current_day, []) 
        fixed_units_today = sorted(
            [u for u in scheduled_units_today if getattr(u, 'fixed_schedule_time', None) is not None],
            key=lambda u: u.fixed_schedule_time
        )
        
        available_windows: List[Tuple[datetime, datetime, Address]] = [] # (window_start, window_end, location_before_window)
        last_event_end_time = day_start
        last_event_location = start_location_today

        for fixed_unit in fixed_units_today:
            # Ensure fixed_unit has necessary attributes
            fixed_start = getattr(fixed_unit, 'fixed_schedule_time', None)
            fixed_duration = getattr(fixed_unit, 'duration', timedelta(0))
            fixed_location = getattr(fixed_unit, 'location', None)

            if not fixed_start or fixed_duration <= timedelta(0) or not fixed_location:
                 print(f"Warning: Skipping invalid fixed unit data during ETA calculation for tech {technician.id}, day {current_day}.")
                 continue

            fixed_end = fixed_start + fixed_duration

            # Check basic validity (fixed unit is within work hours and starts after last event)
            if fixed_start >= last_event_end_time and fixed_end <= day_end:
                 # Add the window BEFORE this fixed unit
                if fixed_start > last_event_end_time:
                    available_windows.append((last_event_end_time, fixed_start, last_event_location))
                
                # Update for the next potential window
                last_event_end_time = fixed_end
                last_event_location = fixed_location # Location after this fixed job
            else:
                # This fixed job is invalidly scheduled (overlaps or outside hours) - skip it for window calculation
                # Log this potential issue
                print(f"Warning: Fixed unit {getattr(fixed_unit, 'id', 'unknown')} on day {current_day} for tech {technician.id} has scheduling conflict ({fixed_start} vs {last_event_end_time}) or is outside working hours ({fixed_end} vs {day_end}). Ignoring for ETA calculation window.")
                # Do not update last_event_end_time or last_event_location based on this invalid unit
        
        # Add the final window AFTER the last valid fixed unit (or the whole day if no fixed units)
        if last_event_end_time < day_end:
            available_windows.append((last_event_end_time, day_end, last_event_location))

        # --- 2c. Simulate Fitting the New Unit into Windows --- 
        for window_start, window_end, location_before_window in available_windows:

            if not location_before_window:
                print(f"Warning: Missing location_before_window for window {window_start}-{window_end} on day {current_day} for tech {technician.id}. Skipping window.")
                continue
            
            # Calculate travel from the event location immediately preceding this window
            travel_to_new_unit = calculate_travel_time(location_before_window, temp_unit_location)
            
            # Potential start is the later of window start or arrival time after travel
            # Arrival time is the time the previous event ended (window_start) + travel time
            arrival_time = window_start + travel_to_new_unit 
            potential_start = max(window_start, arrival_time)

            potential_end = potential_start + temp_unit_duration

            # Check if the unit fits within this window
            if potential_end <= window_end:
                # Found the earliest possible slot!
                return potential_start 

        # If no fit found in any window on this day, try the next day
        current_day += 1

    # If no slot found within max_days_to_check
    job_ids = [getattr(j, 'id', 'unknown') for j in jobs_to_consider]
    print(f"Could not find suitable ETA slot for jobs {job_ids} within {max_days_to_check} days for tech {technician.id}.")
    return None


def assign_job_to_technician(job: Job, technician: Technician):
    """
    Assigns a job to a technician by calling the data interface.

    Args:
        job: The Job to be assigned.
        technician: The Technician to assign the job to.
    """
    # Call the data interface function to update the assignment via API
    # Status should likely be ASSIGNED when assigning
    success = update_job_assignment(job_id=job.id, technician_id=technician.id, status=JobStatus.ASSIGNED)
    
    if not success:
        # Consider adding proper logging here
        print(f"Error: Failed to assign job {job.id} to technician {technician.id} via API.")
    # Note: We don't update the job object directly here anymore.
    # The source of truth is the database, accessed via the API.


def assign_jobs(all_eligible_jobs: List[Job], technicians: List[Technician]):
    """
    Assigns eligible jobs to the best available technician based on ETA and equipment.

    Follows the logic from PLANNING.md, prioritizing assigning multi-job orders
    to a single technician if possible.

    Args:
        all_eligible_jobs: List of jobs to consider for assignment (non-fixed).
        technicians: List of available technicians.
    """
    # Filter out jobs that are already assigned and marked as fixed
    # Using .fixed_assignment based on updated DATABASE.md
    dynamic_jobs_to_consider = [job for job in all_eligible_jobs if not job.fixed_assignment]

    # Group jobs by order ID
    jobs_by_order_id: Dict[int, List[Job]] = defaultdict(list)
    for job in dynamic_jobs_to_consider:
        jobs_by_order_id[job.order_id].append(job)

    unassigned_jobs_after_grouping: List[Job] = []

    for order_id, order_jobs in jobs_by_order_id.items():
        best_tech_for_order: Optional[Technician] = None
        best_eta_for_order: Optional[datetime] = None

        # Try to find a technician who can handle all jobs in the order
        if len(order_jobs) > 1:
            fully_equipped_techs = [tech for tech in technicians if tech.has_all_equipment(order_jobs)]
            if fully_equipped_techs:
                etas = {}
                for tech in fully_equipped_techs:
                    eta = calculate_eta(tech, order_jobs)
                    if eta:
                        etas[tech] = eta
                
                if etas: # If any eligible tech has a valid ETA
                    best_tech_for_order = min(etas, key=etas.get)
                    best_eta_for_order = etas[best_tech_for_order]
            # If no single tech is fully equipped, best_tech_for_order remains None, jobs are handled individually later

        # --- Assignment Phase for Order (if single tech found) or Individual Jobs ---
        if best_tech_for_order and best_eta_for_order:
            # Assign ALL jobs in this order to the determined best technician
            for job in order_jobs:
                # Call the updated function that uses data_interface
                assign_job_to_technician(job, best_tech_for_order)
        else:
            # Handle single-job orders or multi-job orders where no single tech was fully equipped
            # Process each job individually to find the best available tech for THAT job
            for job in order_jobs:
                best_individual_tech: Optional[Technician] = None
                best_individual_eta: Optional[datetime] = None
                individual_eligible = [tech for tech in technicians if tech.has_equipment(job.equipment_required)]
                
                if individual_eligible:
                    etas = {}
                    for tech in individual_eligible:
                        eta = calculate_eta(tech, [job])
                        if eta:
                           etas[tech] = eta
                    
                    if etas: # If any eligible tech has a valid ETA for the individual job
                        best_individual_tech = min(etas, key=etas.get)
                        best_individual_eta = etas[best_individual_tech]
                
                if best_individual_tech: 
                    assign_job_to_technician(job, best_individual_tech)
                # Else: Handle case where no tech can do this specific job (optional logging/error handling)
                # Currently, job remains unassigned implicitly


def update_job_queues_and_routes(technicians: List[Technician]):
    """
    Updates the multi-day schedule for each technician, optimizing daily routes
    and updating ETAs for all assigned jobs.

    Args:
        technicians: List of technicians whose schedules need updating.
    """
    for tech in technicians:
        tech.schedule = {} # Clear existing schedule
        all_daily_start_times: Dict[int, Dict[str, datetime]] = {} # Use unit.id as key

        # 1. Fetch Assigned Jobs for the Technician via API
        try:
            # Replace placeholder fetch with actual data interface call
            tech_assigned_jobs = fetch_assigned_jobs(tech.id)
        except Exception as e:
            # Log error fetching jobs for this tech
            print(f"Error fetching jobs for technician {tech.id}: {e}. Skipping schedule update for this tech.")
            continue # Move to the next technician

        if not tech_assigned_jobs:
            print(f"No assigned jobs found for technician {tech.id}. Clearing schedule and skipping.")
            # Ensure ETAs are cleared/updated if necessary for an empty schedule
            update_etas_for_schedule(tech, {}) 
            continue

        # 2. Create Schedulable Units
        jobs_by_order = group_jobs_by_order(tech_assigned_jobs)
        all_units = create_schedulable_units(jobs_by_order)

        # Assume SchedulableUnit now has a unique `id` attribute (e.g., UUID or derived ID)
        # Ensure all units have a valid ID
        if not all(hasattr(u, 'id') and u.id is not None for u in all_units):
            print(f"Error: Not all schedulable units have a valid 'id' attribute for tech {tech.id}. Skipping schedule update.")
            continue

        # 3. Separate Units and Sort Dynamic by Priority
        fixed_time_units = [u for u in all_units if u.fixed_schedule_time is not None]
        # All other units are considered dynamic in terms of timing
        dynamic_units = [u for u in all_units if u.fixed_schedule_time is None]
        dynamic_units.sort(key=lambda u: u.priority) # Sort high to low prio

        # 4. Plan Schedule Day by Day
        current_day = 1
        max_planning_days = 14
        remaining_dynamic_units = dynamic_units.copy()
        pending_fixed_time_units = fixed_time_units.copy()

        while (remaining_dynamic_units or pending_fixed_time_units) and current_day <= max_planning_days:
            # Get daily availability
            availability = get_technician_availability(tech, current_day)
            if not availability or availability.get('total_duration', timedelta(0)) <= timedelta(0):
                current_day += 1
                continue

            tech.schedule[current_day] = []
            day_start = availability['start_time']
            day_end = availability['end_time']
            start_location_today = tech.current_location if current_day == 1 else tech.home_location
            if not start_location_today:
                print(f"Warning: Tech {tech.id} missing start location for day {current_day}. Cannot schedule.")
                current_day += 1
                continue

            # 4a. Place Fixed-Time Units for Today
            scheduled_fixed_today: List[SchedulableUnit] = []
            units_for_today_fixed = sorted(
                [u for u in pending_fixed_time_units if u.fixed_schedule_time and u.fixed_schedule_time.date() == day_start.date()],
                key=lambda u: u.fixed_schedule_time
            )
            units_not_scheduled_fixed = []
            valid_fixed_schedule_today = True
            for unit in units_for_today_fixed:
                # Basic validation
                if not (unit.fixed_schedule_time and unit.duration and unit.location):
                    print(f"Warning: Invalid data for fixed unit {unit.id}. Adding to unscheduled.")
                    units_not_scheduled_fixed.append(unit)
                    continue
                unit_end = unit.fixed_schedule_time + unit.duration
                if not (unit.fixed_schedule_time >= day_start and unit_end <= day_end):
                    print(f"Warning: Fixed unit {unit.id} time {unit.fixed_schedule_time} - {unit_end} outside availability {day_start} - {day_end}. Adding to unscheduled.")
                    units_not_scheduled_fixed.append(unit)
                    valid_fixed_schedule_today = False # Mark potential overlap issue
                    continue
                scheduled_fixed_today.append(unit)
            
            # Check for overlaps among the *validly placed* fixed units for today
            scheduled_fixed_today.sort(key=lambda u: u.fixed_schedule_time)
            last_fixed_end = day_start
            for i, unit in enumerate(scheduled_fixed_today):
                 if unit.fixed_schedule_time < last_fixed_end:
                     print(f"Error: Overlap detected between fixed unit {scheduled_fixed_today[i-1].id} and {unit.id} on day {current_day} for tech {tech.id}. Handling overlap requires specific business logic (e.g., prioritize, error out). Skipping dynamic placement for this day.")
                     valid_fixed_schedule_today = False
                     break # Stop checking overlaps
                 last_fixed_end = unit.fixed_schedule_time + unit.duration

            # Update overall pending list
            pending_fixed_time_units = [u for u in pending_fixed_time_units if u not in units_for_today_fixed] + units_not_scheduled_fixed

            # 4b. Fit Dynamic Units into Gaps (if fixed schedule is valid)
            scheduled_dynamic_today: List[SchedulableUnit] = []
            units_scheduled_dynamically_ids = set()

            if valid_fixed_schedule_today:
                # Combine fixed units with day boundaries to define events and gaps
                events: List[Tuple[datetime, datetime, Address]] = [] # (start_time, end_time, end_location)
                events.append((day_start, day_start, start_location_today)) # Start of day
                for unit in scheduled_fixed_today:
                    events.append((unit.fixed_schedule_time, unit.fixed_schedule_time + unit.duration, unit.location))
                events.append((day_end, day_end, None)) # End of day marker, location irrelevant
                events.sort(key=lambda x: x[0]) # Sort events by start time

                # Iterate through dynamic units (prioritized) and try to fit them
                temp_remaining_dynamic = remaining_dynamic_units.copy()
                for dyn_unit in temp_remaining_dynamic:
                    if not dyn_unit.duration or not dyn_unit.location:
                        print(f"Warning: Skipping dynamic unit {dyn_unit.id} due to missing duration or location.")
                        continue
                    
                    best_fit_start_time = None
                    best_fit_event_index = -1 # Index *before* which to insert

                    # Check gaps between consecutive events
                    for i in range(len(events) - 1):
                        event_A_start, event_A_end, loc_A = events[i]
                        event_B_start, event_B_end, loc_B = events[i+1]
                        
                        if loc_A is None: # Should only happen if event A is the day_start 'event' - location is start_location_today
                             loc_A = start_location_today
                             if loc_A is None: continue # Cannot calculate travel from unknown start
                        
                        # Calculate earliest possible start time for dyn_unit in this gap
                        travel_A_dyn = calculate_travel_time(loc_A, dyn_unit.location)
                        earliest_start = event_A_end + travel_A_dyn
                        
                        # Calculate latest possible end time for dyn_unit in this gap
                        # Need location of B to calculate travel *to* B. If B is end-of-day, no travel needed.
                        latest_end = event_B_start
                        if loc_B: # If B is not the end-of-day marker
                             travel_dyn_B = calculate_travel_time(dyn_unit.location, loc_B)
                             # We must END BY (event_B_start - travel_dyn_B)
                             latest_end = event_B_start - travel_dyn_B
                        
                        # Calculate actual end time if starting at earliest_start
                        actual_end = earliest_start + dyn_unit.duration
                        
                        # Check if it fits
                        if earliest_start >= event_A_end and actual_end <= latest_end:
                            # Found a valid fit in this gap
                            if best_fit_start_time is None or earliest_start < best_fit_start_time:
                                best_fit_start_time = earliest_start
                                best_fit_event_index = i # Insert *after* event i
                    
                    # If a best fit was found for this dynamic unit
                    if best_fit_start_time is not None:
                        # Insert the dynamic unit into the schedule for today
                        scheduled_dynamic_today.append(dyn_unit)
                        units_scheduled_dynamically_ids.add(dyn_unit.id)
                        
                        # Update the 'events' list to include this newly scheduled unit for subsequent gap checks
                        dyn_end_time = best_fit_start_time + dyn_unit.duration
                        new_event = (best_fit_start_time, dyn_end_time, dyn_unit.location)
                        events.insert(best_fit_event_index + 1, new_event) # Insert after the event it follows
                        # events.sort(key=lambda x: x[0]) # Re-sort events (optional, depends on insertion logic)
            
                # Update remaining dynamic units list
                remaining_dynamic_units = [u for u in remaining_dynamic_units if u.id not in units_scheduled_dynamically_ids]

            # 4c. Combine and Optimize the Day's Schedule
            all_units_today = scheduled_fixed_today + scheduled_dynamic_today
            calculated_start_times_today: Dict[str, datetime] = {} # Use unit.id as key
            
            if all_units_today:
                # Prepare constraints for the optimizer using stable unit IDs
                time_constraints = {u.id: u.fixed_schedule_time for u in scheduled_fixed_today if u.fixed_schedule_time}
                
                try:
                    # Call optimizer - assuming it takes List[SchedulableUnit]
                    # and returns (ordered_list_of_units, total_time, dict_of_start_times_utc)
                    optimized_units, total_time, calculated_start_times_by_id = optimize_daily_route_and_get_time(
                        all_units_today,
                        start_location_today,
                        time_constraints=time_constraints,
                        day_start_time=day_start
                        # Removed unit_details, assuming optimizer handles units directly
                    )

                    # Check if total time fits within availability
                    if total_time <= availability['total_duration']:
                        tech.schedule[current_day] = optimized_units
                        # Ensure keys in calculated_start_times_by_id match unit.id format
                        all_daily_start_times[current_day] = calculated_start_times_by_id 
                    else:
                        print(f"Warning: Optimized route for tech {tech.id} day {current_day} ({total_time}) exceeds available duration ({availability['total_duration']}). Reverting to fixed units only.")
                        # Only schedule fixed units if optimization fails duration check
                        fixed_in_optimized = [u for u in optimized_units if u in scheduled_fixed_today]
                        tech.schedule[current_day] = fixed_in_optimized
                        all_daily_start_times[current_day] = {u.id: t for u_id, t in calculated_start_times_by_id.items() if (u := next((unit for unit in fixed_in_optimized if unit.id == u_id), None))}
                        # Add back the dynamic units that were attempted today to the remaining list
                        failed_dynamic_units = [u for u in all_units_today if u.id in units_scheduled_dynamically_ids]
                        remaining_dynamic_units.extend(failed_dynamic_units)
                        remaining_dynamic_units.sort(key=lambda u: u.priority) # Re-sort
                        
                except Exception as e:
                    print(f"Error during route optimization call for tech {tech.id}, day {current_day}: {e}. Scheduling fixed units only.")
                    tech.schedule[current_day] = scheduled_fixed_today # Schedule only fixed if optimizer crashes
                    all_daily_start_times[current_day] = {u.id: u.fixed_schedule_time for u in scheduled_fixed_today if u.fixed_schedule_time} # Use fixed times
                    # Add back dynamic units attempted today
                    failed_dynamic_units = [u for u in all_units_today if u.id in units_scheduled_dynamically_ids]
                    remaining_dynamic_units.extend(failed_dynamic_units)
                    remaining_dynamic_units.sort(key=lambda u: u.priority)

            # 4d. Prepare for Next Day
            current_day += 1

        # 5. Store the final multi-day schedule (already done in tech.schedule)

        # 6. Update ETAs for ALL jobs based on the final schedule
        # Ensure update_etas_for_schedule uses unit.id keys from all_daily_start_times
        update_etas_for_schedule(tech, all_daily_start_times)

        # Log unscheduled units
        if remaining_dynamic_units or pending_fixed_time_units:
            unsched_dyn_ids = [u.id for u in remaining_dynamic_units]
            unsched_fixed_ids = [u.id for u in pending_fixed_time_units]
            print(f"Warning: Tech {tech.id} finished planning with unscheduled units. Dynamic: {unsched_dyn_ids}, Fixed: {unsched_fixed_ids}")
