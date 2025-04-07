"""
Routing and scheduling utilities module.

This module provides placeholder implementations for:
- Travel time calculation between locations
- Route optimization (TSP solver)
- ETA calculations and updates

TODO: Replace with actual implementations that could include:
- Google Maps Distance Matrix API integration
- Here Maps API integration
- Pre-computed distance matrices
- Professional TSP solver (e.g., OR-Tools)
- Traffic-aware routing
- Historical travel time data
"""

from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional
import math
from itertools import permutations

from .models import Address, SchedulableUnit, Technician, Job
from .availability import get_technician_availability

# --- Placeholder Implementations --- 

def calculate_travel_time(start_loc: Optional[Address], end_loc: Optional[Address]) -> timedelta:
    """
    Calculates estimated travel time between two locations.
    
    This is a placeholder that:
    1. Uses straight-line (Haversine) distance
    2. Assumes 30 mph average speed
    3. Enforces minimum 5-minute travel time
    4. Handles None locations gracefully
    
    Args:
        start_loc: Starting location (Address with lat/lng)
        end_loc: Ending location (Address with lat/lng)
        
    Returns:
        Estimated travel time as timedelta
    """
    if not start_loc or not end_loc:
        return timedelta(minutes=5)  # Minimum travel time
        
    if start_loc == end_loc:
        return timedelta(minutes=5)  # Minimum travel time for same location
        
    # Calculate Haversine distance
    R = 3959.87433  # Earth radius in miles
    
    lat1, lng1 = math.radians(start_loc.lat), math.radians(start_loc.lng)
    lat2, lng2 = math.radians(end_loc.lat), math.radians(end_loc.lng)
    
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))
    distance = R * c  # Distance in miles
    
    # Assume 30 mph average speed
    hours = distance / 30.0
    minutes = max(5, int(hours * 60))  # At least 5 minutes
    
    return timedelta(minutes=minutes)

def optimize_daily_route_and_get_time(units: List[SchedulableUnit], start_location: Address) -> Tuple[List[SchedulableUnit], timedelta]:
    """
    Optimizes the sequence of units for a single day and calculates total time.
    
    This is a placeholder that:
    1. Uses brute-force TSP for small routes (≤8 stops)
    2. Uses nearest neighbor approximation for larger routes
    3. Includes travel time between stops
    4. Returns both the optimized sequence and total time
    
    Args:
        units: List of SchedulableUnit to optimize
        start_location: Starting location for the route
        
    Returns:
        Tuple of (optimized sequence, total time including travel)
    """
    if not units:
        return [], timedelta(0)
        
    if len(units) == 1:
        total_time = calculate_travel_time(start_location, units[0].location) + units[0].duration
        return units, total_time
        
    # For small routes (≤8 stops), use brute-force TSP
    if len(units) <= 8:
        best_sequence = None
        best_time = timedelta(days=999)  # Large initial value
        
        def permutations(lst):
            if len(lst) == 0:
                return [[]]
            result = []
            for i in range(len(lst)):
                current = lst[i]
                remaining = lst[:i] + lst[i+1:]
                for p in permutations(remaining):
                    result.append([current] + p)
            return result
            
        for sequence in permutations(units):
            time = timedelta(0)
            current_loc = start_location
            
            for unit in sequence:
                time += calculate_travel_time(current_loc, unit.location)
                time += unit.duration
                current_loc = unit.location
                
            if time < best_time:
                best_time = time
                best_sequence = sequence
                
        return best_sequence, best_time
        
    # For larger routes, use nearest neighbor approximation
    else:
        sequence = []
        remaining = units.copy()
        current_loc = start_location
        total_time = timedelta(0)
        
        while remaining:
            # Find nearest unvisited stop
            next_unit = min(remaining,
                          key=lambda u: calculate_travel_time(current_loc, u.location))
            
            # Add to sequence and update time
            sequence.append(next_unit)
            travel = calculate_travel_time(current_loc, next_unit.location)
            total_time += travel + next_unit.duration
            
            # Update for next iteration
            current_loc = next_unit.location
            remaining.remove(next_unit)
            
        return sequence, total_time

def update_etas_for_schedule(technician: Technician) -> Dict[int, datetime]:
    """Update ETAs for all jobs in a technician's schedule based on optimized routes.
    
    Args:
        technician: The technician whose schedule needs ETA updates
        
    Returns:
        Dict mapping job IDs to their estimated start times
    """
    if not technician.availability:
        return {}  # Return empty dict if no availability
        
    etas: Dict[int, datetime] = {}
    current_location = technician.current_location
    
    # Process each day's units
    for day, units in technician.schedule.items():
        # Get availability for the day
        try:
            avail = technician.availability[day]
            if isinstance(avail, dict):
                day_start = avail['start_time']
                day_end = avail['end_time']
            else:
                day_start = avail.start_time
                day_end = avail.end_time
        except (KeyError, AttributeError):
            continue  # Skip days with no availability
        
        # Start from home base or current location
        current_time = day_start
        current_loc = technician.current_location if day == 1 else technician.home_location
        
        # Process each unit in the optimized sequence
        for unit in units:
            # Add travel time to unit location
            travel = calculate_travel_time(current_loc, unit.location)
            unit_start = current_time + travel
            
            # Check if we're still within the day's availability
            if unit_start + unit.duration > day_end:
                print(f"Warning: Schedule overflow on day {day} for tech {technician.id}")
                break
                
            # Update ETAs for all jobs in this unit
            job_start = unit_start
            for job in unit.jobs:
                etas[job.id] = job_start
                job.estimated_sched = job_start  # Update the job object directly
                job_start += job.job_duration  # For sequential jobs within unit
                
            # Update for next unit
            current_time = job_start
            current_loc = unit.location
            
    return etas 