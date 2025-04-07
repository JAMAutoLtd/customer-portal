from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime

# Assuming a database session/connection object `db_session` is available globally or passed in.
# For now, these functions will just have placeholders and return types.
from .models import Technician, Job, Order, Service, Equipment, Address, CustomerVehicle, CustomerType, JobStatus, Van


def fetch_address_by_id(address_id: int) -> Optional[Address]:
    """Fetches an address by its ID."""
    result = mcp_supabase_query("""
        SELECT id, street_address, lat, lng
        FROM addresses
        WHERE id = %s
        LIMIT 1
    """, [address_id])
    
    if not result or not result[0]:
        return None
    
    addr = result[0]
    return Address(
        id=addr['id'],
        street_address=addr['street_address'],
        lat=addr['lat'],
        lng=addr['lng']
    )

def fetch_vehicle_by_id(vehicle_id: int) -> Optional[CustomerVehicle]:
    """Fetches a customer vehicle by its ID, potentially including ymm_id."""
    result = mcp_supabase_query("""
        SELECT cv.id, cv.vin, cv.make, cv.year, cv.model,
               ymm.ymm_id
        FROM customer_vehicles cv
        LEFT JOIN ymm_ref ymm ON 
            ymm.year = cv.year AND 
            ymm.make = cv.make AND 
            ymm.model = cv.model
        WHERE cv.id = %s
        LIMIT 1
    """, [vehicle_id])
    
    if not result or not result[0]:
        return None
    
    vehicle = result[0]
    return CustomerVehicle(
        id=vehicle['id'],
        vin=vehicle['vin'],
        make=vehicle['make'],
        year=vehicle['year'],
        model=vehicle['model'],
        ymm_id=vehicle['ymm_id']
    )

def fetch_user_customer_type(user_id: uuid.UUID) -> Optional[CustomerType]:
    """Fetches the customer type for a given user ID."""
    result = mcp_supabase_query("""
        SELECT customer_type
        FROM users
        WHERE id = %s
        LIMIT 1
    """, [str(user_id)])
    
    if not result or not result[0]:
        return None
    
    return CustomerType(result[0]['customer_type'])

def fetch_services_by_ids(service_ids: List[int]) -> List[Service]:
    """Fetches service details for a list of service IDs."""
    if not service_ids:
        return []
        
    # Convert list of IDs to string for IN clause
    ids_str = ','.join(str(id) for id in service_ids)
    
    result = mcp_supabase_query(f"""
        SELECT id, service_name, service_category
        FROM services
        WHERE id IN ({ids_str})
    """)
    
    if not result:
        return []
    
    return [
        Service(
            id=svc['id'],
            service_name=svc['service_name'],
            service_category=svc['service_category']
        )
        for svc in result
    ]

def fetch_van_with_equipment(van_id: int) -> Optional[Van]:
    """Fetches van details including its equipment list."""
    # First fetch the van details
    van_result = mcp_supabase_query("""
        SELECT id, last_service, next_service, vin
        FROM vans
        WHERE id = %s
        LIMIT 1
    """, [van_id])
    
    if not van_result or not van_result[0]:
        return None
    
    van_data = van_result[0]
    
    # Then fetch all equipment for this van
    equipment_result = mcp_supabase_query("""
        SELECT e.id, e.equipment_type, ve.equipment_model as model
        FROM van_equipment ve
        JOIN equipment e ON e.id = ve.equipment_id
        WHERE ve.van_id = %s
    """, [van_id])
    
    equipment_list = [
        Equipment(
            id=eq['id'],
            equipment_type=eq['equipment_type'],
            model=eq['model']
        )
        for eq in (equipment_result or [])
    ]
    
    return Van(
        id=van_data['id'],
        last_service=van_data['last_service'],
        next_service=van_data['next_service'],
        vin=van_data['vin'],
        equipment=equipment_list
    )

