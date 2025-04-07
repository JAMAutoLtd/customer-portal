from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from collections import defaultdict
import copy # Needed for deep copying lists

# TODO: Import actual data models when available
from .models import Technician, Job, SchedulableUnit, Address
# HACK: Using placeholder classes until models are defined/imported correctly
class Address:
    pass
class Technician:
    id: int
    schedule: Dict[int, List['SchedulableUnit']] = {} # {day_number: [unit1, unit2]}
    current_location: Optional[Address] = None
    home_location: Optional[Address] = None
    def has_equipment(self, required_equipment) -> bool: return True # Placeholder
    def has_all_equipment(self, order_jobs) -> bool: return True # Placeholder

class Job:
    id: int
    order_id: int
    fixed: bool = False
    equipment_required: List[str] = [] # Placeholder
    duration: timedelta = timedelta(hours=1) # Placeholder
    location: Optional[Address] = None # Placeholder
    priority: int = 1 # Placeholder
    assigned_technician: Optional[Technician] = None # Placeholder
    estimated_sched: Optional[datetime] = None # Placeholder
    status: str = "Pending" # Placeholder

class SchedulableUnit:
    jobs: List[Job]
    priority: int
    duration: timedelta
    location: Address
    assigned_technician_id: Optional[int] = None
    fixed_assignment: bool = False
    fixed_schedule_time: Optional[datetime] = None

# TODO: Import actual utility functions when available
# from .utils import group_jobs_by_order, create_schedulable_units, find_unit_in_list
# from .availability import get_technician_availability
from .routing import calculate_travel_time, optimize_daily_route_and_get_time, update_etas_for_schedule
from .availability import get_technician_availability
# from .data_interface import update_job_assignment # Assuming this function exists

# HACK: Placeholder functions for dependencies
def get_technician_availability(tech: Technician, day_number: int) -> Optional[Dict]:
    """Placeholder: Fetches technician availability for a given day."""
    # Replace with actual implementation later
    if day_number > 5: # Example: Assume unavailable after day 5
        return None
    return {
        "start_time": datetime.now().replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(days=day_number-1),
        "end_time": datetime.now().replace(hour=17, minute=0, second=0, microsecond=0) + timedelta(days=day_number-1),
        "total_duration": timedelta(hours=8) # Assuming 8 hours working time excluding break
    }

def calculate_travel_time(loc1: Optional[Address], loc2: Optional[Address]) -> timedelta:
    """Placeholder: Calculates travel time between two locations."""
    # Replace with actual routing API call
    return timedelta(minutes=30) # Fixed estimate for now

def update_job_assignment(job: Job, technician: Technician):
    """Placeholder: Updates job assignment in the data store."""
    # Replace with actual database update call
    print(f"Assigning job {job.id} to technician {technician.id}")
    job.assigned_technician = technician
    job.status = "Assigned" # Or appropriate status

def create_schedulable_units(jobs_by_order: Dict[int, List[Job]]) -> List[SchedulableUnit]:
    """Placeholder: Creates SchedulableUnit objects from grouped jobs."""
    units = []
    for order_id, jobs in jobs_by_order.items():
        if not jobs: continue
        # Simplified: Assume location is the first job's location
        # Assume duration is sum of job durations
        # Assume priority is highest of jobs
        unit = SchedulableUnit()
        unit.jobs = jobs
        unit.location = jobs[0].location
        unit.duration = sum((j.job_duration for j in jobs), timedelta())
        unit.priority = max(j.priority for j in jobs) if jobs else 0
        unit.assigned_technician_id = jobs[0].assigned_technician_id # Assume all jobs in unit have same tech
        unit.fixed_assignment = any(j.fixed_assignment for j in jobs)
        
        # Determine fixed schedule time for the unit
        fixed_times = [j.fixed_schedule_time for j in jobs if j.fixed_schedule_time]
        if fixed_times:
            # If multiple fixed times exist in a unit, use the earliest. Log a warning.
            unit.fixed_schedule_time = min(fixed_times)
            if len(fixed_times) > 1:
                # Consider adding proper logging here
                print(f"Warning: Multiple fixed schedule times found for jobs in order {order_id}. Using the earliest: {unit.fixed_schedule_time}")
        else:
            unit.fixed_schedule_time = None

        units.append(unit)
    return units


# --- Phase 3 Implementation Starts Here ---

