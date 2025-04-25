from fastapi import FastAPI, HTTPException
from models import (
    OptimizationRequestPayload, 
    OptimizationResponsePayload, 
    TechnicianRoute, 
    RouteStop
)
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from datetime import datetime, timedelta, timezone
import pytz # For robust timezone handling if needed, though ISO strings often include offset
from typing import List, Literal

# --- Helper Functions ---

# Define a reference epoch (e.g., start of the day or earliest time in payload)
# Using UTC for consistency is generally best.
# EPOCH = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) # Removed floating EPOCH

def iso_to_seconds(iso_str: str) -> int:
    """Converts ISO 8601 string to seconds since the Unix epoch (UTC)."""
    print(f"DEBUG iso_to_seconds received: '{iso_str}' (Type: {type(iso_str)})") 
    
    # Replace 'Z' with '+00:00' for better compatibility with fromisoformat
    if iso_str.endswith('Z'):
        processed_iso_str = iso_str[:-1] + '+00:00'
    else:
        processed_iso_str = iso_str
        
    print(f"DEBUG iso_to_seconds processing: '{processed_iso_str}'") # Log processed string
    
    # Parse the potentially modified string
    dt = datetime.fromisoformat(processed_iso_str)
    
    # Ensure dt is offset-aware (it should be now if it had offset or Z)
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        # This case should be less likely now, but good to keep as fallback
        print(f"Warning: ISO string '{iso_str}' parsed as naive datetime. Assuming UTC.")
        dt = dt.replace(tzinfo=timezone.utc)
            
    # Convert to UTC timestamp (seconds since Unix epoch)
    return int(dt.timestamp())

def seconds_to_iso(seconds: int) -> str:
    """Converts seconds since the Unix epoch back to ISO 8601 string (UTC)."""
    # global EPOCH # Removed usage
    # Convert seconds since epoch to UTC datetime object
    dt = datetime.fromtimestamp(seconds, tz=timezone.utc)
    # dt = EPOCH + timedelta(seconds=seconds) # Old logic
    # Use isoformat() with 'Z' suffix for explicit UTC indication
    return dt.isoformat(timespec='seconds').replace('+00:00', 'Z')

# --- FastAPI App ---

app = FastAPI(
    title="Job Scheduler Optimization Service",
    description="Receives scheduling problems and returns optimized routes using OR-Tools.",
    version="0.1.0"
)

@app.get("/health", 
         summary="Health check endpoint",
         tags=["Health"],
         status_code=200)
async def health_check():
    """
    Simple health check endpoint to verify the service is running.
    """
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.post("/optimize-schedule", 
            response_model=OptimizationResponsePayload,
            summary="Solve the vehicle routing problem for job scheduling",
            tags=["Optimization"]
            )
