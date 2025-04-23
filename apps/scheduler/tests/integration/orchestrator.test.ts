// tests/integration/orchestrator.test.ts
import { runFullReplan } from '../../src/scheduler/orchestrator';
import { SupabaseClient } from '@supabase/supabase-js';
import { Job, Technician, JobStatus, Address, Service, Van, SchedulableItem } from '../../src/types/database.types';
import { OptimizationResponsePayload } from '../../src/types/optimization.types';
import { JobUpdateOperation } from '../../src/db/update';

// Mock all dependencies
jest.mock('../../src/supabase/technicians');
jest.mock('../../src/supabase/jobs');
jest.mock('../../src/scheduler/availability');
jest.mock('../../src/scheduler/bundling');
jest.mock('../../src/scheduler/eligibility');
jest.mock('../../src/scheduler/payload');
jest.mock('../../src/scheduler/optimize');
jest.mock('../../src/scheduler/results');
jest.mock('../../src/db/update');

// Import mocked functions
import { getActiveTechnicians } from '../../src/supabase/technicians';
import { getRelevantJobs, getJobsByStatus } from '../../src/supabase/jobs';
import { calculateTechnicianAvailability, calculateAvailabilityForDay } from '../../src/scheduler/availability';
import { bundleQueuedJobs } from '../../src/scheduler/bundling';
import { determineTechnicianEligibility } from '../../src/scheduler/eligibility';
import { prepareOptimizationPayload } from '../../src/scheduler/payload';
import { callOptimizationService } from '../../src/scheduler/optimize';
import { processOptimizationResults, ScheduledJobUpdate } from '../../src/scheduler/results';
import { updateJobs } from '../../src/db/update';

