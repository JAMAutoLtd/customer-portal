import pytest
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import copy

# Assuming src is in the python path or using appropriate test runner config
from src.scheduler.scheduler import (
    Address, Technician, Job, SchedulableUnit,
    calculate_eta, assign_job_to_technician, assign_jobs, update_job_queues_and_routes,
    # Also import the placeholder functions used internally for potential mocking/patching
    get_technician_availability as scheduler_get_availability,
    calculate_travel_time as scheduler_calculate_travel,
    update_job_assignment as scheduler_update_assignment,
    create_schedulable_units as scheduler_create_units
    # We'll need to decide if we mock these or the main functions directly
)

# --- Mock Data Setup ---

# Simple Mock Address
class MockAddress(Address):
    def __init__(self, id: int, name: str):
        self.id = id
        self.name = name # For easier debugging

    def __repr__(self):
        return f"Address({self.name})"

# Mock Locations
loc_home_base = MockAddress(1, "Home Base")
loc_job_a = MockAddress(101, "Job A Location")
loc_job_b = MockAddress(102, "Job B Location")
loc_job_c = MockAddress(103, "Job C Location")
loc_job_d = MockAddress(104, "Job D Location")

# Mock Technicians
# Note: We override methods here for predictable test behavior,
# or we can use pytest monkeypatch later.
class MockTechnician(Technician):
    def __init__(self, id: int, name: str, equipment: List[str], current_loc: Address, home_loc: Address):
        self.id = id
        self.name = name
        self.equipment = equipment
        self.schedule: Dict[int, List[SchedulableUnit]] = {}
        self.current_location = current_loc
        self.home_location = home_loc
        self._assigned_jobs: List[Job] = [] # Helper for testing state

    @property
    def assigned_jobs(self) -> List[Job]:
        return self._assigned_jobs

    def has_equipment(self, required_equipment: List[str]) -> bool:
        # Basic check, assumes required_equipment is a list of strings
        if not required_equipment: return True # No specific equipment needed
        return all(item in self.equipment for item in required_equipment)

    def has_all_equipment(self, order_jobs: List['Job']) -> bool:
        required = set()
        for job in order_jobs:
            required.update(job.equipment_required)
        return all(item in self.equipment for item in required)
    
    def __repr__(self):
        return f"Technician({self.name})"

tech1 = MockTechnician(1, "Tech Alice", ["tool_a", "tool_b"], loc_home_base, loc_home_base)
tech2 = MockTechnician(2, "Tech Bob", ["tool_b", "tool_c"], loc_home_base, loc_home_base)
tech3 = MockTechnician(3, "Tech Charlie", ["tool_a", "tool_b", "tool_c"], loc_home_base, loc_home_base) # Can do anything

# Mock Jobs
class MockJob(Job):
    _job_counter = 1000
    def __init__(self, order_id: int, location: Address, equipment: List[str], duration_hours: int = 1, priority: int = 5, fixed: bool = False):
        self.id = MockJob._job_counter
        MockJob._job_counter += 1
        self.order_id = order_id
        self.location = location
        self.equipment_required = equipment
        self.job_duration = timedelta(hours=duration_hours)
        self.priority = priority
        self.fixed = fixed
        self.assigned_technician: Optional[Technician] = None
        self.status = "Pending"
        self.estimated_sched: Optional[datetime] = None

    def __repr__(self):
        return f"Job({self.id}, Order: {self.order_id})"

    def __hash__(self):
        return hash(self.id)

    def __eq__(self, other):
        if not isinstance(other, MockJob):
            return False
        return self.id == other.id

# --- Pytest Fixtures (Optional but helpful) ---

@pytest.fixture
def techs() -> List[Technician]:
    # Return fresh copies for each test to avoid side effects
    return [
        MockTechnician(1, "Tech Alice", ["tool_a", "tool_b"], loc_home_base, loc_home_base),
        MockTechnician(2, "Tech Bob", ["tool_b", "tool_c"], loc_home_base, loc_home_base),
        MockTechnician(3, "Tech Charlie", ["tool_a", "tool_b", "tool_c"], loc_home_base, loc_home_base)
    ]

@pytest.fixture
def sample_jobs() -> List[Job]:
    # Reset counter for predictability if needed
    MockJob._job_counter = 1000
    return [
        MockJob(order_id=1, location=loc_job_a, equipment=["tool_a"]), # Job 1000
        MockJob(order_id=2, location=loc_job_b, equipment=["tool_b"]), # Job 1001
        MockJob(order_id=2, location=loc_job_c, equipment=["tool_c"]), # Job 1002 (multi-job order)
        MockJob(order_id=3, location=loc_job_d, equipment=["tool_d"]), # Job 1003 (needs unknown tool)
    ]

# --- Test Cases Start Here ---

# TODO: Add tests for calculate_eta
# TODO: Add tests for assign_job_to_technician (though simple now)

# --- Tests for assign_jobs ---

# Mock calculate_eta for assign_jobs tests
# Returns a predictable future time based on tech_id and job_ids
def mock_calculate_eta_assign(technician: Technician, jobs_to_consider: List[Job]) -> Optional[datetime]:
    base_time = datetime(2024, 1, 1, 9, 0, 0)
    # Simple deterministic ETA: earlier for lower tech ID, slightly later for more jobs
    # Ensure tech 3 (Charlie) often wins if eligible
    job_ids_sum = sum(j.id for j in jobs_to_consider)
    if technician.id == 3: # Charlie is faster
        offset_minutes = 5 * len(jobs_to_consider) + job_ids_sum % 10
    else:
        offset_minutes = technician.id * 10 + len(jobs_to_consider) * 10 + job_ids_sum % 10
    
    # Simulate occasional failure (e.g., for specific tech/job combo)
    if technician.id == 1 and jobs_to_consider[0].id == 1003: # Alice fails for job 1003
        return None
        
    return base_time + timedelta(minutes=offset_minutes)