def calculate_eta(technician: Technician, jobs_to_consider: List[Job]) -> Optional[datetime]:
    """
    Calculates the predicted ETA for the first job in a potential unit.

    Simulates adding the jobs (as a unit) into the technician's existing
    multi-day schedule to find the earliest possible start time.

    Args:
        technician: The technician whose schedule is being considered.
        jobs_to_consider: A list of jobs representing a potential SchedulableUnit.

    Returns:
        The predicted ETA (datetime) for the first job, or None if it cannot be scheduled.
    """
    if not jobs_to_consider:
        return None

    # Create a temporary unit representation for calculation
    temp_unit_location = jobs_to_consider[0].location
    temp_unit_duration = sum((getattr(job, 'job_duration', timedelta(hours=1)) for job in jobs_to_consider), timedelta())

    # Check if total duration exceeds max daily capacity
    max_daily_capacity = timedelta(hours=8)  # Assuming 8-hour workday
    if temp_unit_duration > max_daily_capacity:
        return None  # Cannot schedule if unit is longer than a workday

    current_day = 1
    max_days_to_check = 14  # Limit how far ahead we look

    while current_day <= max_days_to_check:
        availability = get_technician_availability(technician, current_day)
        if not availability:
            current_day += 1
            continue  # Skip days with no availability

        day_start = availability.start_time if hasattr(availability, 'start_time') else availability['start_time']
        day_end = availability.end_time if hasattr(availability, 'end_time') else availability['end_time']
        
        # --- Identify Fixed Time Slots for the Day ---
        fixed_slots: List[Tuple[datetime, datetime]] = []
        if current_day in technician.schedule:
            for unit in technician.schedule[current_day]:
                if unit.fixed_schedule_time:
                    fixed_start = unit.fixed_schedule_time
                    fixed_end = fixed_start + unit.duration
                    fixed_slots.append((fixed_start, fixed_end))
            # Sort fixed slots for easier checking later if needed (though overlap check doesn't require sorting)
            # fixed_slots.sort()

        # --- Find Last Event Time (Simplified) ---
        # TODO: This calculation needs refinement to match the complexity of update_job_queues_and_routes
        # It should ideally consider the actual optimized sequence, not just append.
        last_scheduled_event_end_time = day_start
        last_location = technician.home_location if current_day > 1 else technician.current_location
        if current_day in technician.schedule and technician.schedule[current_day]:
            # Simple approximation: find the end time of the latest finishing job (fixed or dynamic)
            latest_end = day_start
            for unit in technician.schedule[current_day]:
                # This is approximate, actual end time depends on optimized route
                # Use fixed end time if available, otherwise estimate based on duration
                unit_end_estimate = unit.fixed_schedule_time + unit.duration if unit.fixed_schedule_time else day_start # Needs better estimate
                latest_end = max(latest_end, unit_end_estimate)
            last_scheduled_event_end_time = latest_end # Very rough estimate
            # last_location also needs to be the location of this last unit

        # --- Find Earliest Valid Slot for New Unit ---
        current_potential_start = day_start # Start checking from beginning of day initially? No, after last event.
        # Calculate the earliest theoretical start based on travel from last known location/time
        travel_to_new_unit = calculate_travel_time(last_location, temp_unit_location)
        earliest_theoretical_start = max(day_start, last_scheduled_event_end_time) + travel_to_new_unit
        current_potential_start = earliest_theoretical_start

        while True: # Loop to find a non-overlapping slot
            potential_end_time = current_potential_start + temp_unit_duration

            # Check 1: Does it fit within the workday?
            if potential_end_time > day_end:
                break # Cannot fit today, try next day

            # Check 2: Does it overlap with any fixed slots?
            overlaps = False
            overlapping_fixed_end = None
            for fixed_start, fixed_end in fixed_slots:
                # Overlap condition: (StartA < EndB) and (StartB < EndA)
                if current_potential_start < fixed_end and fixed_start < potential_end_time:
                    overlaps = True
                    overlapping_fixed_end = fixed_end
                    break
            
            if overlaps:
                # Move potential start time to *after* the overlapping fixed slot
                current_potential_start = overlapping_fixed_end
                # Optional: Add a small buffer? timedelta(minutes=1)
                continue # Re-check with the new potential start time
            else:
                # Found a valid slot!
                return current_potential_start 

        # If the inner loop broke (didn't fit), try the next day
        current_day += 1

    # If no slot found within max_days_to_check
    return None


