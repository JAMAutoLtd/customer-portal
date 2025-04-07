"""Tests for routing and scheduling utilities."""

import pytest
from datetime import datetime, timedelta, time
import math
import uuid
from unittest.mock import patch, MagicMock

from src.scheduler.routing import (
    calculate_travel_time,
    optimize_daily_route_and_get_time,
    update_etas_for_schedule,
    get_technician_availability
)
from src.scheduler.models import (
    Address, SchedulableUnit, Technician, Job, DailyAvailability, JobStatus,
    Order, CustomerType, CustomerVehicle, Service, ServiceCategory, EquipmentType
)

# --- Test Data ---

@pytest.fixture
def test_locations():
    """Create a set of test locations with known distances."""
    # Using real NYC area coordinates for realistic testing
    return {
        'manhattan': Address(id=1, street_address="Manhattan", lat=40.7128, lng=-74.0060),
        'brooklyn': Address(id=2, street_address="Brooklyn", lat=40.6782, lng=-73.9442),
        'queens': Address(id=3, street_address="Queens", lat=40.7282, lng=-73.7949),
        'bronx': Address(id=4, street_address="Bronx", lat=40.8448, lng=-73.8648),
        'staten': Address(id=5, street_address="Staten Island", lat=40.5795, lng=-74.1502),
    }

@pytest.fixture
def test_orders(test_locations):
    """Create test orders."""
    vehicle = CustomerVehicle(
        id=1,
        vin="1HGCM82633A123456",
        make="Honda",
        year=2020,
        model="Accord"
    )
    
    return [
        Order(
            id=i,
            user_id=uuid.uuid4(),
            vehicle_id=vehicle.id,
            address_id=test_locations['manhattan'].id,
            earliest_available_time=datetime.now(),
            customer_type=CustomerType.RESIDENTIAL,
            address=test_locations['manhattan'],
            vehicle=vehicle,
            services=[]
        )
        for i in range(1, 4)  # Create orders 1, 2, 3
    ]

@pytest.fixture
def test_jobs(test_locations, test_orders):
    """Create test jobs at different locations."""
    return [
        Job(
            id=1,
            order_id=1,
            address_id=test_locations['manhattan'].id,
            priority=1,
            status=JobStatus.PENDING_REVIEW,
            job_duration=timedelta(hours=1),
            address=test_locations['manhattan'],
            equipment_requirements=[],
            order_ref=test_orders[0]
        ),
        Job(
            id=2,
            order_id=2,
            address_id=test_locations['brooklyn'].id,
            priority=2,
            status=JobStatus.PENDING_REVIEW,
            job_duration=timedelta(hours=2),
            address=test_locations['brooklyn'],
            equipment_requirements=[],
            order_ref=test_orders[1]
        ),
        Job(
            id=3,
            order_id=3,
            address_id=test_locations['queens'].id,
            priority=1,
            status=JobStatus.PENDING_REVIEW,
            job_duration=timedelta(hours=1),
            address=test_locations['queens'],
            equipment_requirements=[],
            order_ref=test_orders[2]
        )
    ]

@pytest.fixture
def test_units(test_jobs, test_locations):
    """Create test schedulable units."""
    class HashableSchedulableUnit(SchedulableUnit):
        def __eq__(self, other):
            if not isinstance(other, SchedulableUnit):
                return False
            return (self.order_id == other.order_id and
                   self.jobs == other.jobs and
                   self.priority == other.priority and
                   self.location == other.location and
                   self.duration == other.duration)

        def __hash__(self):
            return hash((self.order_id, tuple(self.jobs), self.priority))

    return [
        HashableSchedulableUnit(
            order_id=j.order_id,
            jobs=[j],
            priority=j.priority,
            location=j.address,
            duration=j.job_duration
        )
        for j in test_jobs
    ]