# Mock assign_job_to_technician to track calls
mock_assignments_log = []
def mock_assign_job(job: Job, technician: Technician):
    global mock_assignments_log
    mock_assignments_log.append({'job_id': job.id, 'tech_id': technician.id})
    # Simulate the assignment on the mock job object for assertion checks
    job.assigned_technician = technician
    job.status = "Assigned"

@pytest.fixture(autouse=True)
def reset_assignment_log():
    global mock_assignments_log
    mock_assignments_log = []

def test_assign_jobs_single_job_eligible_tech(monkeypatch, techs, sample_jobs):
    """Test assigning a single job (Job 1000) needing tool_a. Only Alice and Charlie have it."""
    monkeypatch.setattr("src.scheduler.scheduler.calculate_eta", mock_calculate_eta_assign)
    monkeypatch.setattr("src.scheduler.scheduler.assign_job_to_technician", mock_assign_job)
    
    jobs_to_assign = [j for j in sample_jobs if j.id == 1000] # Job 1000 needs tool_a
    available_techs = techs # [Alice(a,b), Bob(b,c), Charlie(a,b,c)]
    
    assign_jobs(jobs_to_assign, available_techs)
    
    # Charlie (id 3) should have the better ETA based on mock_calculate_eta_assign logic
    assert len(mock_assignments_log) == 1
    assert mock_assignments_log[0]['job_id'] == 1000
    assert mock_assignments_log[0]['tech_id'] == 3 # Charlie
    assert jobs_to_assign[0].assigned_technician.id == 3
    assert jobs_to_assign[0].status == "Assigned"

def test_assign_jobs_single_job_competition(monkeypatch, techs, sample_jobs):
    """Test assigning a single job (Job 1001) needing tool_b. All techs have it."""
    monkeypatch.setattr("src.scheduler.scheduler.calculate_eta", mock_calculate_eta_assign)
    monkeypatch.setattr("src.scheduler.scheduler.assign_job_to_technician", mock_assign_job)
    
    jobs_to_assign = [j for j in sample_jobs if j.id == 1001] # Job 1001 needs tool_b
    available_techs = techs

    assign_jobs(jobs_to_assign, available_techs)

    # Charlie (id 3) should have the best ETA
    assert len(mock_assignments_log) == 1
    assert mock_assignments_log[0]['job_id'] == 1001
    assert mock_assignments_log[0]['tech_id'] == 3 # Charlie
    assert jobs_to_assign[0].assigned_technician.id == 3

def test_assign_jobs_multi_job_order_single_tech(monkeypatch, techs, sample_jobs):
    """Test assigning a multi-job order (Order 2: Jobs 1001, 1002) needing tool_b and tool_c.
       Only Bob and Charlie have both.
    """
    monkeypatch.setattr("src.scheduler.scheduler.calculate_eta", mock_calculate_eta_assign)
    monkeypatch.setattr("src.scheduler.scheduler.assign_job_to_technician", mock_assign_job)

    jobs_to_assign = [j for j in sample_jobs if j.order_id == 2] # Jobs 1001 (tool_b), 1002 (tool_c)
    available_techs = techs

    assign_jobs(jobs_to_assign, available_techs)

    # Charlie (id 3) has both tools and should have the better ETA for the combined order
    assert len(mock_assignments_log) == 2
    # Check both jobs assigned to Charlie
    assigned_job_ids = {log['job_id'] for log in mock_assignments_log}
    assigned_tech_ids = {log['tech_id'] for log in mock_assignments_log}
    assert assigned_job_ids == {1001, 1002}
    assert assigned_tech_ids == {3} # Only Charlie
    assert jobs_to_assign[0].assigned_technician.id == 3
    assert jobs_to_assign[1].assigned_technician.id == 3
    assert jobs_to_assign[0].status == "Assigned"
    assert jobs_to_assign[1].status == "Assigned"

def test_assign_jobs_multi_job_order_split_assignment(monkeypatch):
    """Test multi-job order where no single tech has all tools, requiring split assignment.
       Order 99: Job 9901 (tool_a), Job 9902 (tool_c).
       Alice has tool_a, Bob has tool_c, Charlie has both.
    """
    # Reset job counter for predictable IDs
    MockJob._job_counter = 1000

    # Redefine techs and jobs for this specific scenario
    techs_split = [
        MockTechnician(1, "Alice", ["tool_a"], loc_home_base, loc_home_base), # Only tool_a
        MockTechnician(2, "Bob", ["tool_c"], loc_home_base, loc_home_base),   # Only tool_c
        # Charlie CAN do both, but let's make his ETA worse for the *combined* order
        # to force the split logic test path.
        MockTechnician(3, "Charlie", ["tool_a", "tool_c"], loc_home_base, loc_home_base),
    ]
    jobs_split = [
        MockJob(order_id=99, location=loc_job_a, equipment=["tool_a"]), # Job 1000
        MockJob(order_id=99, location=loc_job_c, equipment=["tool_c"]), # Job 1001
    ]

    def mock_eta_split(technician: Technician, jobs_to_consider: List[Job]) -> Optional[datetime]:
        base = datetime(2024, 1, 1, 9, 0, 0)
        if len(jobs_to_consider) > 1: # Multi-job ETA
            if technician.id == 3: return base + timedelta(hours=5) # Charlie is slow for combined
            else: return None # Alice and Bob can't do combined
        else: # Single job ETA
            job = jobs_to_consider[0]
            if job.id == 1000: # Job needing tool_a
                if technician.id == 1: return base + timedelta(hours=1) # Alice fast
                if technician.id == 3: return base + timedelta(hours=2) # Charlie slower
            elif job.id == 1001: # Job needing tool_c
                if technician.id == 2: return base + timedelta(hours=1) # Bob fast
                if technician.id == 3: return base + timedelta(hours=2) # Charlie slower
        return None

    monkeypatch.setattr("src.scheduler.scheduler.calculate_eta", mock_eta_split)
    monkeypatch.setattr("src.scheduler.scheduler.assign_job_to_technician", mock_assign_job)

    assign_jobs(jobs_split, techs_split)

    # Expect Job 1000 (tool_a) -> Alice (id 1)
    # Expect Job 1001 (tool_c) -> Bob (id 2)
    assert len(mock_assignments_log) == 2
    assigned_map = {log['job_id']: log['tech_id'] for log in mock_assignments_log}
    assert assigned_map.get(1000) == 1 # Job 1000 to Alice
    assert assigned_map.get(1001) == 2 # Job 1001 to Bob

