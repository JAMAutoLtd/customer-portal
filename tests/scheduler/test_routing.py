"""Tests for routing and scheduling utilities."""

import pytest
from datetime import datetime, timedelta, time
import math
import uuid

from src.scheduler.routing import (
    calculate_travel_time,
    optimize_daily_route_and_get_time,
    update_etas_for_schedule
)
from src.scheduler.models import (
    Address, SchedulableUnit, Technician, Job, DailyAvailability, JobStatus,
    Order, CustomerType, CustomerVehicle
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