@pytest.fixture
def test_technician(test_locations):
    """Create a test technician with availability."""
    tech = Technician(
        id=1,
        user_id=uuid.uuid4(),
        workload=0,
        home_address=test_locations['manhattan'],
        current_location=test_locations['manhattan']
    )
    
    # Add availability for day 1
    base_date = datetime.today().replace(hour=9, minute=0, second=0, microsecond=0)
    tech.availability[1] = DailyAvailability(
        day_number=1,
        start_time=base_date,
        end_time=base_date.replace(hour=18, minute=30),
        total_duration=timedelta(hours=9, minutes=30)
    )
    
    return tech

# --- Tests for calculate_travel_time ---

def test_calculate_travel_time_same_location(test_locations):
    """Test travel time calculation when start and end are the same location."""
    time = calculate_travel_time(test_locations['manhattan'], test_locations['manhattan'])
    assert time == timedelta(minutes=5)  # Should return minimum travel time

def test_calculate_travel_time_known_distance(test_locations):
    """Test travel time calculation between locations with known distance."""
    # Manhattan to Brooklyn is roughly 5-6 miles as the crow flies
    time = calculate_travel_time(test_locations['manhattan'], test_locations['brooklyn'])
    
    # At 30mph, should take 10-12 minutes plus some buffer
    assert timedelta(minutes=8) <= time <= timedelta(minutes=15)

def test_calculate_travel_time_symmetry(test_locations):
    """Test that travel time is the same in both directions."""
    time_there = calculate_travel_time(test_locations['manhattan'], test_locations['queens'])
    time_back = calculate_travel_time(test_locations['queens'], test_locations['manhattan'])
    assert time_there == time_back

def test_calculate_travel_time_triangle_inequality(test_locations):
    """Test that direct route is never longer than going through intermediate point."""
    direct = calculate_travel_time(test_locations['manhattan'], test_locations['bronx'])
    via_queens = (
        calculate_travel_time(test_locations['manhattan'], test_locations['queens']) +
        calculate_travel_time(test_locations['queens'], test_locations['bronx'])
    )
    assert direct <= via_queens

# --- Tests for optimize_daily_route_and_get_time ---

def test_optimize_empty_route(test_locations):
    """Test optimization with empty route."""
    sequence, total_time = optimize_daily_route_and_get_time([], test_locations['manhattan'])
    assert sequence == []
    assert total_time == timedelta(0)

def test_optimize_single_stop(test_units, test_locations):
    """Test optimization with single stop."""
    sequence, total_time = optimize_daily_route_and_get_time(
        [test_units[0]], test_locations['manhattan']
    )
    assert len(sequence) == 1
    assert sequence[0] == test_units[0]
    # Total time should be travel + duration
    expected_time = (
        calculate_travel_time(test_locations['manhattan'], test_units[0].location) +
        test_units[0].duration
    )
    assert total_time == expected_time

def test_optimize_small_route(test_units, test_locations):
    """Test optimization with small route (should use brute force)."""
    sequence, total_time = optimize_daily_route_and_get_time(
        test_units[:2], test_locations['manhattan']
    )
    assert len(sequence) == 2
    assert set(sequence) == set(test_units[:2])
    # Verify it's actually optimized
    reverse_sequence, reverse_time = optimize_daily_route_and_get_time(
        list(reversed(test_units[:2])), test_locations['manhattan']
    )
    assert total_time <= reverse_time

def test_optimize_large_route(test_units, test_locations):
    """Test optimization with large route (should use nearest neighbor)."""
    # Create more units to force nearest neighbor algorithm
    many_units = test_units * 3  # 9 units total
    sequence, total_time = optimize_daily_route_and_get_time(
        many_units, test_locations['manhattan']
    )
    assert len(sequence) == len(many_units)
    assert set(sequence) == set(many_units)
    # Verify each step follows nearest neighbor
    current_loc = test_locations['manhattan']
    for unit in sequence:
        # Should be the closest among remaining
        remaining = set(many_units) - set(sequence[:sequence.index(unit)])
        nearest = min(remaining, key=lambda u: 
            calculate_travel_time(current_loc, u.location))
        assert unit == nearest
        current_loc = unit.location