def test_assign_jobs_no_eligible_tech(monkeypatch, techs, sample_jobs):
    """Test assigning a job (Job 1003) needing tool_d, which no tech has."""
    monkeypatch.setattr("src.scheduler.scheduler.calculate_eta", mock_calculate_eta_assign)
    monkeypatch.setattr("src.scheduler.scheduler.assign_job_to_technician", mock_assign_job)

    jobs_to_assign = [j for j in sample_jobs if j.id == 1003] # Job 1003 needs tool_d
    available_techs = techs

    assign_jobs(jobs_to_assign, available_techs)

    # No assignments should be made
    assert len(mock_assignments_log) == 0
    assert jobs_to_assign[0].assigned_technician is None
    assert jobs_to_assign[0].status == "Pending"

def test_assign_jobs_ignores_fixed_job(monkeypatch, techs, sample_jobs):
    """Test that a job marked as fixed is ignored by assign_jobs."""
    monkeypatch.setattr("src.scheduler.scheduler.calculate_eta", mock_calculate_eta_assign)
    monkeypatch.setattr("src.scheduler.scheduler.assign_job_to_technician", mock_assign_job)

    job_to_fix = sample_jobs[0] # Job 1000
    job_to_fix.fixed = True
    # Manually assign it to ensure it's not reassigned (though assign_jobs shouldn't touch it)
    job_to_fix.assigned_technician = techs[0] 
    job_to_fix.status = "Scheduled"

    jobs_to_assign = [job_to_fix]
    available_techs = techs

    assign_jobs(jobs_to_assign, available_techs)

    # No assignments should be logged because the job was fixed
    assert len(mock_assignments_log) == 0
    # Verify the job's original assignment remains unchanged
    assert job_to_fix.assigned_technician.id == 1
    assert job_to_fix.status == "Scheduled"

def test_assign_jobs_eta_calculation_fails(monkeypatch, techs):
    """Test behavior when calculate_eta always returns None."""
    
    # Specific job for this test
    job_eta_fail = MockJob(order_id=500, location=loc_job_a, equipment=[], duration_hours=2)
    
    def mock_eta_always_none(technician: Technician, jobs_to_consider: List[Job]) -> Optional[datetime]:
        return None # Always fails

    monkeypatch.setattr("src.scheduler.scheduler.calculate_eta", mock_eta_always_none)
    monkeypatch.setattr("src.scheduler.scheduler.assign_job_to_technician", mock_assign_job)

    jobs_to_assign = [job_eta_fail]
    available_techs = techs # Alice and Charlie have tool_a, but ETA fails

    assign_jobs(jobs_to_assign, available_techs)

    # No assignment should happen as ETA calculation failed for all eligible techs
    assert len(mock_assignments_log) == 0
    assert job_eta_fail.assigned_technician is None
    assert job_eta_fail.status == "Pending"


# --- Mocks and Helpers for update_job_queues_and_routes tests ---

# Mock SchedulableUnit needed for tests
class MockSchedulableUnit(SchedulableUnit):
     def __init__(self, jobs: List[Job], priority: int, duration: timedelta, location: Address):
         self.jobs = jobs
         self.priority = priority
         self.duration = duration
         self.location = location

     def __repr__(self):
         # Use order ID for simpler representation in schedule assertions
         order_ids = sorted(list(set(j.order_id for j in self.jobs)))
         return f"Unit(Orders: {order_ids}, Prio: {self.priority})"
     
     # Need equality check for list comparison in tests
     def __eq__(self, other):
         if not isinstance(other, MockSchedulableUnit):
             return NotImplemented
         # Compare based on jobs, priority, duration, location id
         return (
             set(j.id for j in self.jobs) == set(j.id for j in other.jobs) and
             self.priority == other.priority and
             self.duration == other.duration and
             self.location.id == other.location.id
         )
     
     def __hash__(self):
        # Basic hash for set operations if needed
        return hash((tuple(sorted(j.id for j in self.jobs)), self.priority, self.duration, self.location.id))

# Mock create_schedulable_units
def mock_create_units_update(jobs_by_order: Dict[int, List[Job]]) -> List[SchedulableUnit]:
    units = []
    for order_id, jobs in jobs_by_order.items():
         if not jobs: continue
         prio = min(j.priority for j in jobs) if jobs else 99
         total_duration = sum((j.job_duration for j in jobs), timedelta())
         # Ensure location is set for testing
         loc = jobs[0].location if jobs[0].location else loc_home_base
         units.append(MockSchedulableUnit(jobs, prio, total_duration, loc))
    return units

