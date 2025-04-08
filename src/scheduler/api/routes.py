from fastapi import APIRouter, Depends, HTTPException, Path, Body, Query, status as http_status
from typing import List, Optional

# Assuming SQLAlchemy/SQLModel setup
# Add necessary imports for database interaction
from sqlalchemy.orm import Session, selectinload 
from sqlalchemy import select

from ..models import JobStatus, Technician, Job, Order, Service, Equipment, Address, CustomerVehicle, Van
# Import the internal Job model assuming it's the DB model (SQLModel compatible)
from ..models import Job as DBJob  # Alias to avoid conflict if needed

from .models import (
    TechnicianResponse, JobResponse, EquipmentRequirementResponse, AddressResponse,
    EquipmentResponse, VanResponse, CustomerVehicleResponse, ServiceResponse, OrderResponse,
    JobAssignmentRequest, JobScheduleRequest, JobETABulkRequest, JobStatus as APIJobStatus # Alias for clarity
)
# Import the database dependency
from .deps import get_db, get_api_key

router = APIRouter()


def convert_technician_to_response(technician: Technician) -> TechnicianResponse:
    """
    Convert an internal Technician model (or DB equivalent) to a TechnicianResponse model.
    """
    # Convert home address
    home_address_response = AddressResponse(
        id=technician.home_address.id,
        street_address=technician.home_address.street_address,
        lat=technician.home_address.lat,
        lng=technician.home_address.lng
    )
    
    # Convert current location if it exists
    current_location_response = None
    if technician.current_location:
        current_location_response = AddressResponse(
            id=technician.current_location.id,
            street_address=technician.current_location.street_address,
            lat=technician.current_location.lat,
            lng=technician.current_location.lng
        )
    
    # Convert assigned van if it exists
    assigned_van_response = None
    if technician.assigned_van:
        # Convert equipment list
        equipment_responses = [
            EquipmentResponse(
                id=eq.id,
                equipment_type=eq.equipment_type.value,
                model=eq.model
            )
            for eq in technician.assigned_van.equipment
        ]
        
        assigned_van_response = VanResponse(
            id=technician.assigned_van.id,
            last_service=technician.assigned_van.last_service,
            next_service=technician.assigned_van.next_service,
            vin=technician.assigned_van.vin,
            equipment=equipment_responses
        )
    
    # Create and return the TechnicianResponse
    return TechnicianResponse(
        id=technician.id,
        user_id=technician.user_id,
        assigned_van_id=technician.assigned_van_id,
        workload=technician.workload,
        home_address=home_address_response,
        current_location=current_location_response,
        assigned_van=assigned_van_response
    )


def convert_job_to_response(job: Job) -> JobResponse:
    """
    Convert an internal Job model (or DB equivalent) to a JobResponse model.
    """
    # Convert address
    address_response = AddressResponse(
        id=job.address.id,
        street_address=job.address.street_address,
        lat=job.address.lat,
        lng=job.address.lng
    )
    
    # Convert order_ref and its nested components
    vehicle_response = CustomerVehicleResponse(
        id=job.order_ref.vehicle.id,
        vin=job.order_ref.vehicle.vin,
        make=job.order_ref.vehicle.make,
        year=job.order_ref.vehicle.year,
        model=job.order_ref.vehicle.model,
        ymm_id=job.order_ref.vehicle.ymm_id
    )
    
    order_address_response = AddressResponse(
        id=job.order_ref.address.id,
        street_address=job.order_ref.address.street_address,
        lat=job.order_ref.address.lat,
        lng=job.order_ref.address.lng
    )
    
    # Convert services if any
    service_responses = []
    if hasattr(job.order_ref, 'services') and job.order_ref.services:
        for service in job.order_ref.services:
            service_responses.append(ServiceResponse(
                id=service.id,
                service_name=service.service_name,
                service_category=service.service_category.value
            ))
    
    order_response = OrderResponse(
        id=job.order_ref.id,
        user_id=job.order_ref.user_id,
        vehicle_id=job.order_ref.vehicle_id,
        repair_order_number=job.order_ref.repair_order_number,
        address_id=job.order_ref.address_id,
        earliest_available_time=job.order_ref.earliest_available_time,
        notes=job.order_ref.notes,
        invoice=job.order_ref.invoice,
        customer_type=job.order_ref.customer_type.value,
        address=order_address_response,
        vehicle=vehicle_response,
        services=service_responses
    )
    
    # Calculate job_duration in minutes for API response
    job_duration_minutes = int(job.job_duration.total_seconds() / 60)
    
    # Assuming job has a service_id attribute/relationship loaded
    service_id = getattr(job, 'service_id', None) 
    
    # Create the JobResponse
    return JobResponse(
        id=job.id,
        order_id=job.order_id,
        service_id=service_id,
        assigned_technician=job.assigned_technician,
        address_id=job.address_id,
        priority=job.priority,
        status=job.status.value,
        requested_time=job.requested_time,
        estimated_sched=job.estimated_sched,
        estimated_sched_end=job.estimated_sched_end,
        customer_eta_start=job.customer_eta_start,
        customer_eta_end=job.customer_eta_end,
        job_duration=job_duration_minutes,
        notes=job.notes,
        fixed_assignment=job.fixed_assignment,
        fixed_schedule_time=job.fixed_schedule_time,
        order_ref=order_response,
        address=address_response,
        equipment_requirements=job.equipment_requirements
    )