def fetch_all_active_technicians() -> List[Technician]:
    """
    Fetches all active technicians, populating their associated van,
    equipment, home address, and potentially current location.
    """
    result = mcp_supabase_query("""
        SELECT 
            t.id,
            t.user_id,
            t.assigned_van_id,
            t.workload,
            u.home_address_id,
            a.id as addr_id,
            a.street_address,
            a.lat,
            a.lng
        FROM technicians t
        JOIN users u ON u.id = t.user_id
        JOIN addresses a ON a.id = u.home_address_id
        -- Could add WHERE clause here if we need to filter active/inactive techs
    """)
    
    if not result:
        return []
    
    technicians = []
    for tech_data in result:
        # Create Address object for home location
        home_addr = Address(
            id=tech_data['addr_id'],
            street_address=tech_data['street_address'],
            lat=tech_data['lat'],
            lng=tech_data['lng']
        )
        
        # Fetch van and equipment if assigned
        assigned_van = None
        if tech_data['assigned_van_id']:
            assigned_van = fetch_van_with_equipment(tech_data['assigned_van_id'])
        
        tech = Technician(
            id=tech_data['id'],
            user_id=tech_data['user_id'],
            assigned_van_id=tech_data['assigned_van_id'],
            workload=tech_data['workload'],
            home_address=home_addr,
            current_location=home_addr,  # Default to home address if no current location tracked
            assigned_van=assigned_van
        )
        technicians.append(tech)
    
    return technicians

def fetch_pending_jobs() -> List[Job]:
    """
    Fetches all jobs eligible for scheduling (e.g., status='pending_review',
    not fixed if we only schedule dynamic ones initially).
    Populates related Order, Address, Vehicle, Services, and CustomerType.
    Also fetches equipment requirements for each job.
    """
    # First fetch the jobs with their basic related data
    result = mcp_supabase_query("""
        SELECT 
            j.id,
            j.order_id,
            j.assigned_technician_id,
            j.address_id,
            j.priority,
            j.status,
            j.requested_time,
            j.estimated_sched,
            j.job_duration,
            j.notes,
            -- Order fields
            o.user_id,
            o.vehicle_id,
            o.repair_order_number,
            o.earliest_available_time,
            o.notes as order_notes,
            o.invoice,
            -- Address fields
            a.street_address,
            a.lat,
            a.lng,
            -- User fields
            u.customer_type,
            -- Vehicle fields
            cv.vin,
            cv.make,
            cv.year,
            cv.model,
            ymm.ymm_id
        FROM jobs j
        JOIN orders o ON o.id = j.order_id
        JOIN addresses a ON a.id = j.address_id
        JOIN users u ON u.id = o.user_id
        JOIN customer_vehicles cv ON cv.id = o.vehicle_id
        LEFT JOIN ymm_ref ymm ON 
            ymm.year = cv.year AND 
            ymm.make = cv.make AND 
            ymm.model = cv.model
        WHERE j.status = 'pending_review'
        AND j.fixed = false
    """)
    
    if not result:
        return []
    
    # For each job, we need to:
    # 1. Create the Address object
    # 2. Create the CustomerVehicle object
    # 3. Fetch the services for the job
    # 4. Fetch equipment requirements based on services and vehicle
    # 5. Create the Order object
    # 6. Finally create the Job object with all related data
    
    jobs = []
    for job_data in result:
        # 1. Create Address
        address = Address(
            id=job_data['address_id'],
            street_address=job_data['street_address'],
            lat=job_data['lat'],
            lng=job_data['lng']
        )
        
        # 2. Create CustomerVehicle
        vehicle = CustomerVehicle(
            id=job_data['vehicle_id'],
            vin=job_data['vin'],
            make=job_data['make'],
            year=job_data['year'],
            model=job_data['model'],
            ymm_id=job_data['ymm_id']
        )
        
        # 3. Fetch services for this job
        services_result = mcp_supabase_query("""
            SELECT s.id, s.service_name, s.service_category
            FROM job_services js
            JOIN services s ON s.id = js.service_id
            WHERE js.job_id = %s
        """, [job_data['id']])
        
        services = [
            Service(
                id=svc['id'],
                service_name=svc['service_name'],
                service_category=svc['service_category']
            )
            for svc in (services_result or [])
        ]
        
        # 4. Fetch equipment requirements
        equipment_requirements = []
        if job_data['ymm_id'] and services:
            equipment_requirements = fetch_equipment_requirements(
                job_data['ymm_id'],
                [s.id for s in services]
            )
        
        # 5. Create Order
        order = Order(
            id=job_data['order_id'],
            user_id=job_data['user_id'],
            vehicle_id=job_data['vehicle_id'],
            repair_order_number=job_data['repair_order_number'],
            address_id=job_data['address_id'],
            earliest_available_time=job_data['earliest_available_time'],
            notes=job_data['order_notes'],
            invoice=job_data['invoice'],
            customer_type=CustomerType(job_data['customer_type']),
            address=address,
            vehicle=vehicle,
            services=services
        )
        
        # 6. Create Job
        job = Job(
            id=job_data['id'],
            order_id=job_data['order_id'],
            assigned_technician_id=job_data['assigned_technician_id'],
            address_id=job_data['address_id'],
            priority=job_data['priority'],
            status=JobStatus(job_data['status']),
            requested_time=job_data['requested_time'],
            estimated_sched=job_data['estimated_sched'],
            job_duration=job_data['job_duration'],  # Will be converted by validator
            notes=job_data['notes'],
            fixed=False,  # We filtered for non-fixed jobs
            order_ref=order,
            address=address,
            services=services,
            equipment_requirements=equipment_requirements
        )
        
        jobs.append(job)
    
    return jobs