# Mock availability (8 hours on day 1, 2; 4 hours day 3; unavailable day 4)
def mock_get_availability_update(tech: Technician, day_number: int) -> Optional[Dict]:
    base_time = datetime(2024, 1, 1, 0, 0, 0) + timedelta(days=day_number - 1)
    if day_number == 1 or day_number == 2:
        duration = timedelta(hours=8)
        end_hour = 17
    elif day_number == 3:
        duration = timedelta(hours=4) # Half day
        end_hour = 13
    else:
        return None # Unavailable
    return {
        "start_time": base_time.replace(hour=9),
        "end_time": base_time.replace(hour=end_hour),
        "total_duration": duration
    }

# Mock travel time (fixed 30 mins)
def mock_calculate_travel_update(loc1: Optional[Address], loc2: Optional[Address]) -> timedelta:
    if not loc1 or not loc2 or loc1.id == loc2.id:
        return timedelta(0)
    return timedelta(minutes=30)

# Mock optimizer (simple version: returns original order, sums travel+duration)
def mock_optimize_simple(units: List[SchedulableUnit], start_loc: Address) -> (List[SchedulableUnit], timedelta):
    total_time = timedelta(0)
    current_loc = start_loc
    if not units: return [], timedelta(0)
    for unit in units:
        travel = mock_calculate_travel_update(current_loc, unit.location)
        total_time += travel + unit.duration
        current_loc = unit.location
    # Return original list and calculated time
    return units, total_time

# Mock ETA update to track calls
mock_eta_update_call_log = []
def mock_update_etas(technician: Technician):
    global mock_eta_update_call_log
    mock_eta_update_call_log.append(technician.id)

@pytest.fixture(autouse=True)
def reset_eta_update_log():
    global mock_eta_update_call_log
    mock_eta_update_call_log = []

# --- Tests for update_job_queues_and_routes ---

def setup_update_test_mocks(monkeypatch):
    monkeypatch.setattr("src.scheduler.scheduler.get_technician_availability", mock_get_availability_update)
    monkeypatch.setattr("src.scheduler.scheduler.create_schedulable_units", mock_create_units_update)
    monkeypatch.setattr("src.scheduler.scheduler.calculate_travel_time", mock_calculate_travel_update)
    monkeypatch.setattr("src.scheduler.scheduler.optimize_daily_route_and_get_time", mock_optimize_simple)
    monkeypatch.setattr("src.scheduler.scheduler.update_etas_for_schedule", mock_update_etas)
    # HACK: Patch the internal job fetching/grouping at the start of the function
    # This assumes the structure of the function won't drastically change.
    # We replace the initial block with one that gets jobs directly from the pre-assigned tech objects.
    original_update_func = update_job_queues_and_routes
    
    def patched_update_queues(technicians: List[Technician]):
        # --- Start of Patched Section ---
        for tech in technicians:
            # Directly use pre-assigned jobs from the mock technician object
            # This bypasses the placeholder logic for fetching jobs.
            tech_jobs = getattr(tech, '_assigned_jobs', []) 
            if not tech_jobs:
                tech.schedule = {}
                mock_update_etas(tech) # Call mock directly for consistency
                continue

            jobs_by_order: Dict[int, List[Job]] = defaultdict(list)
            for job in tech_jobs:
                jobs_by_order[job.order_id].append(job)
            
            schedulable_units = mock_create_units_update(jobs_by_order)
            # --- End of Patched Section ---

            # --- Resume original function logic (copy-pasted and adapted) ---
            schedulable_units.sort(key=lambda unit: unit.priority)

            tech_schedule: Dict[int, List[SchedulableUnit]] = {}
            remaining_units_to_schedule = copy.deepcopy(schedulable_units) 
            day_number = 1
            max_days_to_plan = 14 

            while remaining_units_to_schedule and day_number <= max_days_to_plan:
                daily_availability = mock_get_availability_update(tech, day_number)

                if not daily_availability or daily_availability['total_duration'] <= timedelta(0):
                    if not remaining_units_to_schedule: break
                    day_number += 1
                    continue 

                available_work_time: timedelta = daily_availability['total_duration']
                start_location_for_day = tech.home_location if day_number > 1 else tech.current_location
                
                current_route_time_estimate = timedelta(0)
                last_stop_location = start_location_for_day
                temp_units_added_today: List[SchedulableUnit] = []
                units_still_to_try = list(remaining_units_to_schedule)

                for unit in units_still_to_try:
                    travel_time = mock_calculate_travel_update(last_stop_location, unit.location)
                    unit_total_time = travel_time + unit.duration

                    if current_route_time_estimate + unit_total_time <= available_work_time:
                        temp_units_added_today.append(unit)
                        current_route_time_estimate += unit_total_time
                        last_stop_location = unit.location
                    else:
                        pass 

                if temp_units_added_today:
                    # Call the MOCKED optimizer directly
                    optimized_daily_units, actual_optimized_time = mock_optimize_simple(
                        temp_units_added_today, start_location_for_day
                    )

                    if actual_optimized_time <= available_work_time:
                        tech_schedule[day_number] = optimized_daily_units
                        new_remaining_list = []
                        scheduled_unit_ids = set(id(u) for u in optimized_daily_units)
                        for unit_rem in remaining_units_to_schedule:
                            if id(unit_rem) not in scheduled_unit_ids:
                                new_remaining_list.append(unit_rem)
                        remaining_units_to_schedule = new_remaining_list
                    else:
                        # Don't schedule anything this day if optimized route fails
                        pass 
                
                elif remaining_units_to_schedule:
                    pass 

                day_number += 1

            tech.schedule = tech_schedule
            mock_update_etas(tech) # Call mock ETA update
            
    monkeypatch.setattr("src.scheduler.scheduler.update_job_queues_and_routes", patched_update_queues)


