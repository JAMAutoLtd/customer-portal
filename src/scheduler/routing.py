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
# from itertools import permutations # No longer needed for brute-force

# OR-Tools import
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

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

def optimize_daily_route_and_get_time(
    units: List[SchedulableUnit], 
    start_location: Address, 
    time_constraints: Optional[Dict[str, datetime]] = None, # unit.id -> fixed_start_time
    day_start_time: Optional[datetime] = None # Need the actual start time of the availability window
) -> Tuple[List[SchedulableUnit], timedelta, Dict[str, datetime]]:
    """
    Optimizes the sequence of units for a single day using OR-Tools and calculates total time.
    
    Args:
        units: List of SchedulableUnit to optimize.
        start_location: Starting location for the route (technician's start for the day).
        time_constraints: Optional dictionary of fixed start times for units.
        day_start_time: The actual start time of the technician's availability for this day.
        
    Returns:
        Tuple of (optimized sequence of SchedulableUnits, 
                  total time including travel and service,
                  dictionary mapping unit.id to calculated start datetime).
        Returns ([], timedelta(0), {}) if optimization fails or no units.
    """
    if not units:
        return [], timedelta(0), {}
        
    if time_constraints is None:
        time_constraints = {}
        
    if day_start_time is None:
        # Cannot proceed without the day's start time for time dimension
        print("Error: optimize_daily_route_and_get_time requires day_start_time.")
        # HACK: Use a default if not provided, but this is incorrect
        day_start_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
        # return [], timedelta(0) # Safer to return empty on error

    # --- 1. Prepare Data for OR-Tools --- 
    
    # Combine start location and unit locations into a list
    locations = [start_location] + [u.location for u in units]
    num_locations = len(locations)
    num_vehicles = 1
    depot_index = 0 # Index of the start_location in the locations list
    
    # Map unit IDs to their index in the OR-Tools model (offset by 1 for depot)
    unit_id_to_index_map = {unit.id: i + 1 for i, unit in enumerate(units)}
    index_to_unit_map = {i + 1: unit for i, unit in enumerate(units)}

    # Create the routing index manager
    manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, depot_index)

    # Create Routing Model
    routing = pywrapcp.RoutingModel(manager)

    # --- 2. Define Callbacks --- 

    # Distance Callback (Travel Time)
    def distance_callback(from_index_int, to_index_int): 
        """Returns the travel time between two locations in seconds."""
        from_node = manager.IndexToNode(from_index_int)
        to_node = manager.IndexToNode(to_index_int)
        
        # Get Address objects, handle depot index 0
        start_loc = locations[from_node]
        end_loc = locations[to_node]
        
        travel_delta = calculate_travel_time(start_loc, end_loc)
        return int(travel_delta.total_seconds())

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Time Dimension Callback (Travel Time + Service Time)
    def time_callback(from_index_int, to_index_int):
        """Returns total time (travel + service) between stops in seconds."""
        from_node = manager.IndexToNode(from_index_int)
        to_node = manager.IndexToNode(to_index_int)
        
        # Get Address objects
        start_loc = locations[from_node]
        end_loc = locations[to_node]
        
        travel_seconds = distance_callback(from_index_int, to_index_int)
        
        # Get service time (duration) for the *destination* node
        service_seconds = 0
        if to_node != depot_index:
            unit = index_to_unit_map.get(to_node)
            if unit:
                service_seconds = int(unit.duration.total_seconds())
                
        return travel_seconds + service_seconds

    time_callback_index = routing.RegisterTransitCallback(time_callback)

    # --- 3. Add Time Dimension and Constraints --- 
    
    time_dimension_name = 'TimeDim'
    max_daily_seconds = 24 * 3600 # Allow planning within a 24-hour horizon initially
    routing.AddDimension(
        time_callback_index,
        0,  # No slack
        max_daily_seconds, # Vehicle maximum capacity (seconds)
        False,  # Don't force start cumul to zero, will be set by fixed start time or availability
        time_dimension_name)
    time_dimension = routing.GetDimensionOrDie(time_dimension_name)

    # Convert day_start_time to seconds relative to a common epoch (e.g., start of the day)
    # This is tricky if day_start_time spans midnight relative to the epoch used for fixed times
    # Simplification: Assume all times are within the same day relative to day_start_time for now
    # A robust solution might need an absolute epoch reference (like Unix timestamp)
    day_start_seconds = 0 # Reference point for the dimension

    # Apply Fixed Time Windows
    # TODO: Robust Time Zone Handling: Ensure fixed_time and day_start_time are comparable 
    # (e.g., both timezone-aware in UTC). Potential issues if mixing naive/aware or different zones.
    for unit_id, fixed_time in time_constraints.items():
        if unit_id in unit_id_to_index_map:
            index = manager.NodeToIndex(unit_id_to_index_map[unit_id])
            # Calculate fixed time in seconds relative to day_start_seconds
            fixed_time_seconds = int((fixed_time - day_start_time).total_seconds())
            
            # Ensure non-negative time if fixed_time is before day_start (shouldn't happen)
            fixed_time_seconds = max(0, fixed_time_seconds)
            
            # Set a narrow window [fixed_time, fixed_time + buffer] 
            # Buffer allows for slight solver flexibility
            buffer_seconds = 60 # e.g., 1 minute buffer
            time_dimension.CumulVar(index).SetRange(fixed_time_seconds, fixed_time_seconds + buffer_seconds)

    # Set start time constraint for the depot (optional, helps anchor)
    # index = routing.Start(0) # Vehicle 0 start
    # time_dimension.CumulVar(index).SetRange(day_start_seconds, day_start_seconds + 60) 

    # --- 4. Set Search Parameters and Solve --- 
    
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)
    # search_parameters.local_search_metaheuristic = (
    #     routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)
    # search_parameters.time_limit.seconds = 30 # Example time limit

    solution = routing.SolveWithParameters(search_parameters)

    # --- 5. Process Solution --- 
    
    optimized_sequence = []
    total_route_time_seconds = 0
    calculated_start_times = {} # Dict to store unit.id -> start_datetime

    if solution:
        time_dimension = routing.GetDimensionOrDie(time_dimension_name) # Ensure we have the dimension
        index = routing.Start(0) # Vehicle 0
        route_nodes = []
        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            route_nodes.append(node_index)
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            # Accumulate route time from the solution's dimension variables
            # total_route_time_seconds = solution.Min(time_dimension.CumulVar(index))
        
        # Add the final node (depot)
        # route_nodes.append(manager.IndexToNode(index))
        
        # Extract total time from the end node's cumulative variable
        total_route_time_seconds = solution.Min(time_dimension.CumulVar(previous_index)) # Time at arrival at last stop
        # Add service time of last stop? Check definition. Usually CumulVar is arrival time.
        last_node = manager.IndexToNode(previous_index)
        if last_node != depot_index:
            last_unit = index_to_unit_map.get(last_node)
            if last_unit: 
                 total_route_time_seconds += int(last_unit.duration.total_seconds()) # Add service time explicitly

        # Convert node sequence back to SchedulableUnits (skip depot 0)
        for node in route_nodes:
            if node != depot_index:
                unit = index_to_unit_map[node]
                optimized_sequence.append(unit)
                # Calculate start time for this unit
                or_tools_index = manager.NodeToIndex(node)
                start_seconds = solution.Min(time_dimension.CumulVar(or_tools_index))
                calculated_start_times[unit.id] = day_start_time + timedelta(seconds=start_seconds)
        
        # Optional: Print solution details for debugging
        # print(f"Route for Vehicle 0:")
        # plan_output = ""
        # index = routing.Start(0)
        # while not routing.IsEnd(index):
        #     node = manager.IndexToNode(index)
        #     time_var = time_dimension.CumulVar(index)
        #     plan_output += f" {node} ({day_start_time + timedelta(seconds=solution.Min(time_var))}) ->"
        #     index = solution.Value(routing.NextVar(index))
        # node = manager.IndexToNode(index)
        # time_var = time_dimension.CumulVar(index)
        # plan_output += f" {node} ({day_start_time + timedelta(seconds=solution.Min(time_var))})\n"
        # print(plan_output)
        
    else:
        print('No solution found!')
        # Return the original fixed units if no solution, maybe?
        # For now, return empty.
        # TODO: Add more robust error handling/logging if OR-Tools fails to find a solution.
        return [], timedelta(0), {}

    return optimized_sequence, timedelta(seconds=total_route_time_seconds), calculated_start_times