# --- Tests for update_etas_for_schedule ---

def test_update_etas_empty_schedule(test_technician):
    """Test ETA updates with empty schedule."""
    etas = update_etas_for_schedule(test_technician)
    assert etas == {}

def test_update_etas_single_day(test_technician, test_units):
    """Test ETA updates for a single day schedule."""
    # Add units to day 1
    test_technician.schedule[1] = test_units[:2]
    
    etas = update_etas_for_schedule(test_technician)
    
    assert len(etas) == 2  # Two jobs
    # Verify chronological order
    job_times = list(etas.values())
    assert all(job_times[i] < job_times[i+1] 
              for i in range(len(job_times)-1))
    # Verify within availability window
    avail = test_technician.availability[1]
    assert all(avail.start_time <= time <= avail.end_time 
              for time in etas.values())

def test_update_etas_respects_availability(test_technician, test_units):
    """Test that ETA updates respect daily availability windows."""
    # Add more units than can fit in a day
    many_units = test_units * 4  # 12 hours of work
    test_technician.schedule[1] = many_units
    
    etas = update_etas_for_schedule(test_technician)
    
    avail = test_technician.availability[1]
    # All ETAs should be within availability window
    assert all(avail.start_time <= time <= avail.end_time 
              for time in etas.values())

def test_update_etas_no_availability(test_technician, test_units):
    """Test ETA updates when availability is missing."""
    # Remove availability
    test_technician.availability.clear()
    test_technician.schedule[1] = test_units
    
    etas = update_etas_for_schedule(test_technician)
    assert etas == {}  # Should return empty when no availability

def test_update_etas_sequential_jobs(test_technician, test_units):
    """Test that jobs within a unit are scheduled sequentially."""
    # Create a unit with multiple jobs
    multi_job_unit = SchedulableUnit(
        order_id=99,
        jobs=test_units[0].jobs + test_units[1].jobs,
        priority=1,
        location=test_units[0].location,
        duration=test_units[0].duration + test_units[1].duration
    )
    test_technician.schedule[1] = [multi_job_unit]
    
    etas = update_etas_for_schedule(test_technician)
    
    # Verify jobs are sequential
    job_times = [etas[job.id] for job in multi_job_unit.jobs]
    assert all(job_times[i] + multi_job_unit.jobs[i].job_duration == job_times[i+1]
              for i in range(len(job_times)-1)) 

# --- New tests for optimize_daily_route_and_get_time ---

TECH_HOME = Address(id=1, street_address="Tech Base", lat=40.0, lng=-75.0)
LOC_A = Address(id=10, street_address="1 First St", lat=40.1, lng=-75.1)
LOC_B = Address(id=11, street_address="2 Second St", lat=40.2, lng=-75.2)
LOC_C = Address(id=12, street_address="3 Third St", lat=40.3, lng=-75.3)

DAY_START = datetime(2024, 1, 1, 8, 0, 0) # 8 AM

# Helper to create basic units
def create_unit(id: str, location: Address, duration_minutes: int, fixed_time: Optional[datetime] = None) -> SchedulableUnit:
    # Create minimal Job and Order stubs needed for SchedulableUnit
    dummy_service = Service(id=1, service_name="Test Svc", service_category=ServiceCategory.DIAG)
    dummy_vehicle = CustomerVehicle(id=1, vin="TESTVIN1234567890", make="Make", year=2024, model="Model")
    dummy_order = Order(
        id=int(id.split('_')[1]), user_id="uuid", vehicle_id=1, address_id=location.id, 
        earliest_available_time=DAY_START, customer_type=CustomerType.RESIDENTIAL,
        address=location, vehicle=dummy_vehicle, services=[dummy_service]
    )
    job = Job(
        id=int(id.split('_')[1]), order_id=dummy_order.id, address_id=location.id, priority=5,
        status=JobStatus.ASSIGNED, job_duration=timedelta(minutes=duration_minutes),
        fixed_schedule_time=fixed_time, order_ref=dummy_order, address=location, services=[dummy_service]
    )
    return SchedulableUnit(
        id=id,
        order_id=job.order_id,
        jobs=[job],
        priority=job.priority,
        location=location,
        duration=job.job_duration,
        fixed_schedule_time=fixed_time
    )

