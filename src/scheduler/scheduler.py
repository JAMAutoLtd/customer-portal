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
        unit.duration = sum([j.duration for j in jobs], timedelta())
        unit.priority = max(j.priority for j in jobs) if jobs else 0
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
        
        # Find the end time of the last scheduled job for the day
        last_scheduled_event_end_time = day_start
        last_location = technician.home_location if current_day > 1 else technician.current_location

        if current_day in technician.schedule:
            daily_schedule = technician.schedule[current_day]
            if daily_schedule:
                current_time = day_start
                current_loc = technician.home_location if current_day > 1 else technician.current_location
                for unit in daily_schedule:
                    travel = calculate_travel_time(current_loc, unit.location)
                    current_time += travel + unit.duration
                    current_loc = unit.location
                last_scheduled_event_end_time = current_time
                last_location = current_loc

        # Calculate time needed for the new unit
        travel_to_new_unit = calculate_travel_time(last_location, temp_unit_location)
        potential_start_time = max(day_start, last_scheduled_event_end_time) + travel_to_new_unit
        potential_end_time = potential_start_time + temp_unit_duration

        # Check if the unit fits within the remaining workday
        if potential_end_time <= day_end:
            return potential_start_time  # Found the earliest slot

        # If it doesn't fit, try the next day
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
        
        # Sort units by priority (lower number = higher priority)
        units.sort(key=lambda u: u.priority)

        current_day = 1
        remaining_units = units.copy()

        while remaining_units and current_day <= 14:  # Look up to 14 days ahead
            # Get availability for the day
            availability = get_technician_availability(tech, current_day)
            if not availability:
                current_day += 1
                continue

            # Initialize the day's schedule
            tech.schedule[current_day] = []
            day_start = availability['start_time']
            day_end = availability['end_time']
            remaining_time = availability['total_duration']

            # Get starting location for the day
            start_location = tech.current_location if current_day == 1 else tech.home_location

            # Try to fit units into this day
            units_for_today = []
            skipped_units = []

            for unit in remaining_units:
                # Calculate travel time to this unit
                travel_time = calculate_travel_time(start_location, unit.location)
                
                # Check if unit fits in remaining time
                if unit.duration + travel_time <= remaining_time:
                    units_for_today.append(unit)
                    remaining_time -= (unit.duration + travel_time)
                    start_location = unit.location
                else:
                    skipped_units.append(unit)

            # Optimize route for the day's units
            if units_for_today:
                optimized_sequence, total_time = optimize_daily_route_and_get_time(
                    units_for_today,
                    tech.current_location if current_day == 1 else tech.home_location
                )
                tech.schedule[current_day] = optimized_sequence

            # Update remaining units for next day
            remaining_units = skipped_units
            current_day += 1

        # Update ETAs for all jobs in the schedule
        update_etas_for_schedule(tech)