def assign_job_to_technician(job: Job, technician: Technician):
    """
    Assigns a job to a technician and updates its status.

    Args:
        job: The Job to be assigned.
        technician: The Technician to assign the job to.
    """
    job.assigned_technician_id = technician.id
    job.status = 'assigned'


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
    dynamic_jobs_to_consider = [job for job in all_eligible_jobs if not job.fixed]

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
            for tech in technicians:
                if tech.has_all_equipment(order_jobs):
                    eta = calculate_eta(tech, order_jobs)
                    if eta and (best_eta_for_order is None or eta < best_eta_for_order):
                        best_tech_for_order = tech
                        best_eta_for_order = eta

            # If found a tech who can handle all jobs with a good ETA, assign them
            if best_tech_for_order and best_eta_for_order:
                # Check if individual assignments might be better
                individual_assignments_better = False
                individual_etas = {}
                for job in order_jobs:
                    best_individual_tech = None
                    best_individual_eta = None
                    for tech in technicians:
                        if tech.has_equipment(job.equipment_required):
                            eta = calculate_eta(tech, [job])
                            if eta and (best_individual_eta is None or eta < best_individual_eta):
                                best_individual_tech = tech
                                best_individual_eta = eta
                    if best_individual_eta:
                        individual_etas[job.id] = (best_individual_tech, best_individual_eta)

                # Compare best individual ETAs with combined ETA
                if all(eta for _, eta in individual_etas.values()):
                    max_individual_eta = max(eta for _, eta in individual_etas.values())
                    if max_individual_eta < best_eta_for_order:
                        individual_assignments_better = True

                if not individual_assignments_better:
                    # Assign all jobs to the best technician
                    for job in order_jobs:
                        assign_job_to_technician(job, best_tech_for_order)
                    continue

        # If we couldn't assign all jobs to one tech (or individual assignments are better),
        # add them to unassigned list for individual assignment
        unassigned_jobs_after_grouping.extend(order_jobs)

    # Now assign remaining jobs individually
    for job in unassigned_jobs_after_grouping:
        best_tech: Optional[Technician] = None
        best_eta: Optional[datetime] = None

        # Find the best technician for this job
        for tech in technicians:
            if tech.has_equipment(job.equipment_required):
                eta = calculate_eta(tech, [job])
                if eta and (best_eta is None or eta < best_eta):
                    best_tech = tech
                    best_eta = eta

        # Assign to best technician if found
        if best_tech:
            assign_job_to_technician(job, best_tech)