UNIT_A = create_unit("unit_A", LOC_A, 60) # 1 hour
UNIT_B = create_unit("unit_B", LOC_B, 90) # 1.5 hours
UNIT_C = create_unit("unit_C", LOC_C, 30) # 0.5 hours
UNIT_FIXED = create_unit("unit_F", LOC_B, 60, fixed_time=DAY_START + timedelta(hours=4)) # Fixed at 12 PM

# --- Mocks --- 

# Mock calculate_travel_time for deterministic results
@pytest.fixture
def mock_travel_time():
    def mock_calc(loc1, loc2):
        if loc1 == loc2: return timedelta(minutes=0) # Should be handled by OR-Tools cost matrix anyway
        # Simple mock: 30 mins between any different locations for simplicity
        return timedelta(minutes=30) 
    with patch('src.scheduler.routing.calculate_travel_time', side_effect=mock_calc) as mock:
        yield mock

# Mock availability
@pytest.fixture
def mock_availability():
    def mock_get_avail(tech, day):
        if day == 1:
            return {'start_time': DAY_START, 'end_time': DAY_START + timedelta(hours=9), 'total_duration': timedelta(hours=9)} # 8 AM to 5 PM
        return None
    with patch('src.scheduler.routing.get_technician_availability', side_effect=mock_get_avail) as mock:
        yield mock

# --- Tests for optimize_daily_route_and_get_time --- 

@patch('src.scheduler.routing.pywrapcp.RoutingModel.SolveWithParameters')
@patch('src.scheduler.routing.pywrapcp.RoutingIndexManager')
def test_optimize_basic_route(mock_manager_init, mock_solve, mock_travel_time):
    """Test basic optimization without fixed constraints."""
    # Arrange
    mock_manager = MagicMock()
    mock_manager_init.return_value = mock_manager
    # Define Nodes: 0=Depot, 1=A, 2=B, 3=C
    mock_manager.IndexToNode = lambda i: i 
    mock_manager.NodeToIndex = lambda n: n
    
    mock_solution = MagicMock()
    # Simulate a solution: Depot -> A -> C -> B -> Depot
    # NextVar values: 0->1, 1->3, 3->2, 2->0
    mock_solution.Value = MagicMock(side_effect=lambda var: {0: 1, 1: 3, 3: 2, 2: 0}.get(var))
    
    # Simulate time dimension results (arrival times in seconds relative to day_start_time)
    # Travel = 30 mins = 1800s. Service: A=3600, B=5400, C=1800
    # Depot: 0
    # A (Node 1): Travel(0->1)=1800. Arrive = 1800s.
    # C (Node 3): Travel(1->3)=1800. Service A=3600. Arrive C = 1800+3600+1800 = 7200s.
    # B (Node 2): Travel(3->2)=1800. Service C=1800. Arrive B = 7200+1800+1800 = 10800s.
    # Depot (Node 0 from 2): Travel(2->0)=1800. Service B=5400. End Time = 10800 + 5400 + 1800 = 18000s.
    mock_solution.Min = MagicMock(side_effect=lambda var: {mock_manager.NodeToIndex(1): 1800, mock_manager.NodeToIndex(3): 7200, mock_manager.NodeToIndex(2): 10800}.get(var.Index(), 0))
    mock_solve.return_value = mock_solution
    
    units_to_schedule = [UNIT_A, UNIT_B, UNIT_C]
    
    # Act
    optimized_sequence, total_time, start_times = optimize_daily_route_and_get_time(
        units_to_schedule, TECH_HOME, day_start_time=DAY_START
    )
    
    # Assert
    assert mock_solve.called
    assert len(optimized_sequence) == 3
    # Check sequence based on mocked solution A -> C -> B
    assert optimized_sequence[0].id == "unit_A"
    assert optimized_sequence[1].id == "unit_C"
    assert optimized_sequence[2].id == "unit_B"
    # Check total time (seconds)
    expected_total_seconds = 10800 + 5400 # Arrival at B + Service B 
    assert total_time == timedelta(seconds=expected_total_seconds)
    # Check start times
    assert start_times["unit_A"] == DAY_START + timedelta(seconds=1800) # Arrive A
    assert start_times["unit_C"] == DAY_START + timedelta(seconds=7200) # Arrive C
    assert start_times["unit_B"] == DAY_START + timedelta(seconds=10800) # Arrive B