def update_etas_for_schedule(technician: Technician, daily_unit_start_times: Optional[Dict[int, Dict[str, datetime]]] = None):
    """Update ETAs for all jobs in a technician's schedule.

    If daily_unit_start_times are provided (from optimize_daily_route_and_get_time),
    uses the precise timings derived from the OR-Tools solution.
    Otherwise, falls back to recalculating based on sequence and travel time.

    Args:
        technician: The technician whose schedule needs ETA updates.
        daily_unit_start_times: Optional dict mapping day_number to a dict mapping 
                                unit.id to calculated start datetime.
    """
    # No return value needed, jobs updated by reference

    for day, units in technician.schedule.items():
        if not units:
            continue

        # Get the calculated start times for this day, if available
        unit_start_times_today = daily_unit_start_times.get(day) if daily_unit_start_times else None

        if unit_start_times_today:
            # --- Calculate ETAs using Provided Start Times --- 
            for unit in units:
                calculated_start = unit_start_times_today.get(unit.id)
                if calculated_start is None:
                    print(f"Warning: Missing calculated start time for unit {unit.id} on day {day}. ETA might be inaccurate.")
                    # Fallback needed? Or assume unit shouldn't be in schedule?
                    # For now, just skip setting ETA if lookup fails.
                    continue 
                
                unit_start_time = calculated_start
                
                # Update unit object times (optional)
                unit.estimated_start_time = unit_start_time
                unit.estimated_end_time = unit_start_time + unit.duration

                # Update ETAs for all jobs within this unit
                job_current_start = unit_start_time
                for job in unit.jobs:
                    job.estimated_sched = job_current_start 
                    # all_job_etas[job.id] = job_current_start # Not returning dict anymore
                    job_current_start += job.job_duration # Stack jobs sequentially within the unit

        else:
            # --- Fallback: Recalculate ETAs Manually --- 
            print(f"Recalculating ETAs manually for day {day}")
            try:
                # Need availability to get day_start/end for fallback
                avail = get_technician_availability(technician, day) # Use the helper
                if avail is None:
                    print(f"Warning: No availability found for day {day} during ETA fallback.")
                    continue # Skip day if no availability
                day_start = avail.start_time if hasattr(avail, 'start_time') else avail['start_time']
                day_end = avail.end_time if hasattr(avail, 'end_time') else avail['end_time']
            except Exception as e:
                 print(f"Error getting availability for day {day} during ETA fallback: {e}")
                 continue # Skip day if availability lookup fails

            current_time = day_start
            current_loc = technician.current_location if day == 1 else technician.home_location

            for unit in units:
                travel = calculate_travel_time(current_loc, unit.location)
                unit_start = current_time + travel
                
                # If fixed time, ensure we respect it (can cause waiting time)
                if unit.fixed_schedule_time:
                     unit_start = max(unit_start, unit.fixed_schedule_time)

                # Basic check against day end
                if unit_start + unit.duration > day_end:
                    print(f"Warning: Manual ETA calc overflow day {day} for tech {technician.id}")
                    # Set remaining job ETAs to None or leave as is?
                    # Let's clear them to indicate uncertainty
                    for subsequent_unit in units[units.index(unit):]:
                        for job in subsequent_unit.jobs:
                            job.estimated_sched = None
                    break # Stop calculating for this day

                # Update unit object times (optional)
                unit.estimated_start_time = unit_start
                unit.estimated_end_time = unit_start + unit.duration

                job_current_start = unit_start
                for job in unit.jobs:
                    job.estimated_sched = job_current_start
                    # all_job_etas[job.id] = job_current_start
                    job_current_start += job.job_duration
                
                current_time = unit_start + unit.duration # End time of this unit
                current_loc = unit.location

    # The Job objects within technician.schedule are updated directly by reference.
    # No explicit return value needed unless specifically required later. 