def update_job_queues_and_routes(technicians: List[Technician]):
    """
    Updates the multi-day schedule for each technician, optimizing daily routes
    and updating ETAs for all assigned jobs.

    This function:
    1. Groups assigned jobs into schedulable units
    2. Prioritizes units based on job priority
    3. Plans each technician's schedule day by day
    4. Optimizes the route for each day
    5. Updates ETAs for all jobs

    Args:
        technicians: List of technicians whose schedules need updating.
    """
    for tech in technicians:
        # Clear existing schedule
        tech.schedule.clear()
        
        # Get all assigned jobs for this technician
        assigned_jobs = [job for job in tech.assigned_jobs if not job.fixed]
        if not assigned_jobs:
            # Still call update_etas to clear any old ETAs
            update_etas_for_schedule(tech)
            continue

        # Group jobs by order
        jobs_by_order = defaultdict(list)
        for job in assigned_jobs:
            jobs_by_order[job.order_id].append(job)

        # Create schedulable units
        units = create_schedulable_units(jobs_by_order)
        
        # Separate units into fixed time and dynamic
        fixed_time_units = [u for u in units if u.fixed_schedule_time]
        dynamic_units = [u for u in units if not u.fixed_schedule_time]

        # Sort dynamic units by priority (lower number = higher priority)
        dynamic_units.sort(key=lambda u: u.priority)

        current_day = 1
        remaining_dynamic_units = dynamic_units.copy()
        # Store all fixed units to potentially schedule later if they don't fit today
        pending_fixed_units = fixed_time_units.copy()

        while (remaining_dynamic_units or pending_fixed_units) and current_day <= 14:  # Look up to 14 days ahead
            # Get availability for the day
            availability = get_technician_availability(tech, current_day)
            if not availability:
                current_day += 1
                continue

            # Initialize the day's schedule and time tracking
            tech.schedule[current_day] = []
            day_start = availability['start_time']
            day_end = availability['end_time']
            scheduled_fixed_units_today: List[SchedulableUnit] = [] # Track fixed units placed today
            available_windows: List[Tuple[datetime, datetime]] = [] # List of (start, end) available slots
            
            # --- 1. Place Fixed Units for Today ---            
            fixed_units_for_this_day = sorted(
                [u for u in pending_fixed_units if u.fixed_schedule_time.date() == day_start.date()],
                key=lambda u: u.fixed_schedule_time
            )
            
            units_not_scheduled_fixed = [] # Keep track of fixed units that couldn't fit
            current_time = day_start

            for fixed_unit in fixed_units_for_this_day:
                start_time = fixed_unit.fixed_schedule_time
                end_time = start_time + fixed_unit.duration
                
                # Check basic validity: within work hours and doesn't overlap PREVIOUS fixed unit
                if start_time >= current_time and end_time <= day_end:
                    # Add the window BEFORE this fixed unit
                    if start_time > current_time:
                        available_windows.append((current_time, start_time))
                    
                    scheduled_fixed_units_today.append(fixed_unit)
                    current_time = end_time # Advance time past this fixed unit
                else:
                    # Cannot schedule this fixed unit today (conflict or outside hours)
                    print(f"Warning: Fixed unit {fixed_unit.id} for order {fixed_unit.order_id} cannot be scheduled on day {current_day} due to time conflict or availability.")
                    units_not_scheduled_fixed.append(fixed_unit) 
            
            # Add the final window AFTER the last fixed unit (or the whole day if no fixed units)
            if current_time < day_end:
                available_windows.append((current_time, day_end))
                
            # Update the list of pending fixed units (remove ones scheduled, keep ones that failed)
            pending_fixed_units = [u for u in pending_fixed_units if u not in fixed_units_for_this_day] + units_not_scheduled_fixed

            # --- 2. Fill Available Windows with Dynamic Units --- 
            scheduled_dynamic_today: List[SchedulableUnit] = []
            temp_remaining_dynamic = remaining_dynamic_units.copy() # Work with a copy
            units_scheduled_this_pass = set() # Track IDs scheduled in this iteration

            # Determine the effective start location for dynamic jobs today
            # If there are fixed jobs, it's the start location of the first one, otherwise tech's start location
            last_event_location = tech.current_location if current_day == 1 else tech.home_location 
            last_event_end_time = day_start # Initialize to the start of the day

            # Use scheduled_fixed_units_today which is sorted by time
            if scheduled_fixed_units_today:
                last_event_location = scheduled_fixed_units_today[0].location
                last_event_end_time = scheduled_fixed_units_today[0].fixed_schedule_time
            
            # Create a combined list of events (start, fixed units, end) to define windows accurately
            events = [(day_start, tech.home_location)] # Start of day event
            events.extend([(u.fixed_schedule_time, u.location) for u in scheduled_fixed_units_today])
            # Note: We don't explicitly need day_end as an event, windows handle it
            events.sort() # Sort by time

            idx_dynamic_unit = 0
            while idx_dynamic_unit < len(temp_remaining_dynamic):
                dynamic_unit = temp_remaining_dynamic[idx_dynamic_unit]
                fitted_in_window = False

                # Find the best window to fit this unit
                best_fit_window_idx = -1
                earliest_start_time = None
                required_travel_time = timedelta.max # Keep track of travel for the best fit

                for i in range(len(available_windows)):
                    window_start, window_end = available_windows[i]
                    
                    # Find the end time & location of the event *immediately before* this window starts
                    # This determines the travel origin for the first job in the window
                    previous_event_end_for_window = day_start
                    previous_event_loc_for_window = tech.home_location
                    if i > 0:
                        # Find the fixed unit ending just before this window
                        # This assumes available_windows maps directly to gaps between fixed units or start/end
                        # A safer way might be to iterate through sorted fixed units
                         # Find the fixed unit that defines the start of this window
                         # This logic needs refinement - let's simplify for now
                         # Assume travel is from the end of the PREVIOUS window/fixed job
                         # HACK: Simplified travel calculation - Needs accurate previous location!
                         pass # Placeholder for better previous event finding

                    # Tentative: Calculate travel from the start_location assumed for the day for simplicity for now
                    # TODO: Refine travel calculation based on actual previous event location in sequence
                    current_start_location_for_travel = tech.current_location if current_day == 1 else tech.home_location
                    # More accurate would be to track the end location of the last fitted unit within this window

                    travel = calculate_travel_time(current_start_location_for_travel, dynamic_unit.location)
                    potential_start = max(window_start, last_event_end_time + travel) # Consider last fitted dynamic job end time
                    potential_end = potential_start + dynamic_unit.duration

                    if potential_end <= window_end:
                        # This unit *could* fit in this window
                        if earliest_start_time is None or potential_start < earliest_start_time:
                            earliest_start_time = potential_start
                            best_fit_window_idx = i
                            required_travel_time = travel
                        fitted_in_window = True # Mark that it can fit somewhere
                        # Don't break, check other windows for potentially earlier fit
                
                if fitted_in_window and best_fit_window_idx != -1:
                    # Fit the unit into the best window found
                    scheduled_dynamic_today.append(dynamic_unit)
                    units_scheduled_this_pass.add(dynamic_unit.id)
                    temp_remaining_dynamic.pop(idx_dynamic_unit) # Remove from temp list
                    
                    # Update the last event end time for subsequent calculations *within this window*?
                    # This part is complex - simple approach for now: assume optimizer handles exact times
                    # last_event_end_time = earliest_start_time + dynamic_unit.duration 
                    # last_event_location = dynamic_unit.location # Update for next travel calc in this window?
                else:
                    # Could not fit this unit, move to the next dynamic unit
                    idx_dynamic_unit += 1
            
            # Sort the dynamic units scheduled today for potential insertion order (optional)
            scheduled_dynamic_today.sort(key=lambda u: u.priority) # Or maybe by estimated start?

            # --- 3. Combine and Optimize for the Day --- 
            all_units_today = scheduled_fixed_units_today + scheduled_dynamic_today
            calculated_start_times_today: Dict[str, datetime] = {} # Store start times from optimizer
            all_daily_start_times: Dict[int, Dict[str, datetime]] = {} # Store results for all days

            if all_units_today:
                start_location = tech.current_location if current_day == 1 else tech.home_location
                time_constraints = {u.id: u.fixed_schedule_time for u in scheduled_fixed_units_today}
                
                # Call optimizer with time constraints
                try:
                    optimized_units, total_time, calculated_start_times_today = optimize_daily_route_and_get_time(
                        all_units_today, 
                        start_location, 
                        time_constraints=time_constraints,
                        day_start_time=day_start # Pass the day's start time
                    )
                except Exception as e:
                    print(f"Error during route optimization for tech {tech.id} day {current_day}: {e}")
                    optimized_units = scheduled_fixed_units_today # Fallback to only fixed
                    total_time = timedelta(days=99) # Indicate failure
                    calculated_start_times_today = {} # No valid start times

                # Final check against total daily duration
                if total_time <= availability['total_duration']:
                    tech.schedule[current_day] = optimized_units
                    all_daily_start_times[current_day] = calculated_start_times_today # Store successful results
                    # Remove successfully scheduled dynamic units from main list
                    # Need to use the IDs from the *optimized_units* list that are dynamic
                    scheduled_dynamic_ids_in_route = {u.id for u in optimized_units if not u.fixed_schedule_time}
                    remaining_dynamic_units = [u for u in remaining_dynamic_units if u.id not in scheduled_dynamic_ids_in_route]
                else:
                    log(f"Warning: Optimized route for tech {tech.id} day {current_day} too long ({total_time} > {availability['total_duration']}). Only scheduling fixed.")
                    # Only keep fixed units if optimized route failed capacity check
                    fixed_in_optimized = [u for u in optimized_units if u.fixed_schedule_time]
                    tech.schedule[current_day] = fixed_in_optimized
                    # Store start times only for the fixed units that were kept
                    all_daily_start_times[current_day] = {u.id: calculated_start_times_today[u.id] for u in fixed_in_optimized if u.id in calculated_start_times_today}
                    # Dynamic units remain in remaining_dynamic_units
            
            # --- 4. Prepare for Next Day --- 
            current_day += 1

        # Update ETAs for all jobs in the schedule
        update_etas_for_schedule(tech, all_daily_start_times)
