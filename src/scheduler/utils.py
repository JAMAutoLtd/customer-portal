from collections import defaultdict
from datetime import timedelta
from typing import List, Dict, Optional

from .models import Job, SchedulableUnit, Address

def group_jobs_by_order(jobs: List[Job]) -> Dict[int, List[Job]]:
    """
    Groups a list of Job objects by their order_id.

    Args:
        jobs (List[Job]): A list of Job objects.

    Returns:
        Dict[int, List[Job]]: A dictionary where keys are order_ids
                                and values are lists of Jobs for that order.
    """
    grouped_jobs = defaultdict(list)
    for job in jobs:
        grouped_jobs[job.order_id].append(job)
    return dict(grouped_jobs)

def create_schedulable_units(jobs_by_order: Dict[int, List[Job]]) -> List[SchedulableUnit]:
    """
    Converts jobs grouped by order into SchedulableUnit objects.

    Each SchedulableUnit represents one or more jobs from the same order
    that will be scheduled together. It calculates the unit's priority,
    total duration, location, and fixed status.

    Args:
        jobs_by_order (Dict[int, List[Job]]): Jobs grouped by their order_id.

    Returns:
        List[SchedulableUnit]: A list of SchedulableUnit objects.
    """
    units = []
    for order_id, jobs_in_order in jobs_by_order.items():
        if not jobs_in_order:
            continue # Should not happen with defaultdict, but good practice

        # Priority is the max priority of any job in the group (lower number = higher priority)
        unit_priority = min(job.priority for job in jobs_in_order)

        # Duration is the sum of all job durations in the group
        unit_duration = sum((job.job_duration for job in jobs_in_order), timedelta())

        # Location is assumed to be the same for all jobs in an order
        # Taking the address from the first job
        unit_location = jobs_in_order[0].address

        # If any job in the unit is fixed, the whole unit is considered fixed
        unit_fixed = any(job.fixed for job in jobs_in_order)

        # Check if any job already has an assigned tech ID (for consistency)
        assigned_tech_id = None
        tech_ids_in_unit = {job.assigned_technician_id for job in jobs_in_order if job.assigned_technician_id is not None}
        if len(tech_ids_in_unit) == 1:
            assigned_tech_id = tech_ids_in_unit.pop()
        elif len(tech_ids_in_unit) > 1:
            # This scenario (multiple techs assigned to jobs in the same order unit)
            # might indicate an issue or require specific handling based on business rules.
            # For now, we'll log a warning or raise an error if needed.
            print(f"Warning: Multiple technicians {tech_ids_in_unit} assigned to jobs for order {order_id}. Unit assigned_technician_id set to None.")

        unit = SchedulableUnit(
            order_id=order_id,
            jobs=jobs_in_order,
            priority=unit_priority,
            location=unit_location,
            duration=unit_duration,
            assigned_technician_id=assigned_tech_id, # Carry over if consistently assigned
            fixed=unit_fixed
        )
        units.append(unit)

    return units

def find_unit_in_list(unit_to_find: SchedulableUnit, list_to_search: List[SchedulableUnit]) -> Optional[SchedulableUnit]:
    """
    Finds a specific SchedulableUnit within a list based on its unique ID.

    Args:
        unit_to_find (SchedulableUnit): The unit object to search for (using its id).
        list_to_search (List[SchedulableUnit]): The list to search within.

    Returns:
        Optional[SchedulableUnit]: The found unit object, or None if not found.
    """
    for unit in list_to_search:
        if unit.id == unit_to_find.id:
            return unit
    return None 