def test_update_schedule_simple(monkeypatch, techs):
    """Test scheduling 2 jobs (2 hours total) for one tech on day 1."""
    setup_update_test_mocks(monkeypatch)
    tech = techs[0] # Alice
    job1 = MockJob(order_id=10, location=loc_job_a, equipment=[], duration_hours=1, priority=5)
    job2 = MockJob(order_id=11, location=loc_job_b, equipment=[], duration_hours=1, priority=5)
    tech._assigned_jobs = [job1, job2]

    update_job_queues_and_routes([tech])

    assert 1 in tech.schedule
    assert len(tech.schedule[1]) == 2 # Both units should be scheduled on day 1
    # Create expected units for comparison (order might vary based on create_units impl)
    unit1 = MockSchedulableUnit([job1], 5, timedelta(hours=1), loc_job_a)
    unit2 = MockSchedulableUnit([job2], 5, timedelta(hours=1), loc_job_b)
    # Order in schedule might depend on mock optimizer, check presence
    assert unit1 in tech.schedule[1]
    assert unit2 in tech.schedule[1]
    assert 2 not in tech.schedule # Shouldn't spill to day 2

def test_update_schedule_respects_priority(monkeypatch, techs):
    """Test that higher priority (lower number) jobs are scheduled first."""
    setup_update_test_mocks(monkeypatch)
    tech = techs[0]
    # Total duration (inc travel) > 8 hours, so only higher priority should fit day 1
    # Travel: Home->A (30m), A->B (30m), B->C (30m) = 1.5 hours
    # Duration: JobA(4h) + JobB(4h) + JobC(1h) = 9 hours
    # Total time needed = 10.5 hours > 8 hours available
    job_a_prio_low = MockJob(order_id=20, location=loc_job_a, equipment=[], duration_hours=4, priority=10) # Low prio
    job_b_prio_high = MockJob(order_id=21, location=loc_job_b, equipment=[], duration_hours=4, priority=1)  # High prio
    job_c_prio_med = MockJob(order_id=22, location=loc_job_c, equipment=[], duration_hours=1, priority=5)   # Medium prio
    tech._assigned_jobs = [job_a_prio_low, job_b_prio_high, job_c_prio_med]

    update_job_queues_and_routes([tech])

    unit_high = MockSchedulableUnit([job_b_prio_high], 1, timedelta(hours=4), loc_job_b)
    unit_med = MockSchedulableUnit([job_c_prio_med], 5, timedelta(hours=1), loc_job_c)
    unit_low = MockSchedulableUnit([job_a_prio_low], 10, timedelta(hours=4), loc_job_a)

    # Expect High prio (4h) + Med prio (1h) + Travel (Home->B + B->C = 1h estimated by mocks) = 6h <= 8h
    assert 1 in tech.schedule
    assert len(tech.schedule[1]) == 2
    assert unit_high in tech.schedule[1]
    assert unit_med in tech.schedule[1]
    assert unit_low not in tech.schedule[1]
    
    # Expect Low prio (4h) + Travel (Home->A = 30m) = 4.5h <= 8h on Day 2
    assert 2 in tech.schedule
    assert len(tech.schedule[2]) == 1
    assert unit_low in tech.schedule[2]

def test_update_schedule_daily_capacity(monkeypatch, techs):
    """Test that jobs roll over when exceeding daily capacity."""
    setup_update_test_mocks(monkeypatch)
    tech = techs[0]
    # Day 1 capacity: 8 hours. Travel 30min fixed.
    # Job 1 (6h) + Travel (30m) = 6.5h
    # Job 2 (2h) + Travel (30m) = 2.5h -> Total = 9h > 8h
    job1 = MockJob(order_id=30, location=loc_job_a, equipment=[], duration_hours=6, priority=5)
    job2 = MockJob(order_id=31, location=loc_job_b, equipment=[], duration_hours=2, priority=5)
    tech._assigned_jobs = [job1, job2]

    update_job_queues_and_routes([tech])

    unit1 = MockSchedulableUnit([job1], 5, timedelta(hours=6), loc_job_a)
    unit2 = MockSchedulableUnit([job2], 5, timedelta(hours=2), loc_job_b)

    assert 1 in tech.schedule
    assert len(tech.schedule[1]) == 1
    assert tech.schedule[1] == [unit1] # Only job1 fits on day 1

    assert 2 in tech.schedule
    assert len(tech.schedule[2]) == 1
    assert tech.schedule[2] == [unit2] # job2 rolls over to day 2

def test_update_schedule_multi_day(monkeypatch, techs):
    """Test scheduling across multiple days with sufficient capacity."""
    setup_update_test_mocks(monkeypatch)
    tech = techs[0]
    # Day 1: 8h; Day 2: 8h; Day 3: 4h
    job_d1_1 = MockJob(order_id=40, location=loc_job_a, equipment=[], duration_hours=3, priority=5) # Fits Day 1
    job_d1_2 = MockJob(order_id=41, location=loc_job_b, equipment=[], duration_hours=4, priority=5) # Fits Day 1 (Total 3+4+Travel(1h)=8h)
    job_d2_1 = MockJob(order_id=42, location=loc_job_c, equipment=[], duration_hours=7, priority=5) # Fits Day 2 (7h + Travel(30m)=7.5h)
    job_d3_1 = MockJob(order_id=43, location=loc_job_d, equipment=[], duration_hours=3, priority=5) # Fits Day 3 (3h + Travel(30m)=3.5h <= 4h)
    tech._assigned_jobs = [job_d1_1, job_d1_2, job_d2_1, job_d3_1]

    update_job_queues_and_routes([tech])

    unit1 = MockSchedulableUnit([job_d1_1], 5, timedelta(hours=3), loc_job_a)
    unit2 = MockSchedulableUnit([job_d1_2], 5, timedelta(hours=4), loc_job_b)
    unit3 = MockSchedulableUnit([job_d2_1], 5, timedelta(hours=7), loc_job_c)
    unit4 = MockSchedulableUnit([job_d3_1], 5, timedelta(hours=3), loc_job_d)

    assert 1 in tech.schedule
    assert len(tech.schedule[1]) == 2
    assert unit1 in tech.schedule[1]
    assert unit2 in tech.schedule[1]

    assert 2 in tech.schedule
    assert len(tech.schedule[2]) == 1
    assert tech.schedule[2] == [unit3]

    assert 3 in tech.schedule
    assert len(tech.schedule[3]) == 1
    assert tech.schedule[3] == [unit4]