def fetch_equipment_requirements(ymm_id: int, service_ids: List[int]) -> List[str]:
    """
    Fetches the required equipment models for a given vehicle YMM ID and list of service IDs.
    Queries the relevant specialized equipment requirement tables.
    """
    if not service_ids or not ymm_id:
        return []
    
    # First get the service categories for these service IDs
    service_cats = mcp_supabase_query(f"""
        SELECT DISTINCT service_category
        FROM services
        WHERE id IN ({','.join(str(id) for id in service_ids)})
    """)
    
    if not service_cats:
        return []
    
    # Build a UNION query for each relevant equipment requirements table
    queries = []
    for cat in service_cats:
        category = cat['service_category']
        table_name = f"{category}_equipment_requirements"
        queries.append(f"""
            SELECT equipment_model
            FROM {table_name}
            WHERE ymm_id = {ymm_id}
            AND service_id IN ({','.join(str(id) for id in service_ids)})
        """)
    
    if not queries:
        return []
    
    # Execute the combined query
    result = mcp_supabase_query(" UNION ".join(queries))
    
    # Return unique equipment models
    return list(set(row['equipment_model'] for row in (result or [])))

def update_job_assignment(job_id: int, technician_id: Optional[int], status: JobStatus) -> bool:
    """Updates the assigned technician and status for a job."""
    try:
        mcp_supabase_query("""
            UPDATE jobs
            SET assigned_technician_id = %s,
                status = %s
            WHERE id = %s
        """, [technician_id, status.value, job_id])
        return True
    except Exception as e:
        print(f"Error updating job assignment: {e}")
        return False

def update_job_etas(job_etas: Dict[int, Optional[datetime]]) -> bool:
    """Updates the estimated schedule time (ETA) for multiple jobs."""
    if not job_etas:
        return True
    
    try:
        # Build a VALUES clause for multiple rows
        values = []
        params = []
        for job_id, eta in job_etas.items():
            values.append(f"(%s, %s)")
            params.extend([job_id, eta])
        
        # Use a temporary table approach for the update
        mcp_supabase_query(f"""
            WITH updates(job_id, new_eta) AS (
                VALUES {','.join(values)}
            )
            UPDATE jobs
            SET estimated_sched = u.new_eta
            FROM updates u
            WHERE jobs.id = u.job_id::integer
        """, params)
        return True
    except Exception as e:
        print(f"Error updating job ETAs: {e}")
        return False 