describe('Full Replan Integration Tests', () => {
  // Test data
  const mockAddress: Address = {
    id: 1,
    street_address: '123 Test St',
    lat: 40.0,
    lng: -75.0
  };

  const mockHomeAddress: Address = {
    id: 2,
    street_address: '456 Home St',
    lat: 40.1,
    lng: -75.1
  };

  const mockService: Service = {
    id: 1,
    service_name: 'Test Service',
    service_category: 'prog'
  };

  const mockVan: Van = {
    id: 1,
    vin: 'TEST123',
    lat: 40.0,
    lng: -75.0,
    last_service: '2023-01-01T00:00:00Z',
    next_service: '2023-07-01T00:00:00Z'
  };

  const mockTechnicians: Technician[] = [
    {
      id: 1,
      user_id: 'tech1',
      assigned_van_id: 1,
      workload: 0,
      user: {
        id: 'tech1',
        full_name: 'Tech One',
        phone: '1234567890',
        home_address_id: 2,
        is_admin: false,
        customer_type: 'residential'
      },
      van: mockVan,
      current_location: { lat: 40.0, lng: -75.0 },
      home_location: { lat: 40.1, lng: -75.1 },
      earliest_availability: '2023-06-01T09:00:00Z'
    },
    {
      id: 2,
      user_id: 'tech2',
      assigned_van_id: 2,
      workload: 0,
      user: {
        id: 'tech2',
        full_name: 'Tech Two',
        phone: '0987654321',
        home_address_id: 3,
        is_admin: false,
        customer_type: 'residential'
      },
      van: { ...mockVan, id: 2 },
      current_location: { lat: 40.2, lng: -75.2 },
      home_location: { lat: 40.3, lng: -75.3 },
      earliest_availability: '2023-06-01T09:00:00Z'
    }
  ];

  // Jobs for testing
  const mockQueuedJobs: Job[] = [
    {
      id: 101,
      order_id: 1001,
      assigned_technician: null,
      address_id: 1,
      priority: 1,
      status: 'queued',
      requested_time: null,
      estimated_sched: null,
      job_duration: 60,
      notes: 'Job 1',
      technician_notes: null,
      service_id: 1,
      fixed_assignment: false,
      fixed_schedule_time: null,
      address: mockAddress,
      service: mockService
    },
    {
      id: 102,
      order_id: 1001,
      assigned_technician: null,
      address_id: 1,
      priority: 2,
      status: 'queued',
      requested_time: null,
      estimated_sched: null,
      job_duration: 45,
      notes: 'Job 2 (same order as Job 1)',
      technician_notes: null,
      service_id: 1,
      fixed_assignment: false,
      fixed_schedule_time: null,
      address: mockAddress,
      service: mockService
    },
    {
      id: 103,
      order_id: 1002,
      assigned_technician: null,
      address_id: 1,
      priority: 3,
      status: 'queued',
      requested_time: null,
      estimated_sched: null,
      job_duration: 90,
      notes: 'Job 3 (separate order)',
      technician_notes: null,
      service_id: 1,
      fixed_assignment: false,
      fixed_schedule_time: null,
      address: mockAddress,
      service: mockService
    }
  ];

  const mockLockedJobs: Job[] = [
    {
      id: 104,
      order_id: 1003,
      assigned_technician: 1,
      address_id: 1,
      priority: 1,
      status: 'in_progress',
      requested_time: null,
      estimated_sched: '2023-06-01T10:00:00Z',
      job_duration: 60,
      notes: 'Locked Job',
      technician_notes: null,
      service_id: 1,
      fixed_assignment: true,
      fixed_schedule_time: null,
      address: mockAddress,
      service: mockService
    }
  ];

  const mockFixedTimeJobs: Job[] = [
    {
      id: 105,
      order_id: 1004,
      assigned_technician: 2,
      address_id: 1,
      priority: 1,
      status: 'fixed_time',
      requested_time: null,
      estimated_sched: null,
      job_duration: 60,
      notes: 'Fixed Time Job',
      technician_notes: null,
      service_id: 1,
      fixed_assignment: true,
      fixed_schedule_time: '2023-06-01T14:00:00Z',
      address: mockAddress,
      service: mockService
    }
  ];

  const allJobs = [...mockQueuedJobs, ...mockLockedJobs, ...mockFixedTimeJobs];

  // Mock Supabase client
  const mockSupabase = {} as SupabaseClient<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks for data fetching
    (getActiveTechnicians as jest.Mock).mockResolvedValue(mockTechnicians);
    (getRelevantJobs as jest.Mock).mockResolvedValue(allJobs);
    (getJobsByStatus as jest.Mock).mockImplementation((statuses: JobStatus[]) => {
      return Promise.resolve(allJobs.filter(job => statuses.includes(job.status)));
    });

    // Setup mock for bundling
    (bundleQueuedJobs as jest.Mock).mockImplementation((jobs) => {
      // Bundle jobs with the same order_id
      const jobMap = new Map<number, Job[]>();
      jobs.forEach((job: Job) => {
        if (!jobMap.has(job.order_id)) {
          jobMap.set(job.order_id, []);
        }
        jobMap.get(job.order_id)?.push(job);
      });

      const result: SchedulableItem[] = [];
      jobMap.forEach((jobs, orderId) => {
        if (jobs.length > 1) {
          // Create bundle
          result.push({
            order_id: orderId,
            jobs: jobs,
            total_duration: jobs.reduce((sum, job) => sum + job.job_duration, 0),
            priority: Math.max(...jobs.map(job => job.priority)),
            address_id: jobs[0].address_id,
            address: jobs[0].address,
            required_equipment_models: [],
            eligible_technician_ids: []
          });
        } else if (jobs.length === 1) {
          // Single job
          result.push({
            is_bundle: false,
            job: jobs[0],
            priority: jobs[0].priority,
            duration: jobs[0].job_duration,
            address_id: jobs[0].address_id,
            address: jobs[0].address,
            required_equipment_models: [],
            eligible_technician_ids: []
          });
        }
      });
      return result;
    });

    // Setup mock for eligibility
    (determineTechnicianEligibility as jest.Mock).mockImplementation((items, techs) => {
      // Set all technicians as eligible for all items for simplicity
      return Promise.resolve(
        items.map((item: SchedulableItem) => ({
          ...item,
          eligible_technician_ids: techs.map((t: Technician) => t.id)
        }))
      );
    });

    // Setup mock for prepareOptimizationPayload
    (prepareOptimizationPayload as jest.Mock).mockImplementation((technicians: Technician[], items: SchedulableItem[], fixedTimeJobs: Job[]) => {
      // Create a properly structured payload with items array
      return Promise.resolve({
        locations: [],
        technicians: technicians.map((tech: Technician) => ({
          id: tech.id,
          startLocationIndex: 0,
          endLocationIndex: 0,
          earliestStartTimeISO: tech.earliest_availability || '2023-06-01T09:00:00Z',
          latestEndTimeISO: '2023-06-01T18:30:00Z'
        })),
        items: items.map((item: SchedulableItem, index: number) => {
          const itemId = 'job' in item ? `job_${item.job.id}` : `bundle_${item.order_id}`;
          return {
            id: itemId,
            locationIndex: index + 1, // +1 to skip depot at index 0
            durationSeconds: ('duration' in item ? item.duration : item.total_duration) * 60,
            priority: item.priority,
            eligibleTechnicianIds: item.eligible_technician_ids || []
          };
        }),
        fixedConstraints: fixedTimeJobs.map((job: Job) => ({
          itemId: `job_${job.id}`,
          fixedTimeISO: job.fixed_schedule_time || '2023-06-01T14:00:00Z'
        })),
        travelTimeMatrix: { '0': { '0': 0 } } // Minimal example
      });
    });

    // Setup mocks for optimization calls
    (callOptimizationService as jest.Mock).mockImplementation(() => {
      // Default implementation for successful optimization
      return Promise.resolve({
        status: 'success',
        routes: [],
        unassignedItemIds: []
      });
    });

    // Setup mock for result processing
    (processOptimizationResults as jest.Mock).mockImplementation(() => {
      // Default implementation
      return {
        scheduledJobs: [],
        unassignedItemIds: []
      };
    });

    // Setup mock for DB update
    (updateJobs as jest.Mock).mockResolvedValue(undefined);
  });

  it('should successfully schedule all jobs on the current day (happy path)', async () => {
    // Arrange - setup optimization results for first pass (today)
    const todayScheduledJobs: ScheduledJobUpdate[] = [
      { jobId: 101, technicianId: 1, estimatedSchedISO: '2023-06-01T11:00:00Z' },
      { jobId: 102, technicianId: 1, estimatedSchedISO: '2023-06-01T12:00:00Z' },
      { jobId: 103, technicianId: 2, estimatedSchedISO: '2023-06-01T11:00:00Z' }
    ];

    // Configure the processOptimizationResults mock for this test
    (processOptimizationResults as jest.Mock).mockReturnValue({
      scheduledJobs: todayScheduledJobs,
      unassignedItemIds: []
    });

    // Set up mock for optimization service to return a successful response
    (callOptimizationService as jest.Mock).mockResolvedValue({
      status: 'success',
      routes: [
        { technicianId: 1, itemSequence: ['job_101', 'job_102'] },
        { technicianId: 2, itemSequence: ['job_103'] }
      ],
      unassignedItemIds: []
    });

    // Act
    await runFullReplan(mockSupabase);

    // Assert
    expect(getActiveTechnicians).toHaveBeenCalledTimes(1);
    expect(getRelevantJobs).toHaveBeenCalledTimes(1);
    expect(calculateTechnicianAvailability).toHaveBeenCalledTimes(1);
    expect(bundleQueuedJobs).toHaveBeenCalledTimes(1);
    expect(determineTechnicianEligibility).toHaveBeenCalledTimes(1);
    expect(prepareOptimizationPayload).toHaveBeenCalledTimes(1);
    expect(callOptimizationService).toHaveBeenCalledTimes(1);
    
    // Verify updateJobs was called once with the correct operations
    expect(updateJobs).toHaveBeenCalledTimes(1);
    const updateOperations = (updateJobs as jest.Mock).mock.calls[0][1] as JobUpdateOperation[];
    
    // Should include all three jobs
    expect(updateOperations).toHaveLength(3);
    
    // Verify job statuses are set correctly
    const updates = new Map(updateOperations.map(op => [op.jobId, op.data]));
    expect(updates.get(101)?.status).toBe('queued');
    expect(updates.get(102)?.status).toBe('queued');
    expect(updates.get(103)?.status).toBe('queued');
    
    // Verify technician assignments
    expect(updates.get(101)?.assigned_technician).toBe(1);
    expect(updates.get(102)?.assigned_technician).toBe(1);
    expect(updates.get(103)?.assigned_technician).toBe(2);
    
    // Verify scheduled times
    expect(updates.get(101)?.estimated_sched).toBe('2023-06-01T11:00:00Z');
    expect(updates.get(102)?.estimated_sched).toBe('2023-06-01T12:00:00Z');
    expect(updates.get(103)?.estimated_sched).toBe('2023-06-01T11:00:00Z');
  });

  it('should handle some jobs overflowing to the next day', async () => {
    // Arrange - setup optimization results for first pass (today)
    // Only jobs 101 and 102 get scheduled today, 103 is unassigned
    const todayScheduledJobs: ScheduledJobUpdate[] = [
      { jobId: 101, technicianId: 1, estimatedSchedISO: '2023-06-01T11:00:00Z' },
      { jobId: 102, technicianId: 1, estimatedSchedISO: '2023-06-01T12:00:00Z' }
    ];

    const firstCallResponse = {
      scheduledJobs: todayScheduledJobs,
      unassignedItemIds: ['job_103'] // Job 103 unassigned today
    };

    // Setup optimization results for second pass (tomorrow)
    const tomorrowScheduledJobs: ScheduledJobUpdate[] = [
      { jobId: 103, technicianId: 2, estimatedSchedISO: '2023-06-02T09:30:00Z' }
    ];

    const secondCallResponse = {
      scheduledJobs: tomorrowScheduledJobs,
      unassignedItemIds: []
    };

    // Configure the optimization results mock for each pass
    (processOptimizationResults as jest.Mock)
      .mockReturnValueOnce(firstCallResponse)
      .mockReturnValueOnce(secondCallResponse);

    // Configure the optimization service responses
    (callOptimizationService as jest.Mock)
      .mockResolvedValueOnce({
        status: 'success',
        routes: [
          { technicianId: 1, itemSequence: ['job_101', 'job_102'] }
        ],
        unassignedItemIds: ['job_103']
      })
      .mockResolvedValueOnce({
        status: 'success',
        routes: [
          { technicianId: 2, itemSequence: ['job_103'] }
        ],
        unassignedItemIds: []
      });

    // Mock availability for next day
    (calculateAvailabilityForDay as jest.Mock).mockReturnValue([
      {
        technicianId: 1,
        availabilityStartTimeISO: '2023-06-02T09:00:00Z',
        availabilityEndTimeISO: '2023-06-02T18:30:00Z',
        startLocation: mockTechnicians[0].home_location
      },
      {
        technicianId: 2,
        availabilityStartTimeISO: '2023-06-02T09:00:00Z',
        availabilityEndTimeISO: '2023-06-02T18:30:00Z',
        startLocation: mockTechnicians[1].home_location
      }
    ]);

    // Act
    await runFullReplan(mockSupabase);

    // Assert
    expect(getActiveTechnicians).toHaveBeenCalledTimes(2); // Once for today, once for tomorrow
    expect(calculateAvailabilityForDay).toHaveBeenCalledTimes(1);
    expect(callOptimizationService).toHaveBeenCalledTimes(2);
    
    // Verify updateJobs was called once with all jobs included
    expect(updateJobs).toHaveBeenCalledTimes(1);
    const updateOperations = (updateJobs as jest.Mock).mock.calls[0][1] as JobUpdateOperation[];
    
    // Should include all three jobs
    expect(updateOperations).toHaveLength(3);
    
    // Verify job statuses and assignments
    const updates = new Map(updateOperations.map(op => [op.jobId, op.data]));
    
    // Check jobs from today's scheduling
    expect(updates.get(101)?.status).toBe('queued');
    expect(updates.get(101)?.assigned_technician).toBe(1);
    expect(updates.get(101)?.estimated_sched).toBe('2023-06-01T11:00:00Z');
    
    expect(updates.get(102)?.status).toBe('queued');
    expect(updates.get(102)?.assigned_technician).toBe(1);
    expect(updates.get(102)?.estimated_sched).toBe('2023-06-01T12:00:00Z');
    
    // Check job scheduled for tomorrow
    expect(updates.get(103)?.status).toBe('queued');
    expect(updates.get(103)?.assigned_technician).toBe(2);
    expect(updates.get(103)?.estimated_sched).toBe('2023-06-02T09:30:00Z');
  });

  it('should mark jobs as pending_review when they cannot be scheduled after max attempts', async () => {
    // Arrange - all jobs unassigned in all passes
    // Configure optimization results to always return unassigned jobs
    (processOptimizationResults as jest.Mock).mockReturnValue({
      scheduledJobs: [],
      unassignedItemIds: ['job_101', 'job_102', 'job_103']
    });
    
    // Configure optimization service to always return all jobs as unassigned
    (callOptimizationService as jest.Mock).mockResolvedValue({
      status: 'success',
      routes: [],
      unassignedItemIds: ['job_101', 'job_102', 'job_103']
    });

    // Mock availability for future days
    (calculateAvailabilityForDay as jest.Mock).mockReturnValue([
      {
        technicianId: 1,
        availabilityStartTimeISO: '2023-06-02T09:00:00Z',
        availabilityEndTimeISO: '2023-06-02T18:30:00Z',
        startLocation: mockTechnicians[0].home_location
      },
      {
        technicianId: 2,
        availabilityStartTimeISO: '2023-06-02T09:00:00Z',
        availabilityEndTimeISO: '2023-06-02T18:30:00Z',
        startLocation: mockTechnicians[1].home_location
      }
    ]);

    // Act
    await runFullReplan(mockSupabase);

    // Assert
    // Verify multiple optimization attempts
    expect(callOptimizationService).toHaveBeenCalledTimes(5); // Initial + MAX_OVERFLOW_ATTEMPTS (4)
    
    // Verify updateJobs was called once with all jobs marked as pending_review
    expect(updateJobs).toHaveBeenCalledTimes(1);
    const updateOperations = (updateJobs as jest.Mock).mock.calls[0][1] as JobUpdateOperation[];
    
    // Should include all three jobs
    expect(updateOperations).toHaveLength(3);
    
    // Verify all jobs are marked as pending_review
    const updates = new Map(updateOperations.map(op => [op.jobId, op.data]));
    expect(updates.get(101)?.status).toBe('pending_review');
    expect(updates.get(101)?.assigned_technician).toBeNull();
    expect(updates.get(101)?.estimated_sched).toBeNull();
    
    expect(updates.get(102)?.status).toBe('pending_review');
    expect(updates.get(102)?.assigned_technician).toBeNull();
    expect(updates.get(102)?.estimated_sched).toBeNull();
    
    expect(updates.get(103)?.status).toBe('pending_review');
    expect(updates.get(103)?.assigned_technician).toBeNull();
    expect(updates.get(103)?.estimated_sched).toBeNull();
  });

  it('should skip weekend days during overflow scheduling', async () => {
    // Mock today as Friday - Using Jest fake timers to avoid TypeScript errors
    const fridayDate = new Date('2023-06-02T12:00:00Z'); // Friday
    jest.useFakeTimers();
    jest.setSystemTime(fridayDate);
    
    // First pass: Job 101 scheduled, others unassigned
    const fridayScheduledJobs: ScheduledJobUpdate[] = [
      { jobId: 101, technicianId: 1, estimatedSchedISO: '2023-06-02T14:00:00Z' }
    ];

    const firstCallResponse = {
      scheduledJobs: fridayScheduledJobs,
      unassignedItemIds: ['job_102', 'job_103']
    };

    // Configure first pass optimization results
    (processOptimizationResults as jest.Mock)
      .mockReturnValueOnce(firstCallResponse)
      .mockReturnValueOnce({
        scheduledJobs: [
          { jobId: 102, technicianId: 1, estimatedSchedISO: '2023-06-05T09:30:00Z' },
          { jobId: 103, technicianId: 2, estimatedSchedISO: '2023-06-05T10:00:00Z' }
        ],
        unassignedItemIds: []
      });

    // Configure optimization service responses
    (callOptimizationService as jest.Mock)
      .mockResolvedValueOnce({
        status: 'success',
        routes: [
          { technicianId: 1, itemSequence: ['job_101'] }
        ],
        unassignedItemIds: ['job_102', 'job_103']
      })
      .mockResolvedValueOnce({
        status: 'success',
        routes: [
          { technicianId: 1, itemSequence: ['job_102'] },
          { technicianId: 2, itemSequence: ['job_103'] }
        ],
        unassignedItemIds: []
      });

    // Weekend days: Return empty array (no availability)
    (calculateAvailabilityForDay as jest.Mock)
      .mockReturnValueOnce([]) // Saturday
      .mockReturnValueOnce([]) // Sunday
      .mockReturnValueOnce([   // Monday
        {
          technicianId: 1,
          availabilityStartTimeISO: '2023-06-05T09:00:00Z',
          availabilityEndTimeISO: '2023-06-05T18:30:00Z',
          startLocation: mockTechnicians[0].home_location
        },
        {
          technicianId: 2,
          availabilityStartTimeISO: '2023-06-05T09:00:00Z',
          availabilityEndTimeISO: '2023-06-05T18:30:00Z',
          startLocation: mockTechnicians[1].home_location
        }
      ]);

    // Act
    await runFullReplan(mockSupabase);

    // Assert
    // Verify we skipped the weekend
    expect(calculateAvailabilityForDay).toHaveBeenCalledTimes(3); // Sat, Sun, Mon
    expect(callOptimizationService).toHaveBeenCalledTimes(2); // Friday and Monday only

    // Verify updateJobs was called once with the correct job assignments
    expect(updateJobs).toHaveBeenCalledTimes(1);
    const updateOperations = (updateJobs as jest.Mock).mock.calls[0][1] as JobUpdateOperation[];
    
    // Should include all three jobs
    expect(updateOperations).toHaveLength(3);
    
    // Friday job
    const updates = new Map(updateOperations.map(op => [op.jobId, op.data]));
    expect(updates.get(101)?.status).toBe('queued');
    expect(updates.get(101)?.estimated_sched).toBe('2023-06-02T14:00:00Z');
    
    // Monday jobs (skipped weekend)
    expect(updates.get(102)?.status).toBe('queued');
    expect(updates.get(102)?.estimated_sched).toBe('2023-06-05T09:30:00Z');
    
    expect(updates.get(103)?.status).toBe('queued');
    expect(updates.get(103)?.estimated_sched).toBe('2023-06-05T10:00:00Z');

    // Clean up Date mock
    jest.useRealTimers();
  });

  it('should handle no technicians available gracefully', async () => {
    // Arrange - no technicians available
    (getActiveTechnicians as jest.Mock).mockResolvedValue([]);

    // Act
    await runFullReplan(mockSupabase);

    // Assert
    expect(calculateTechnicianAvailability).not.toHaveBeenCalled();
    expect(bundleQueuedJobs).not.toHaveBeenCalled();
    expect(callOptimizationService).not.toHaveBeenCalled();
    expect(updateJobs).not.toHaveBeenCalled();
  });

  it('should handle optimization service errors gracefully', async () => {
    // Arrange - optimization service fails
    (callOptimizationService as jest.Mock).mockRejectedValue(new Error('Optimization service error'));

    // Act & Assert
    await expect(runFullReplan(mockSupabase)).rejects.toThrow('Optimization service error');
    expect(updateJobs).not.toHaveBeenCalled(); // No DB updates on error
  });
});