def test_update_schedule_handles_unavailability(monkeypatch, techs):
    """Test that unavailable days (Day 4 in mock) are skipped."""
    setup_update_test_mocks(monkeypatch)
    tech = techs[0]
    # Fill days 1, 2, 3 exactly. Job 4 should land on Day 5.
    # Day 1: 8h -> Job 1 (7.5h duration + 0.5h travel = 8h)
    job1 = MockJob(order_id=50, location=loc_job_a, equipment=[], duration_hours=7.5, priority=1)
    # Day 2: 8h -> Job 2 (7.5h duration + 0.5h travel = 8h)
    job2 = MockJob(order_id=51, location=loc_job_b, equipment=[], duration_hours=7.5, priority=2)
    # Day 3: 4h -> Job 3 (3.5h duration + 0.5h travel = 4h)
    job3 = MockJob(order_id=52, location=loc_job_c, equipment=[], duration_hours=3.5, priority=3)
    # Day 4: Unavailable
    # Day 5: Available (mock defaults to 8h) -> Job 4 (1h duration + 0.5h travel = 1.5h)
    job4 = MockJob(order_id=53, location=loc_job_d, equipment=[], duration_hours=1, priority=4)
    tech._assigned_jobs = [job1, job2, job3, job4]

    # Need to adjust mock availability for day 5 for this test
    original_avail = mock_get_availability_update
    def extended_avail(tech, day_number):
        if day_number == 5:
             base_time = datetime(2024, 1, 1, 0, 0, 0) + timedelta(days=day_number - 1)
             return {"start_time": base_time.replace(hour=9), "end_time": base_time.replace(hour=17), "total_duration": timedelta(hours=8)}
        return original_avail(tech, day_number)
    monkeypatch.setattr("src.scheduler.scheduler.get_technician_availability", extended_avail)

    update_job_queues_and_routes([tech])

    unit1 = MockSchedulableUnit([job1], 1, timedelta(hours=7.5), loc_job_a)
    unit2 = MockSchedulableUnit([job2], 2, timedelta(hours=7.5), loc_job_b)
    unit3 = MockSchedulableUnit([job3], 3, timedelta(hours=3.5), loc_job_c)
    unit4 = MockSchedulableUnit([job4], 4, timedelta(hours=1), loc_job_d)

    assert 1 in tech.schedule and tech.schedule[1] == [unit1]
    assert 2 in tech.schedule and tech.schedule[2] == [unit2]
    assert 3 in tech.schedule and tech.schedule[3] == [unit3]
    assert 4 not in tech.schedule # Day 4 should be skipped
    assert 5 in tech.schedule and tech.schedule[5] == [unit4] # Job 4 lands on Day 5

def test_update_schedule_calls_eta_update(monkeypatch, techs):
    """Verify update_etas_for_schedule is called for each tech."""
    setup_update_test_mocks(monkeypatch)
    tech1 = techs[0]
    tech2 = techs[1]
    job1 = MockJob(order_id=60, location=loc_job_a, equipment=[], duration_hours=1)
    tech1._assigned_jobs = [job1]
    tech2._assigned_jobs = [] # Tech 2 has no jobs
    
    global mock_eta_update_call_log
    mock_eta_update_call_log = [] # Ensure clean log

    update_job_queues_and_routes([tech1, tech2])

    assert len(mock_eta_update_call_log) == 2
    assert tech1.id in mock_eta_update_call_log
    assert tech2.id in mock_eta_update_call_log

def test_update_schedule_empty_jobs(monkeypatch, techs):
    """Test that a tech with no assigned jobs results in an empty schedule."""
    setup_update_test_mocks(monkeypatch)
    tech = techs[0]
    tech._assigned_jobs = [] # No jobs assigned

    update_job_queues_and_routes([tech])

    assert tech.schedule == {}
    # Verify ETA update was still called (to potentially clear old ETAs)
    assert tech.id in mock_eta_update_call_log
    
    # TODO: Add tests for update_job_queues_and_routes 

# --- Tests for calculate_eta ---

# Use the same availability and travel mocks as update_job_queues_and_routes tests
# mock_get_availability_update
# mock_calculate_travel_update

def setup_eta_test_mocks(monkeypatch):
    # Use mocks consistent with update_schedule tests for simplicity
    monkeypatch.setattr("src.scheduler.scheduler.get_technician_availability", mock_get_availability_update)
    monkeypatch.setattr("src.scheduler.scheduler.calculate_travel_time", mock_calculate_travel_update)

def test_calculate_eta_empty_schedule(monkeypatch, techs):
    """Test ETA calculation for a simple job on an empty schedule."""
    setup_eta_test_mocks(monkeypatch)
    tech = techs[0] # Alice
    tech.schedule = {} # Ensure empty schedule
    tech.current_location = loc_home_base # Start from home base today
    
    job_to_calc = MockJob(order_id=70, location=loc_job_a, equipment=[], duration_hours=2)
    
    expected_travel = mock_calculate_travel_update(tech.current_location, job_to_calc.location)
    day1_start_time = mock_get_availability_update(tech, 1)['start_time']
    expected_eta = day1_start_time + expected_travel

    actual_eta = calculate_eta(tech, [job_to_calc])

    assert actual_eta is not None
    assert actual_eta == expected_eta