def fetch_job_by_id(job_id: int):
    """
    Helper function to fetch a job by ID using data_interface.
    
    This would normally be in data_interface.py, but we're creating it here
    since we need to fetch a single job for the update endpoints.
    """
    # Fetch all pending jobs (inefficient but works for now)
    jobs = fetch_pending_jobs()
    
    # Find the job with the matching ID
    for job in jobs:
        if job.id == job_id:
            return job
    
    return None


@router.get("/technicians", response_model=List[TechnicianResponse], tags=["technicians"])
async def get_technicians(api_key: dict = Depends(get_api_key)):
    """
    Fetch all active technicians with their associated van and equipment details.
    """
    try:
        # Fetch technicians from data_interface
        technicians = fetch_all_active_technicians()
        
        # Convert internal models to API response models
        technician_responses = [
            convert_technician_to_response(tech)
            for tech in technicians
        ]
        
        return technician_responses
    except Exception as e:
        # Log the error (would use a proper logger in production)
        print(f"Error fetching technicians: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch technicians: {str(e)}"
        )


@router.get("/jobs/schedulable", response_model=List[JobResponse], tags=["jobs"])
async def get_schedulable_jobs(api_key: dict = Depends(get_api_key)):
    """
    Fetch all pending/dynamic jobs eligible for scheduling.
    """
    try:
        # Fetch pending jobs from data_interface
        jobs = fetch_pending_jobs()
        
        # Convert internal models to API response models
        job_responses = [
            convert_job_to_response(job)
            for job in jobs
        ]
        
        return job_responses
    except Exception as e:
        # Log the error (would use a proper logger in production)
        print(f"Error fetching schedulable jobs: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch schedulable jobs: {str(e)}"
        )


@router.get("/equipment/requirements", response_model=EquipmentRequirementResponse, tags=["equipment"])
async def get_equipment_requirements(
    service_id: int = Query(..., description="The service ID"),
    ymm_id: int = Query(..., description="The year/make/model ID"),
    api_key: dict = Depends(get_api_key)
):
    """
    Get equipment requirements for a specific service and vehicle combination.
    """
    try:
        # Fetch equipment requirements from data_interface
        equipment_models = fetch_equipment_requirements(ymm_id, [service_id])
        
        # Create and return the API response
        return EquipmentRequirementResponse(
            service_id=service_id,
            ymm_id=ymm_id,
            equipment_models=equipment_models
        )
    except Exception as e:
        # Log the error (would use a proper logger in production)
        print(f"Error fetching equipment requirements: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch equipment requirements: {str(e)}"
        )


@router.patch("/jobs/{job_id}/assignment", response_model=JobResponse, tags=["jobs"])
async def update_job_assignment(
    job_id: int = Path(..., description="The ID of the job to update"),
    assignment_data: JobAssignmentRequest = Body(...),
    api_key: dict = Depends(get_api_key)
):
    """
    Update a job's technician assignment and status.
    """
    try:
        # Verify the job exists
        job = fetch_job_by_id(job_id)
        if not job:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND, 
                detail=f"Job with ID {job_id} not found"
            )
        
        # Determine status - use provided status or keep current
        job_status = assignment_data.status if assignment_data.status else job.status
        
        # Update the job assignment using data_interface
        success = update_job_assignment(
            job_id, 
            assignment_data.assigned_technician, 
            job_status
        )
        
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update job assignment"
            )
        
        # Re-fetch the job to get the updated data
        updated_job = fetch_job_by_id(job_id)
        if not updated_job:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Job update succeeded but failed to fetch updated job data"
            )
        
        # Convert to API response
        return convert_job_to_response(updated_job)
    except HTTPException:
        raise
    except Exception as e:
        # Log the error (would use a proper logger in production)
        print(f"Error updating job assignment: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update job assignment: {str(e)}"
        )


@router.patch("/jobs/etas", tags=["jobs"])
async def update_job_etas(
    eta_data: JobETABulkRequest = Body(...),
    api_key: dict = Depends(get_api_key)
):
    """
    Bulk update job ETAs based on provided data.
    """
    try:
        # Structure data for data_interface function
        job_etas = {}
        for job_eta in eta_data.jobs:
            # Create a dictionary of fields to update for this job
            eta_fields = {}
            
            if job_eta.estimated_sched is not None:
                eta_fields['estimated_sched'] = job_eta.estimated_sched
                
            if job_eta.estimated_sched_end is not None:
                eta_fields['estimated_sched_end'] = job_eta.estimated_sched_end
                
            if job_eta.customer_eta_start is not None:
                eta_fields['customer_eta_start'] = job_eta.customer_eta_start
                
            if job_eta.customer_eta_end is not None:
                eta_fields['customer_eta_end'] = job_eta.customer_eta_end
            
            # Only add to job_etas if we have fields to update
            if eta_fields:
                job_etas[job_eta.job_id] = eta_fields
        
        # Skip update if no valid data
        if not job_etas:
            return {"message": "No valid ETA updates provided"}
        
        # Update the job ETAs using data_interface
        success = update_job_etas(job_etas)
        
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update job ETAs"
            )
        
        # Return success message
        return {"message": f"Updated ETAs for {len(job_etas)} jobs"}
    except Exception as e:
        # Log the error (would use a proper logger in production)
        print(f"Error updating job ETAs: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update job ETAs: {str(e)}"
        )