async def optimize_schedule(payload: OptimizationRequestPayload) -> OptimizationResponsePayload:
    """
    Accepts a detailed scheduling problem description and returns optimized routes.
    """
    print("--- Entering /optimize-schedule endpoint ---") # Added entry log
    try:
        # Log payload summary (avoid logging full large payload unless necessary)
        print(f"Received optimization request with {len(payload.items)} items, {len(payload.technicians)} technicians.")
        
        if not payload.items:
            print("No items provided, returning success.")
            return OptimizationResponsePayload(status='success', message='No items provided for scheduling.', routes=[], unassignedItemIds=[])
        if not payload.technicians:
            print("No technicians provided, returning error.")
            return OptimizationResponsePayload(status='error', message='No technicians available for scheduling.', routes=[], unassignedItemIds=[item.id for item in payload.items])

        # --- Calculate Planning Epoch ---
        # Use the earliest technician start time as the reference point (epoch) for relative time calculations.
        try:
            planning_epoch_seconds = min(iso_to_seconds(t.earliestStartTimeISO) for t in payload.technicians)
            print(f"Planning Epoch (Earliest Tech Start): {planning_epoch_seconds} ({seconds_to_iso(planning_epoch_seconds)}) UTC")
        except ValueError as e: 
             print(f"Error calculating planning epoch: {e}")
             raise HTTPException(status_code=400, detail="Invalid technician start times provided.")

        num_locations = len(payload.locations)
        num_vehicles = len(payload.technicians)
        num_items = len(payload.items)
        
        # Map item IDs to their index in the payload.items list for easier lookup
        item_id_to_payload_index = {item.id: i for i, item in enumerate(payload.items)}
        # Map solver indices back to location IDs/coords for travel matrix lookup
        location_index_map = {loc.index: loc for loc in payload.locations}
        
        print("Setting up OR-Tools RoutingIndexManager...")
        # Create the routing index manager.
        # Number of nodes = locations. Start/End nodes are defined per vehicle.
        manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, 
                                            [t.startLocationIndex for t in payload.technicians],
                                            [t.endLocationIndex for t in payload.technicians])

        print("Setting up OR-Tools RoutingModel...")
        # Create Routing Model.
        routing = pywrapcp.RoutingModel(manager)

        # --- Callbacks ---
        
        # Define a large cost to represent infeasibility
        INFEASIBLE_COST = 9999999 

        # Travel time callback
        def travel_time_callback(from_index_mgr, to_index_mgr):
            """Returns travel time in seconds between two solver indices."""
            from_node = manager.IndexToNode(from_index_mgr)
            to_node = manager.IndexToNode(to_index_mgr)
            
            try:
                from_loc_idx = location_index_map.get(from_node)
                to_loc_idx = location_index_map.get(to_node)
                
                if from_loc_idx is None or to_loc_idx is None:
                    print(f"Warning: Invalid node index encountered in travel_time_callback ({from_node} or {to_node})")
                    return INFEASIBLE_COST # Use defined constant

                from_loc_payload_idx = from_loc_idx.index 
                to_loc_payload_idx = to_loc_idx.index

                # REVIEW NOTE (Travel Time Error Handling): 
                # Uses .get() with a large default cost (INFEASIBLE_COST).
                # If a travel time entry is missing from the payload matrix, this segment
                # becomes prohibitively expensive, effectively preventing the solver from using it.
                # This is acceptable, but relies on the upstream service providing a complete matrix.
                # Extensive missing data could lead to suboptimal or failed plans.
                travel_time = payload.travelTimeMatrix.get(from_loc_payload_idx, {}).get(to_loc_payload_idx, INFEASIBLE_COST)
                # Add a check for negative travel times, which are invalid
                if travel_time < 0:
                    print(f"Warning: Negative travel time ({travel_time}) found for {from_loc_payload_idx} -> {to_loc_payload_idx}. Using INFEASIBLE_COST.")
                    return INFEASIBLE_COST
                return travel_time
            except Exception as e:
                print(f"TRAVEL_CALLBACK EXCEPTION: Nodes {from_node} -> {to_node}. Error: {e}. Large cost.")
                return INFEASIBLE_COST

        transit_callback_index = routing.RegisterTransitCallback(travel_time_callback)
        
        # --- NEW: Arc Cost Callback incorporating Eligibility --- 
        # Helper to find item by location index safely
        def find_item_by_location_idx(loc_idx):
            for item in payload.items:
                if item.locationIndex == loc_idx:
                    return item
            return None
            
        def arc_cost_callback(vehicle_index, from_index_mgr, to_index_mgr):
            """Calculates arc cost: travel time + HUGE penalty if tech is ineligible for the destination node."""
            technician_id = payload.technicians[vehicle_index].id
            from_node = manager.IndexToNode(from_index_mgr)
            to_node = manager.IndexToNode(to_index_mgr)

            # 1. Get Base Travel Time
            travel_cost = travel_time_callback(from_index_mgr, to_index_mgr)
            if travel_cost >= INFEASIBLE_COST:
                return INFEASIBLE_COST # If base travel is impossible, return infeasible cost

            # 2. Check Eligibility for the *Destination* Node (to_node)
            destination_item = find_item_by_location_idx(to_node)
            
            if destination_item: # Is the destination an item location?
                # Check if the current vehicle's technician is eligible
                if technician_id not in destination_item.eligibleTechnicianIds:
                    # print(f"DEBUG ArcCost: Tech {technician_id} INELIGIBLE for Item {destination_item.id} at node {to_node}. Returning INFEASIBLE.")
                    return INFEASIBLE_COST # Assign huge cost if ineligible
            
            # If destination is not an item or tech is eligible, return base travel cost
            # print(f"DEBUG ArcCost: Tech {technician_id} eligible for node {to_node}. Cost: {travel_cost}")
            return travel_cost

        # Register the new arc cost callback for ALL vehicles
        arc_cost_callback_index = routing.RegisterTransitCallback(lambda from_i, to_i: arc_cost_callback(0, from_i, to_i)) # Temp for registration?
        # Need per vehicle callback registration
        vehicle_arc_cost_callback_indices = []
        for i in range(num_vehicles):
            vehicle_arc_cost_callback_indices.append(
                routing.RegisterTransitCallback(lambda from_i, to_i, vehicle_index=i: arc_cost_callback(vehicle_index, from_i, to_i))
            )
            
        # Set the Arc Cost Evaluator for EACH vehicle using its specific callback index
        for i in range(num_vehicles):
             routing.SetArcCostEvaluatorOfVehicle(vehicle_arc_cost_callback_indices[i], i)

        # Service time (demand) callback
        item_solver_indices = {} 
        def service_time_callback(index_mgr):
            node = manager.IndexToNode(index_mgr)
            for i, item in enumerate(payload.items):
                if item.locationIndex == node:
                    item_solver_indices[item.id] = index_mgr
                    return item.durationSeconds
            return 0 # Depots have zero service time

        # Combined Transit + Service Time Callback for Time Dimension
        def transit_plus_service_time_callback(from_index_mgr, to_index_mgr):
            """Returns travel_time(from, to) + service_time(from)."""
            travel = travel_time_callback(from_index_mgr, to_index_mgr)
            service = service_time_callback(from_index_mgr)
            # Add safety check for large costs indicating errors
            if travel >= 999999 or service >= 999999:
                 return 999999 # Propagate large cost if inputs were invalid
            return travel + service

        # Register the combined callback
        combined_time_callback_index = routing.RegisterTransitCallback(transit_plus_service_time_callback)

        # --- Dimensions ---

        # Time Dimension
        # Calculate the maximum horizon needed relative to the planning epoch
        max_relative_horizon = max(iso_to_seconds(t.latestEndTimeISO) - planning_epoch_seconds for t in payload.technicians)
        horizon_with_buffer = max_relative_horizon + (7 * 24 * 3600) # Add a week buffer
        # Ensure horizon is not negative if all end times are before the epoch (edge case)
        horizon_with_buffer = max(0, horizon_with_buffer)

        routing.AddDimensionWithVehicleCapacity(
            combined_time_callback_index, # Use combined travel + service time for dimension propagation
            0,  # Slack for the dimension (usually 0 for time)
            # Provide a list of capacities, one for each vehicle
            [horizon_with_buffer] * num_vehicles, 
            False,  # start cumul to zero = False (start times vary based on tech availability)
            "Time"
        )
        time_dimension = routing.GetDimensionOrDie("Time")
        # Ensure the time dimension uses the travel time for transit calculations
        # (This might already be implicit via SetArcCostEvaluatorOfAllVehicles, but let's be explicit if possible/needed)

        # --- Constraints ---

        # Technician Time Windows
        print("Applying Technician Time Windows...")
        for i, tech in enumerate(payload.technicians):
            start_seconds_abs = iso_to_seconds(tech.earliestStartTimeISO)
            end_seconds_abs = iso_to_seconds(tech.latestEndTimeISO)
            
            # Convert to relative seconds
            start_seconds_rel = max(0, start_seconds_abs - planning_epoch_seconds)
            end_seconds_rel = max(0, end_seconds_abs - planning_epoch_seconds)

            # Ensure start <= end (basic sanity check)
            if start_seconds_rel > end_seconds_rel:
                print(f"Warning: Tech {tech.id} relative start > end ({start_seconds_rel} > {end_seconds_rel}). Clamping end.")
                end_seconds_rel = start_seconds_rel
            
            # print(f"  Tech {tech.id}: Rel Window [{start_seconds_rel}, {end_seconds_rel}]") # Less verbose
            time_dimension.CumulVar(routing.Start(i)).SetRange(start_seconds_rel, end_seconds_rel)
            time_dimension.CumulVar(routing.End(i)).SetRange(start_seconds_rel, end_seconds_rel)

        # Item Constraints (Fixed Time AND Earliest Start Time)
        print("Applying Item Time Constraints (Fixed & Earliest Start)...")
        for item_payload_idx, item in enumerate(payload.items):
            item_loc_index = item.locationIndex
            try:
                solver_index = manager.NodeToIndex(item_loc_index)
                if solver_index == -1:
                    print(f"Warning: Could not get solver index for item {item.id} at loc {item_loc_index}. Skipping constraints.")
                    continue
                
                # Apply Earliest Start Time constraint if present
                if item.earliestStartTimeISO:
                    try:
                        earliest_start_abs = iso_to_seconds(item.earliestStartTimeISO)
                        earliest_start_rel = max(0, earliest_start_abs - planning_epoch_seconds)
                        # Apply lower bound to the start time cumulative variable
                        time_dimension.CumulVar(solver_index).SetMin(earliest_start_rel)
                        # print(f"Applied earliest start for item {item.id} (solver idx {solver_index}) at {earliest_start_rel}s rel") # Less verbose
                    except ValueError as e:
                        print(f"Warning: Invalid earliestStartTimeISO '{item.earliestStartTimeISO}' for item {item.id}. Skipping constraint. Error: {e}")
                
                # Check for Fixed Time Constraint specifically for THIS item
                fixed_constraint = next((fc for fc in payload.fixedConstraints if fc.itemId == item.id), None)
                if fixed_constraint:
                    try:
                        fixed_time_seconds_abs = iso_to_seconds(fixed_constraint.fixedTimeISO)
                        fixed_time_seconds_rel = max(0, fixed_time_seconds_abs - planning_epoch_seconds)
                        # SetRange enforces BOTH min and max to be the fixed time
                        time_dimension.CumulVar(solver_index).SetRange(fixed_time_seconds_rel, fixed_time_seconds_rel)
                        # print(f"Applied fixed time for item {item.id} (solver idx {solver_index}) at {fixed_time_seconds_rel}s rel") # Less verbose
                    except ValueError as e:
                         print(f"Warning: Invalid fixedTimeISO '{fixed_constraint.fixedTimeISO}' for item {item.id}. Skipping constraint. Error: {e}")

            except Exception as e:
                print(f"Error applying time constraints for item {item.id}: {e}")

        # Technician Eligibility (Disjunctions) & Priority Penalties
        # Get lists of all start and end location indices for depot check
        starts = [t.startLocationIndex for t in payload.technicians]
        ends = [t.endLocationIndex for t in payload.technicians]

        # Add high penalty for dropping high-priority nodes
        # OR-Tools handles priority implicitly via penalties for dropping nodes
        # Higher penalty means less likely to be dropped.
        # Adjust penalty calculation as needed based on priority scale (e.g., 1 = highest)
        max_priority = max((item.priority for item in payload.items if item.priority is not None), default=1)
        # base_penalty = 1000 # Base penalty for being unserved
        # <<< INCREASE PENALTY SIGNIFICANTLY >>>
        # Ensure penalty outweighs reasonable travel times. If max travel is ~1hr (3600s), penalty should be higher.
        base_penalty = 100000 

        print("Applying Disjunctions (Eligibility & Priority)...")
        for i, item in enumerate(payload.items):
            # Ensure locationIndex is valid
            if not (0 <= item.locationIndex < num_locations):
                 print(f"Warning: Item {item.id} has invalid locationIndex {item.locationIndex}. Skipping disjunction.")
                 continue

            # Check if item is AT a depot location *before* getting solver index
            is_at_depot_location = item.locationIndex in starts or item.locationIndex in ends
            if is_at_depot_location:
                print(f"Info: Item {item.id} is at a depot location ({item.locationIndex}). Skipping disjunction.")
                continue
                
            # Get solver index ONLY for non-depot items
            solver_index = manager.NodeToIndex(item.locationIndex)
            if solver_index == -1:
                print(f"Warning: Item {item.id} locIdx {item.locationIndex} resulted in invalid solver index -1. Skipping disjunction.")
                continue # Should not happen due to check above, but safety first

            eligible_vehicles = [
                tech_idx for tech_idx, tech in enumerate(payload.technicians)
                if tech.id in item.eligibleTechnicianIds # Check if tech's ID is in the item's eligible list
            ]

            # If a non-depot item has NO eligible vehicles, it cannot be served.
            if not eligible_vehicles:
                print(f"Info: Item {item.id} has no eligible vehicles. Skipping disjunction.")
                continue 

            # Priority calculation (ensure priority is not None)
            if item.priority is None:
                 print(f"Warning: Item {item.id} has None priority. Using default base penalty.")
                 priority_penalty = base_penalty
            else:
                # REVIEW NOTE (Priority Penalty Calculation):
                # Penalty scales linearly based on priority number (lower number = higher priority = higher penalty).
                # Base penalty (100k) is much larger than typical travel times (~3.6k for 1hr),
                # ensuring solver strongly prefers adding travel over dropping jobs.
                # This relies on the numerical priority accurately reflecting relative importance.
                # It does not directly use monetary business value (see TASK.md future enhancement).
                priority_penalty = base_penalty * (max_priority - item.priority + 1)

            # Ensure penalty is non-negative
            if priority_penalty < 0:
                print(f"Warning: Calculated negative penalty ({priority_penalty}) for item {item.id}. Clamping to 0.")
                priority_penalty = 0

            # Allow the solver to drop the NON-DEPOT node (item) with the calculated penalty.
            # max_cardinality=1 means at most one technician will serve this item.
            # print(f"  Attempting AddDisjunction for non-depot item {item.id} (solver_index {solver_index})") # <<< REMOVING DEBUG PRINT
            try:
                 routing.AddDisjunction([solver_index], priority_penalty, 1)
                 # print(f"Added disjunction for item {item.id} (idx {solver_index}), penalty {priority_penalty}") # Less verbose
            except Exception as e:
                 print(f"!!! CRITICAL ERROR adding disjunction for item {item.id} (locIdx: {item.locationIndex}, solverIdx: {solver_index}, penalty: {priority_penalty}): {e}")
                 raise # Re-raise critical error
            # --- End logic for non-depot nodes ---

        # Calculation of total travel time in post-processing seems complex and might need review later.
        # Consider if OR-Tools provides a simpler way to get route travel times.

        # --- Solve ---
        print("Setting search parameters...")
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        # search_parameters.time_limit.seconds = 30 # Example time limit
        search_parameters.time_limit.FromSeconds(5) # Use short limit for testing
        # <<< Add solution limit to stop after first solution >>>
        # search_parameters.solution_limit = 1 # <<< REMOVED

        print("Starting OR-Tools solver...")
        assignment = routing.SolveWithParameters(search_parameters)
        print("Solver finished.")

        # --- Process Results ---
        routes: List[TechnicianRoute] = []
        assigned_item_ids = set()

        if assignment:
            print("Solution found. Processing assignment...")
            # Define helper to find item by location index safely
            def find_item_by_location(loc_idx):
                for item in payload.items:
                    if item.locationIndex == loc_idx:
                        return item
                return None
            
            for vehicle_id in range(num_vehicles):
                index = routing.Start(vehicle_id)
                technician_id = payload.technicians[vehicle_id].id
                route_stops: List[RouteStop] = []
                total_travel_time_seconds = 0
                is_first_segment = True # Flag to handle the first move differently

                while True: # Loop until we explicitly break at the end node
                    # Get the next index in the route assigned by the solver
                    next_index = assignment.Value(routing.NextVar(index))

                    # Calculate travel time for the segment from current index to next index
                    # Use the original travel_time_callback which returns duration in seconds
                    segment_travel_time = travel_time_callback(index, next_index)
                    
                    # --- Accumulate travel time ---
                    # Only add segment travel if it's not a loop back to the start or from the start to itself immediately
                    # And only if the travel time is reasonable (not the large penalty)
                    if index != next_index and segment_travel_time < 999999:
                        # Check if 'index' is the start node for this vehicle
                        is_start_node = (index == routing.Start(vehicle_id))
                        # Check if 'next_index' is the end node for this vehicle
                        is_end_node = routing.IsEnd(next_index)

                        # Accumulate travel time unless it's the very first move from start OR the very last move to end?
                        # OR-Tools objective includes all travel. Let's just sum it simply first.
                        # Correction: Sum ALL valid segment travel times. The total is needed later.
                        total_travel_time_seconds += segment_travel_time

                    # --- Check if the next node is the end node for this vehicle ---
                    if routing.IsEnd(next_index):
                        # We have completed the route segments for this vehicle.
                        # print(f"Vehicle {vehicle_id}: Reached end node {manager.IndexToNode(next_index)}.") # Less verbose
                        break # Exit the while loop

                    # --- Process the stop at `next_index` (it's not the end node) ---
                    node_index = manager.IndexToNode(next_index)
                    current_item = find_item_by_location(node_index)

                    if current_item:
                        assigned_item_ids.add(current_item.id)

                        # --- Get relative times from solver ---
                        current_start_time_var = time_dimension.CumulVar(next_index)
                        current_start_time_rel = assignment.Value(current_start_time_var)
                        
                        # --- Calculate Arrival Time using Slack Var ---
                        #current_slack_var = time_dimension.SlackVar(next_index)
                        #current_wait_time_rel = assignment.Value(current_slack_var) # Wait time before service
                        #arrival_at_next_rel = current_start_time_rel - current_wait_time_rel
                        # --- End Arrival Time Calculation ---
                        
                        current_service_duration = current_item.durationSeconds # Duration is absolute
                        current_end_time_rel = current_start_time_rel + current_service_duration
                        
                        # Calculate arrival time relative to planning epoch
                        if is_first_segment:
                            # For the first segment, departure is based on technician's earliest start
                            tech_earliest_start_abs = iso_to_seconds(payload.technicians[vehicle_id].earliestStartTimeISO)
                            departure_from_index_rel = max(0, tech_earliest_start_abs - planning_epoch_seconds)
                            # No service duration at the actual start node
                        else:
                            # For subsequent segments, departure is based on the previous stop's scheduled start + service
                            start_cumul_var = time_dimension.CumulVar(index)
                            start_cumul_rel = assignment.Value(start_cumul_var) # Time when service at 'index' CAN start
                            previous_service_duration = service_time_callback(index) # Service duration at the previous node 'index'
                            departure_from_index_rel = start_cumul_rel + previous_service_duration

                        # Physical arrival is departure + travel
                        physical_arrival_at_next_rel = departure_from_index_rel + segment_travel_time # <-- Use this for arrivalTimeISO

                        # Scheduled start time is dictated by the solver, respecting constraints (like fixed times)
                        scheduled_start_time_rel = assignment.Value(time_dimension.CumulVar(next_index)) # <-- Use this for startTimeISO
                        scheduled_end_time_rel = scheduled_start_time_rel + current_service_duration # <-- Use this for endTimeISO
                        # --- End Calculation ---

                        # --- Convert relative times to absolute Unix seconds ---
                        arrival_at_next_abs = physical_arrival_at_next_rel + planning_epoch_seconds
                        current_start_time_abs = scheduled_start_time_rel + planning_epoch_seconds
                        current_end_time_abs = scheduled_end_time_rel + planning_epoch_seconds

                        # Consistency check (optional but good for debugging)
                        # Check if absolute start time is >= absolute arrival time (allowing for minimal slack)
                        # if current_start_time_abs < arrival_at_next_abs - 1: # Allow 1s tolerance
                        #      print(f"!!! WARNING Vehicle {vehicle_id}, Item {current_item.id}: Solver abs start time {current_start_time_abs} ({seconds_to_iso(current_start_time_abs)}) is earlier than calculated abs arrival {arrival_at_next_abs} ({seconds_to_iso(arrival_at_next_abs)}). Diff: {arrival_at_next_abs - current_start_time_abs}s. Check model.")

                        # <<< Remove Debug Prints (already removed most in previous edit)
                        # print(f"DEBUG Vehicle {vehicle_id}, Item {current_item.id}:")
                        # print(f"  - Prev Node Idx: {manager.IndexToNode(index)}, Curr Node Idx: {manager.IndexToNode(next_index)}")
                        # print(f"  - physical_arrival_at_next_rel: {physical_arrival_at_next_rel}")
                        # print(f"  - scheduled_start_time_rel:   {scheduled_start_time_rel}")
                        # print(f"  - arrival_at_next_abs:        {arrival_at_next_abs} -> {seconds_to_iso(arrival_at_next_abs)}")
                        # print(f"  - current_start_time_abs:     {current_start_time_abs} -> {seconds_to_iso(current_start_time_abs)}")
                        # print(f"  - current_end_time_abs:       {current_end_time_abs} -> {seconds_to_iso(current_end_time_abs)}")
                        # <<< End Debug Prints >>>

                        route_stops.append(RouteStop(
                            itemId=current_item.id,
                            arrivalTimeISO=seconds_to_iso(arrival_at_next_abs),
                            startTimeISO=seconds_to_iso(current_start_time_abs),
                            endTimeISO=seconds_to_iso(current_end_time_abs)
                        ))
                    else:
                        # This case should ideally not happen if only item locations are visited besides start/end
                        # unless an item is located *at* a depot.
                        # Let's verify if node_index corresponds to a start/end depot location for this vehicle.
                        tech_start_loc = payload.technicians[vehicle_id].startLocationIndex
                        tech_end_loc = payload.technicians[vehicle_id].endLocationIndex
                        if node_index == tech_start_loc:
                            print(f"Debug: Vehicle {vehicle_id} visited its own start depot {node_index} mid-route?")
                        elif node_index == tech_end_loc:
                             print(f"Debug: Vehicle {vehicle_id} visited its own end depot {node_index} mid-route?")
                        else:
                             # Check if it's another vehicle's depot
                             is_any_depot = False
                             for t in payload.technicians:
                                 if node_index == t.startLocationIndex or node_index == t.endLocationIndex:
                                     is_any_depot = True
                                     break
                             if is_any_depot:
                                print(f"Debug: Vehicle {vehicle_id} visited depot node {node_index} (solver index {next_index}) mid-route. No item found.")
                             else:
                                 # Truly unexpected node
                                 print(f"Warning: Could not find item for non-depot node index {node_index} (solver index {next_index}) in route for vehicle {vehicle_id}")

                    # Move to the next node for the next iteration
                    index = next_index
                    is_first_segment = False # No longer the first segment
                    # --- End of loop iteration ---

                # --- After loop for one vehicle --- 
                total_duration_seconds = 0
                if route_stops:
                     # Duration from first arrival to last end time
                     first_stop_arrival = iso_to_seconds(route_stops[0].arrivalTimeISO)
                     last_stop_end = iso_to_seconds(route_stops[-1].endTimeISO)
                     total_duration_seconds = last_stop_end - first_stop_arrival
                
                # Only add routes that actually have stops
                if route_stops:
                    # Re-verify technician eligibility (should be guaranteed by solver if model is correct, but good practice)
                    is_route_valid = True
                    for stop in route_stops:
                        item_payload_idx = item_id_to_payload_index.get(stop.itemId)
                        if item_payload_idx is None: continue 
                        item = payload.items[item_payload_idx]
                        if technician_id not in item.eligibleTechnicianIds:
                            print(f"Error: Solver assigned item {stop.itemId} to ineligible technician {technician_id}. Route invalid.")
                            is_route_valid = False
                            # Mark items from this invalid route as unassigned
                            for s in route_stops: assigned_item_ids.discard(s.itemId)
                            break 
                    
                    if is_route_valid:
                        routes.append(TechnicianRoute(
                            technicianId=technician_id,
                            stops=route_stops,
                            totalTravelTimeSeconds=total_travel_time_seconds,
                            totalDurationSeconds=total_duration_seconds
                        ))

            # --- After processing all vehicles --- 
            unassigned_item_ids = [item.id for item in payload.items if item.id not in assigned_item_ids]
            
            status: Literal['success', 'partial', 'error']
            message: str
            if not unassigned_item_ids:
                status = 'success'
                message = 'Optimization successful. All items scheduled.'
            elif len(unassigned_item_ids) < num_items:
                status = 'partial'
                message = f'Optimization partially successful. {len(unassigned_item_ids)} items could not be scheduled.'
                print(f"Unassigned items: {unassigned_item_ids}")
            else: # All items unassigned
                 status = 'error' # Treat as error if nothing could be scheduled
                 message = 'Optimization failed. No routes could be assigned.'
                 print(f"All items were unassigned.")

            if assignment: # Check if a solution was found
                print(f"Solver finished. Final Objective Value: {assignment.ObjectiveValue()}")

            print(f"Returning status: {status}, message: {message}")
            return OptimizationResponsePayload(
                status=status,
                message=message,
                routes=routes,
                unassignedItemIds=unassigned_item_ids
            )
        else:
            print("No solution found by the solver.")
            # No solution found
            return OptimizationResponsePayload(
                status='error',
                message='Optimization failed. No solution found.',
                routes=[],
                unassignedItemIds=[item.id for item in payload.items] # All items are unassigned
            )

    except HTTPException as http_exc: # Re-raise HTTP exceptions
         print(f"Caught HTTPException: {http_exc.detail}")
         raise http_exc
    except Exception as e:
        # Catch any other unexpected error during processing
        print(f"!!! UNHANDLED EXCEPTION in /optimize-schedule: {type(e).__name__}: {e}")
        # Import traceback here if needed for more detail
        import traceback
        traceback.print_exc()
        
        # Return a structured error response
        return OptimizationResponsePayload(
            status='error',
            message=f"Internal server error during optimization: {type(e).__name__}",
            routes=[],
            unassignedItemIds=[item.id for item in payload.items] # Assume all failed
        )

# Example of how to run this locally (requires uvicorn):
# uvicorn main:app --reload --port 8000 
# You can then access the interactive API docs at http://127.0.0.1:8000/docs