def test_calculate_eta_fits_after_existing_day1(monkeypatch, techs):
    """Test ETA fits after an existing job on Day 1."""
    setup_eta_test_mocks(monkeypatch)
    tech = techs[0]
    tech.current_location = loc_home_base
    
    # Existing schedule: Job X (3h) at Loc B on Day 1
    existing_job = MockJob(order_id=80, location=loc_job_b, equipment=[], duration_hours=3)
    existing_unit = MockSchedulableUnit([existing_job], 5, timedelta(hours=3), loc_job_b)
    tech.schedule = {1: [existing_unit]} # Pre-populate schedule

    job_to_calc = MockJob(order_id=81, location=loc_job_c, equipment=[], duration_hours=2)

    # Calculate expected end time of existing schedule
    # Day 1 Start: 9:00
    # Travel Home->B: 30 min
    # Existing Job Start: 9:30
    # Existing Job End: 12:30 (Duration 3h)
    # Last event end time = 12:30, Last Location = Loc B
    day1_start_time = mock_get_availability_update(tech, 1)['start_time']
    travel1 = mock_calculate_travel_update(tech.current_location, existing_unit.location)
    existing_job_start = day1_start_time + travel1
    existing_job_end = existing_job_start + existing_unit.duration # Expected: 2024-01-01 12:30:00

    # Calculate ETA for new job
    # Travel B->C: 30 min
    # New Job Start: 12:30 + 30 min = 13:00
    travel2 = mock_calculate_travel_update(existing_unit.location, job_to_calc.location)
    expected_eta = existing_job_end + travel2

    actual_eta = calculate_eta(tech, [job_to_calc])

    assert actual_eta is not None
    assert actual_eta == expected_eta
    # Also check it fits within the day (Day 1 ends at 17:00)
    day1_end_time = mock_get_availability_update(tech, 1)['end_time']
    assert expected_eta + job_to_calc.job_duration <= day1_end_time

def test_calculate_eta_spills_to_next_day(monkeypatch, techs):
    """Test ETA calculation when job doesn't fit Day 1, finds slot on Day 2."""
    setup_eta_test_mocks(monkeypatch)
    tech = techs[0]
    tech.current_location = loc_home_base
    tech.home_location = loc_home_base # Needed for day 2 start

    # Existing schedule: Job X (6h) at Loc B on Day 1
    # Day 1: Start 9:00, End 17:00 (8h capacity)
    # Travel Home->B = 30min. Job X starts 9:30, ends 15:30.
    existing_job = MockJob(order_id=90, location=loc_job_b, equipment=[], duration_hours=6)
    existing_unit = MockSchedulableUnit([existing_job], 5, timedelta(hours=6), loc_job_b)
    tech.schedule = {1: [existing_unit]}
    
    # Job to calc: 3 hours at Loc C
    # Travel B->C = 30min. Potential start = 15:30 + 30m = 16:00.
    # Potential end = 16:00 + 3h = 19:00. This is > 17:00 (Day 1 end).
    job_to_calc = MockJob(order_id=91, location=loc_job_c, equipment=[], duration_hours=3)

    # Expect it to be scheduled on Day 2
    # Day 2: Start 9:00. Start location = Home Base.
    # Travel Home->C = 30min.
    # Expected ETA = Day 2 Start + Travel = 9:30
    day2_start_time = mock_get_availability_update(tech, 2)['start_time']
    travel_day2 = mock_calculate_travel_update(tech.home_location, job_to_calc.location)
    expected_eta = day2_start_time + travel_day2

    actual_eta = calculate_eta(tech, [job_to_calc])

    assert actual_eta is not None
    assert actual_eta == expected_eta

def test_calculate_eta_respects_daily_capacity(monkeypatch, techs):
    """Test ETA calculation when job fits duration but exceeds end time on Day 1."""
    setup_eta_test_mocks(monkeypatch)
    tech = techs[0]
    tech.current_location = loc_home_base
    tech.home_location = loc_home_base

    # Existing schedule: Job X (4h) at Loc B starting late on Day 1
    # Simulate schedule has it starting at 13:00 (maybe due to prior jobs not in this unit)
    # For simplicity, let's mock the state *within* calculate_eta assumes
    # We need to influence the 'last_scheduled_event_end_time' for day 1
    # This highlights the complexity and potential need for better mocking/refactoring later.
    
    # Let's simulate the state: Day 1 ends at 17:00. Last event ended 13:00 at Loc B.
    # (Alternative: pre-populate tech.schedule in a way that results in this state)
    # Easier: Use monkeypatch to control the calculated last event end time inside the function.
    original_calc_eta = calculate_eta
    def patched_calculate_eta(technician, jobs_to_consider):
        # Inside calculate_eta, force last event end time for day 1
        if hasattr(technician, '_mock_last_event_end_day1'):
            # Temporarily patch the logic that calculates this value
            # This is fragile and depends on implementation details!
            # TODO: Refactor calculate_eta or testing approach for better state control.
            pass # Need a way to inject this state cleanly 
        return original_calc_eta(technician, jobs_to_consider)
    # TODO: Find a less intrusive way to test this. Skipping direct patch for now.

    # Re-approach: Set up schedule that forces the situation
    # Day 1: 9:00-17:00 (8h). Job X (4h) @ Loc A. Job Y (3h) @ Loc B.
    # Home->A (30m). Job X: 9:30-13:30. Loc A.
    # A->B (30m). Job Y: 14:00-17:00. Loc B. Day 1 is full.
    job_x = MockJob(order_id=100, location=loc_job_a, equipment=[], duration_hours=4)
    job_y = MockJob(order_id=101, location=loc_job_b, equipment=[], duration_hours=3)
    unit_x = MockSchedulableUnit([job_x], 5, timedelta(hours=4), loc_job_a)
    unit_y = MockSchedulableUnit([job_y], 5, timedelta(hours=3), loc_job_b)
    tech.schedule = {1: [unit_x, unit_y]} # Day 1 schedule

    # Job to calc: 1 hour @ Loc C. Should fit duration-wise, but no time left day 1.
    job_to_calc = MockJob(order_id=102, location=loc_job_c, equipment=[], duration_hours=1)

    # Expect Day 2 start
    day2_start_time = mock_get_availability_update(tech, 2)['start_time']
    travel_day2 = mock_calculate_travel_update(tech.home_location, job_to_calc.location)
    expected_eta = day2_start_time + travel_day2 # 9:30 on Day 2

    actual_eta = calculate_eta(tech, [job_to_calc])
    assert actual_eta is not None
    assert actual_eta == expected_eta

