"""Shared fixtures for API tests."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import uuid
from datetime import datetime, timedelta
import os

from src.scheduler.api.main import create_app
from src.scheduler.models import (
    Address, Technician, Van, Equipment, Job, Order, Service, CustomerVehicle,
    CustomerType, JobStatus, ServiceCategory, EquipmentType
)

# Import the dependency to override
from src.scheduler.api.deps import get_db

# --- Mock Database Session Fixture ---
@pytest.fixture
def mock_db_session():
    """
    Provides a mock database session (MagicMock).
    Tests can configure its behavior (e.g., mock_db_session.query.return_value...).
    """
    # Create a mock session object
    db_session = MagicMock()
    # Make query().filter().first() chainable and return None by default
    db_session.query.return_value.filter.return_value.first.return_value = None
    # Make query().all() return an empty list by default
    db_session.query.return_value.all.return_value = []
    # Make query().options().filter()... chainable
    db_session.query.return_value.options.return_value.filter.return_value.first.return_value = None
    db_session.query.return_value.options.return_value.filter.return_value.all.return_value = []
    # Add other common methods/chaining as needed for tests
    yield db_session

# --- Test API Key Fixture ---
@pytest.fixture
def test_api_key():
    """Valid API key for testing."""
    return "test-api-key"

# --- Mock Settings Fixture ---
@pytest.fixture
def mock_settings(test_api_key):
    """Mock settings for API tests."""
    return {
        "database_url": "postgresql://user:password@localhost:5432/test_db",
        "api_keys": [test_api_key]
    }

# --- Test Client Fixture (Updated) ---
@pytest.fixture
def client(mock_settings, test_api_key, mock_db_session):
    """
    Create a FastAPI TestClient with mocked dependencies (settings and DB session).
    """
    # Set environment variable for tests (for settings dependency)
    os.environ["API_KEYS"] = test_api_key

    # Define a function that returns our mock session
    def override_get_db():
        yield mock_db_session
    
    # Mock the settings function and override the DB dependency
    with patch("src.scheduler.api.deps.get_settings", return_value=mock_settings):
        app = create_app()
        app.dependency_overrides[get_db] = override_get_db
        
        with TestClient(app) as test_client:
            yield test_client
        
        # Clean up dependency overrides after tests
        app.dependency_overrides = {}


@pytest.fixture
def mock_address():
    """Create a mock address."""
    return Address(
        id=1,
        street_address="123 Test St",
        lat=40.7128,
        lng=-74.0060
    )


@pytest.fixture
def mock_equipment():
    """Create a mock equipment item."""
    return Equipment(
        id=1,
        equipment_type=EquipmentType.ADAS,
        model="AUTEL-CSC0602/01"
    )


@pytest.fixture
def mock_van(mock_equipment):
    """Create a mock van with equipment."""
    return Van(
        id=1,
        last_service=datetime.now() - timedelta(days=30),
        next_service=datetime.now() + timedelta(days=60),
        vin="1HGCM82633A004352",
        equipment=[mock_equipment]
    )


@pytest.fixture
def mock_technician(mock_address, mock_van):
    """Create a mock technician."""
    return Technician(
        id=1,
        user_id=uuid.uuid4(),
        assigned_van_id=mock_van.id,
        workload=2,
        home_address=mock_address,
        current_location=mock_address,
        assigned_van=mock_van
    )


@pytest.fixture
def mock_technicians(mock_technician):
    """Create a list of mock technicians."""
    return [mock_technician]


@pytest.fixture
def mock_vehicle():
    """Create a mock customer vehicle."""
    return CustomerVehicle(
        id=1,
        vin="1HGCM82633A004352",
        make="Honda",
        year=2022,
        model="Civic",
        ymm_id=1
    )


@pytest.fixture
def mock_service():
    """Create a mock service."""
    return Service(
        id=1,
        service_name="Front Radar Calibration",
        service_category=ServiceCategory.ADAS
    )


@pytest.fixture
def mock_order(mock_address, mock_vehicle, mock_service):
    """Create a mock order."""
    return Order(
        id=1,
        user_id=uuid.uuid4(),
        vehicle_id=mock_vehicle.id,
        repair_order_number="RO12345",
        address_id=mock_address.id,
        earliest_available_time=datetime.now(),
        notes="Test notes",
        invoice=100001,
        customer_type=CustomerType.COMMERCIAL,
        address=mock_address,
        vehicle=mock_vehicle,
        services=[mock_service]
    )


@pytest.fixture
def mock_job(mock_address, mock_order):
    """Create a mock job."""
    return Job(
        id=1,
        order_id=mock_order.id,
        service_id=1,
        assigned_technician=None,
        address_id=mock_address.id,
        priority=2,
        status=JobStatus.PENDING_REVIEW,
        requested_time=datetime.now(),
        estimated_sched=None,
        estimated_sched_end=None,
        customer_eta_start=None,
        customer_eta_end=None,
        job_duration=timedelta(minutes=90),
        notes="Test job notes",
        fixed_assignment=False,
        fixed_schedule_time=None,
        order_ref=mock_order,
        address=mock_address,
        equipment_requirements=["AUTEL-CSC0602/01"]
    )


@pytest.fixture
def mock_jobs(mock_job):
    """Create a list of mock jobs."""
    return [mock_job]


@pytest.fixture
def mock_equipment_requirements():
    """Create mock equipment requirements."""
    return ["AUTEL-CSC0602/01", "AUTEL-CSC0602/02"] 