@patch('src.scheduler.routing.pywrapcp.RoutingModel.SolveWithParameters')
@patch('src.scheduler.routing.pywrapcp.RoutingIndexManager')
def test_optimize_with_fixed_time(mock_manager_init, mock_solve, mock_travel_time):
    """Test optimization respects fixed time constraints."""
    # Arrange
    mock_manager = MagicMock()
    mock_manager_init.return_value = mock_manager
    # Define Nodes: 0=Depot, 1=A, 2=F(B)
    mock_manager.IndexToNode = lambda i: i 
    mock_manager.NodeToIndex = lambda n: n
    
    mock_solution = MagicMock()
    # Assume solution respects fixed time: Depot -> A -> F(B) -> Depot
    # Fixed time for F(B) = 12 PM = 4 hours = 14400s after 8 AM start
    mock_solution.Value = MagicMock(side_effect=lambda var: {0: 1, 1: 2, 2: 0}.get(var)) # 0->A, A->F(B), F(B)->0
    
    # Simulate time dimension results
    # A (Node 1): Travel=1800. Arrive = 1800s.
    # F(B) (Node 2): Travel(1->2)=1800. Service A=3600. Earliest arrival = 1800+3600+1800 = 7200s.
    # BUT, fixed time is 14400s. So solver waits. Arrival = 14400s.
    mock_solution.Min = MagicMock(side_effect=lambda var: {mock_manager.NodeToIndex(1): 1800, mock_manager.NodeToIndex(2): 14400}.get(var.Index(), 0))
    mock_solve.return_value = mock_solution

    units_to_schedule = [UNIT_A, UNIT_FIXED]
    time_constraints = {UNIT_FIXED.id: UNIT_FIXED.fixed_schedule_time}
    
    # Act
    optimized_sequence, total_time, start_times = optimize_daily_route_and_get_time(
        units_to_schedule, TECH_HOME, time_constraints=time_constraints, day_start_time=DAY_START
    )
    
    # Assert
    assert mock_solve.called
    assert len(optimized_sequence) == 2
    assert optimized_sequence[0].id == "unit_A"
    assert optimized_sequence[1].id == "unit_F"
    # Check start times
    assert start_times["unit_A"] == DAY_START + timedelta(seconds=1800)
    assert start_times["unit_F"] == DAY_START + timedelta(seconds=14400) # Should match fixed time

@patch('src.scheduler.routing.pywrapcp.RoutingModel.SolveWithParameters')
@patch('src.scheduler.routing.pywrapcp.RoutingIndexManager')
def test_optimize_no_solution(mock_manager_init, mock_solve, mock_travel_time):
    """Test case where OR-Tools returns no solution."""
    # Arrange
    mock_manager = MagicMock()
    mock_manager_init.return_value = mock_manager
    mock_solve.return_value = None # Simulate solver failure
    
    units_to_schedule = [UNIT_A]
    
    # Act
    optimized_sequence, total_time, start_times = optimize_daily_route_and_get_time(
        units_to_schedule, TECH_HOME, day_start_time=DAY_START
    )
    
    # Assert
    assert optimized_sequence == []
    assert total_time == timedelta(0)
    assert start_times == {}