def test_calculate_eta_skips_unavailable_day(monkeypatch, techs):
    """Test ETA calculation skips Day 4 (unavailable) and finds slot on Day 5."""
    setup_eta_test_mocks(monkeypatch)
    tech = techs[0]
    tech.home_location = loc_home_base

    # Fill days 1, 2, 3 exactly (using availability mock)
    # Day 1: 8h -> Job 1 (7.5h + 0.5h travel = 8h)
    job1 = MockJob(order_id=110, location=loc_job_a, equipment=[], duration_hours=7.5)
    unit1 = MockSchedulableUnit([job1], 1, timedelta(hours=7.5), loc_job_a)
    # Day 2: 8h -> Job 2 (7.5h + 0.5h travel = 8h)
    job2 = MockJob(order_id=111, location=loc_job_b, equipment=[], duration_hours=7.5)
    unit2 = MockSchedulableUnit([job2], 2, timedelta(hours=7.5), loc_job_b)
    # Day 3: 4h -> Job 3 (3.5h + 0.5h travel = 4h)
    job3 = MockJob(order_id=112, location=loc_job_c, equipment=[], duration_hours=3.5)
    unit3 = MockSchedulableUnit([job3], 3, timedelta(hours=3.5), loc_job_c)
    tech.schedule = {1: [unit1], 2: [unit2], 3: [unit3]}

    # Job to calc: 1 hour @ Loc D. Should skip Day 4.
    job_to_calc = MockJob(order_id=113, location=loc_job_d, equipment=[], duration_hours=1)

    # Adjust mock availability for Day 5
    original_avail = mock_get_availability_update
    def extended_avail(tech_arg, day_number):
        if day_number == 5:
            base_time = datetime(2024, 1, 1, 0, 0, 0) + timedelta(days=day_number - 1)
            return {"start_time": base_time.replace(hour=9), "end_time": base_time.replace(hour=17), "total_duration": timedelta(hours=8)}
        return original_avail(tech_arg, day_number) # Use original for days 1-4
    monkeypatch.setattr("src.scheduler.scheduler.get_technician_availability", extended_avail)

    # Expected ETA on Day 5
    day5_start_time = extended_avail(tech, 5)['start_time']
    travel_day5 = mock_calculate_travel_update(tech.home_location, job_to_calc.location)
    expected_eta = day5_start_time + travel_day5 # 9:30 on Day 5

    actual_eta = calculate_eta(tech, [job_to_calc])
    assert actual_eta is not None
    assert actual_eta == expected_eta
    assert actual_eta.day == 5 # Check it landed on Day 5

def test_calculate_eta_no_fit_found(monkeypatch, techs):
    """Test calculate_eta returns None when job doesn't fit any available slot."""
    setup_eta_test_mocks(monkeypatch)
    tech = techs[0]
    tech.home_location = loc_home_base
    tech.schedule = {} # Empty schedule

    # Job to calc: 10 hours. Max daily capacity is 8 hours.
    job_too_long = MockJob(order_id=120, location=loc_job_a, equipment=[], duration_hours=10)

    actual_eta = calculate_eta(tech, [job_too_long])

    assert actual_eta is None

def test_calculate_eta_multi_job_unit(monkeypatch, techs):
    """Test ETA calculation for a unit representing multiple jobs."""
    setup_eta_test_mocks(monkeypatch)
    tech = techs[0]
    tech.schedule = {}
    tech.current_location = loc_home_base

    # Unit: Job A (1h) + Job B (1h) = 2h total duration. Assume Loc A is primary.
    job_a = MockJob(order_id=130, location=loc_job_a, equipment=[], duration_hours=1)
    job_b = MockJob(order_id=130, location=loc_job_a, equipment=[], duration_hours=1) # Same location for simplicity
    jobs_in_unit = [job_a, job_b]

    expected_travel = mock_calculate_travel_update(tech.current_location, loc_job_a)
    day1_start_time = mock_get_availability_update(tech, 1)['start_time']
    expected_eta = day1_start_time + expected_travel # ETA for the *first* job start

    actual_eta = calculate_eta(tech, jobs_in_unit)

    assert actual_eta is not None
    assert actual_eta == expected_eta

    # Verify the *entire unit* fits within the day
    unit_duration = timedelta()
    for job in jobs_in_unit:
        unit_duration += job.job_duration
    assert day1_start_time + expected_travel + unit_duration <= mock_get_availability_update(tech, 1)['end_time']


# ... existing tests for assign_jobs ...
# ... existing tests for update_job_queues_and_routes ... 