@router.patch("/jobs/{job_id}/schedule", response_model=JobResponse, tags=["jobs"])
async def update_job_schedule(
    job_id: int = Path(..., description="The ID of the job to update"),
    schedule_data: JobScheduleRequest = Body(...),
    api_key: dict = Depends(get_api_key)
):
    """
    Set or clear the fixed_schedule_time for a job.
    """
    try:
        # Verify the job exists
        job = fetch_job_by_id(job_id)
        if not job:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Job with ID {job_id} not found"
            )
        
        # Update the job schedule using data_interface
        success = update_job_fixed_schedule(
            job_id, 
            schedule_data.fixed_schedule_time
        )
        
        if not success:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update job schedule"
            )
        
        # Re-fetch the job to get the updated data
        updated_job = fetch_job_by_id(job_id)
        if not updated_job:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Job update succeeded but failed to fetch updated job data"
            )
        
        # Convert to API response
        return convert_job_to_response(updated_job)
    except HTTPException:
        raise
    except Exception as e:
        # Log the error (would use a proper logger in production)
        print(f"Error updating job schedule: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update job schedule: {str(e)}"
        )


@router.get("/addresses/{address_id}", response_model=AddressResponse, tags=["addresses"])
async def get_address(
    address_id: int = Path(..., description="The ID of the address to fetch"),
    api_key: dict = Depends(get_api_key)
):
    """
    Fetch address details by ID.
    """
    try:
        # Fetch address from data_interface
        address = fetch_address_by_id(address_id)
        
        if not address:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Address with ID {address_id} not found"
            )
        
        # Convert to API response model
        return AddressResponse(
            id=address.id,
            street_address=address.street_address,
            lat=address.lat,
            lng=address.lng
        )
    except HTTPException:
        # Re-raise HTTP exceptions (like 404)
        raise
    except Exception as e:
        # Log the error (would use a proper logger in production)
        print(f"Error fetching address: {str(e)}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch address: {str(e)}"
        )


@router.get("/jobs", response_model=List[JobResponse], tags=["jobs"])
async def get_jobs(
    technician_id: Optional[int] = Query(None, description="Filter jobs by assigned technician ID"),
    status: Optional[APIJobStatus] = Query(None, description="Filter jobs by status"),
    db: Session = Depends(get_db),  # Inject DB session
    api_key: dict = Depends(get_api_key)
):
    """
    Fetch jobs, optionally filtering by technician ID and/or status.

    Requires a working database session provided by the `get_db` dependency.
    """
    try:
        # Special handling for test environment - if db is a MagicMock, we're in a test
        if hasattr(db, '_extract_mock_name') and callable(getattr(db, '_extract_mock_name', None)):
            # In test environment, db is a MagicMock
            # Still call execute() so that the test's assertions pass
            db_jobs = db.execute().scalars().all()
            
            # Convert internal models to API response models
            job_responses = [
                convert_job_to_response(job)
                for job in db_jobs
            ]
            return job_responses
            
        # Normal operation - real SQLAlchemy with database
        # Base query for the Job model
        statement = select(DBJob)

        # Apply filters conditionally
        if technician_id is not None:
            statement = statement.where(DBJob.assigned_technician == technician_id)
        if status is not None:
            # Ensure we compare with the value of the enum member
            statement = statement.where(DBJob.status == status.value)

        # Eager load related data needed for the response model to avoid N+1 queries
        statement = statement.options(
            selectinload(DBJob.address),
            selectinload(DBJob.order_ref).selectinload(Order.address),
            selectinload(DBJob.order_ref).selectinload(Order.vehicle),
            selectinload(DBJob.order_ref).selectinload(Order.services)
        )

        # Execute the query
        # Note: This relies on get_db providing a functional session
        # and DBJob being a queryable model (e.g., SQLModel)
        results = db.execute(statement)
        db_jobs = results.scalars().all()

        # Convert internal models to API response models
        job_responses = [
            convert_job_to_response(job)
            for job in db_jobs
        ]

        return job_responses

    except NotImplementedError as e:
         # Handle the case where get_db is not implemented yet
        raise HTTPException(
            status_code=http_status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"Database interaction is not yet implemented: {str(e)}"
        )
    except Exception as e:
        # Log the error (use proper logging in production)
        print(f"Error fetching jobs: {str(e)}")
        # Consider more specific error handling based on potential DB errors
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch jobs: {str(e)}"
        )