# --- Tests for update_etas_for_schedule --- 

def test_update_etas_with_start_times():
    """Test updating ETAs using the provided start times dict."""
    # Arrange
    tech = Technician(id=1, user_id="uuid", home_address=TECH_HOME)
    unit1 = create_unit("u1", LOC_A, 60)
    unit2 = create_unit("u2", LOC_B, 90)
    tech.schedule = {1: [unit1, unit2]} # Day 1 schedule
    
    # Pre-calculated start times (e.g., from optimizer)
    start_times_day1 = {
        "u1": DAY_START + timedelta(hours=1), # 9 AM
        "u2": DAY_START + timedelta(hours=3)  # 11 AM
    }
    daily_start_times = {1: start_times_day1}

    # Act
    update_etas_for_schedule(tech, daily_start_times)

    # Assert
    assert unit1.jobs[0].estimated_sched == DAY_START + timedelta(hours=1)
    assert unit2.jobs[0].estimated_sched == DAY_START + timedelta(hours=3)

def test_update_etas_fallback_calculation(mock_travel_time, mock_availability):
    """Test updating ETAs using the fallback manual calculation."""
    # Arrange
    tech = Technician(id=1, user_id="uuid", home_address=TECH_HOME, current_location=TECH_HOME)
    unit1 = create_unit("u1", LOC_A, 60) # 1 hr service
    unit2 = create_unit("u2", LOC_B, 90) # 1.5 hr service
    tech.schedule = {1: [unit1, unit2]} # Day 1 schedule
    
    # Expected fallback calculation (mock travel = 30 mins):
    # Start 8:00
    # Travel to A = 30 mins. Arrive A = 8:30. 
    # Service A = 60 mins. Finish A = 9:30.
    # Travel A->B = 30 mins. Arrive B = 10:00.
    # Service B = 90 mins. Finish B = 11:30.

    # Act
    update_etas_for_schedule(tech, None) # No start times provided, trigger fallback

    # Assert
    mock_availability.assert_called_once_with(tech, 1)
    assert mock_travel_time.call_count == 2
    assert unit1.jobs[0].estimated_sched == DAY_START + timedelta(minutes=30) # Arrive A 8:30
    assert unit2.jobs[0].estimated_sched == DAY_START + timedelta(minutes=120) # Arrive B 10:00

def test_update_etas_fallback_with_fixed_time(mock_travel_time, mock_availability):
    """Test fallback ETA calculation respects fixed times."""
    # Arrange
    tech = Technician(id=1, user_id="uuid", home_address=TECH_HOME, current_location=TECH_HOME)
    fixed_start = DAY_START + timedelta(hours=2) # Fixed at 10:00 AM
    unit_fixed = create_unit("uF", LOC_A, 60, fixed_time=fixed_start)
    unit_after = create_unit("uA", LOC_B, 30)
    tech.schedule = {1: [unit_fixed, unit_after]} # Fixed job first

    # Expected fallback:
    # Start 8:00
    # Travel to A = 30 mins. Earliest arrival = 8:30.
    # Fixed time is 10:00. Wait until 10:00.
    # Service Fixed = 60 mins. Finish Fixed = 11:00.
    # Travel A->B = 30 mins. Arrive B = 11:30.
    # Service After = 30 mins. Finish After = 12:00.

    # Act
    update_etas_for_schedule(tech, None)

    # Assert
    assert unit_fixed.jobs[0].estimated_sched == fixed_start # ETA matches fixed time
    assert unit_after.jobs[0].estimated_sched == fixed_start + timedelta(minutes=60) + timedelta(minutes=30) # 11:30 