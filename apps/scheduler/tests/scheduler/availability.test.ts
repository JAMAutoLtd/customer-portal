import { 
    applyLockedJobsToWindows, 
    formatDateToString,
    DailyAvailabilityWindows
} from '../../src/scheduler/availability';
import { Technician, Job } from '../../src/types/database.types';

describe('applyLockedJobsToWindows', () => {
    let mockTechnician: Technician;
    let baseWindows: DailyAvailabilityWindows;
    let targetDate: Date;
    let currentTimeUTC: Date;

    beforeEach(() => {
        // Set up a consistent test date (a Monday)
        targetDate = new Date('2024-01-15T00:00:00Z');
        currentTimeUTC = new Date('2024-01-15T14:30:00Z'); // 2:30 PM UTC

        // Mock technician with default hours
        mockTechnician = {
            id: 1,
            user_id: 'test-user-id',
            assigned_van_id: 1,
            workload: 0,
            current_location: { lat: 40, lng: -74 },
            home_location: { lat: 40, lng: -74 },
            defaultHours: [
                {
                    id: 1,
                    technician_id: 1,
                    day_of_week: 1, // Monday
                    start_time: '09:00:00',
                    end_time: '18:00:00',
                    is_available: true,
                    created_at: '2024-01-15T00:00:00Z',
                    updated_at: '2024-01-15T00:00:00Z'
                }
            ],
            availabilityExceptions: []
        };

        // Calculate base windows for the test date
        baseWindows = new Map();
        const dateStr = formatDateToString(targetDate);
        baseWindows.set(dateStr, [
            {
                start: new Date('2024-01-15T09:00:00Z'),
                end: new Date('2024-01-15T18:00:00Z')
            }
        ]);
    });

    describe('tighter timing for ongoing jobs', () => {
        it('should apply tighter timing for in_progress job when current time is during the job', () => {
            const inProgressJob: Job = {
                id: 100,
                order_id: 1,
                assigned_technician: 1,
                address_id: 1,
                address: { id: 1, street_address: '123 Main St', lat: 40, lng: -74 },
                priority: 1,
                status: 'in_progress',
                requested_time: null,
                estimated_sched: '2024-01-15T13:00:00Z', // Started at 1 PM
                job_duration: 120, // 2 hour job (ends at 3 PM)
                notes: null,
                service_id: 1,
                fixed_assignment: false,
                fixed_schedule_time: null,
                technician_notes: null
            };

            const result = applyLockedJobsToWindows(
                new Map(baseWindows), // Create a copy
                [inProgressJob],
                mockTechnician.id,
                targetDate,
                currentTimeUTC // Current time is 2:30 PM
            );

            const windows = result.get(formatDateToString(targetDate));
            expect(windows).toBeDefined();
            expect(windows!.length).toBe(2);

            // First window: 9 AM to 2:30 PM (current time)
            expect(windows![0].start.toISOString()).toBe('2024-01-15T09:00:00.000Z');
            expect(windows![0].end.toISOString()).toBe('2024-01-15T14:30:00.000Z');

            // Second window: 3:00 PM (30 mins after current time) to 6 PM
            expect(windows![1].start.toISOString()).toBe('2024-01-15T15:00:00.000Z');
            expect(windows![1].end.toISOString()).toBe('2024-01-15T18:00:00.000Z');
        });

        it('should use original times for jobs that haven\'t started yet', () => {
            const futureJob: Job = {
                id: 101,
                order_id: 1,
                assigned_technician: 1,
                address_id: 1,
                address: { id: 1, street_address: '123 Main St', lat: 40, lng: -74 },
                priority: 1,
                status: 'en_route',
                requested_time: null,
                estimated_sched: '2024-01-15T16:00:00Z', // Starts at 4 PM (after current time)
                job_duration: 60, // 1 hour job
                notes: null,
                service_id: 1,
                fixed_assignment: false,
                fixed_schedule_time: null,
                technician_notes: null
            };

            const result = applyLockedJobsToWindows(
                new Map(baseWindows),
                [futureJob],
                mockTechnician.id,
                targetDate,
                currentTimeUTC
            );

            const windows = result.get(formatDateToString(targetDate));
            expect(windows).toBeDefined();
            expect(windows!.length).toBe(2);

            // First window: 9 AM to 4 PM (job start)
            expect(windows![0].start.toISOString()).toBe('2024-01-15T09:00:00.000Z');
            expect(windows![0].end.toISOString()).toBe('2024-01-15T16:00:00.000Z');

            // Second window: 5 PM (job end) to 6 PM
            expect(windows![1].start.toISOString()).toBe('2024-01-15T17:00:00.000Z');
            expect(windows![1].end.toISOString()).toBe('2024-01-15T18:00:00.000Z');
        });

        it('should not block any time for jobs that should have already finished', () => {
            const pastJob: Job = {
                id: 102,
                order_id: 1,
                assigned_technician: 1,
                address_id: 1,
                address: { id: 1, street_address: '123 Main St', lat: 40, lng: -74 },
                priority: 1,
                status: 'in_progress',
                requested_time: null,
                estimated_sched: '2024-01-15T10:00:00Z', // Started at 10 AM
                job_duration: 120, // 2 hour job (should have ended at 12 PM)
                notes: null,
                service_id: 1,
                fixed_assignment: false,
                fixed_schedule_time: null,
                technician_notes: null
            };

            const result = applyLockedJobsToWindows(
                new Map(baseWindows),
                [pastJob],
                mockTechnician.id,
                targetDate,
                currentTimeUTC // Current time is 2:30 PM, job should have finished at 12 PM
            );

            const windows = result.get(formatDateToString(targetDate));
            expect(windows).toBeDefined();
            expect(windows!.length).toBe(1);

            // Full window remains: 9 AM to 6 PM
            expect(windows![0].start.toISOString()).toBe('2024-01-15T09:00:00.000Z');
            expect(windows![0].end.toISOString()).toBe('2024-01-15T18:00:00.000Z');
        });

        it('should not apply tighter timing for future dates', () => {
            const futureDate = new Date('2024-01-16T00:00:00Z'); // Tuesday
            const futureDateStr = formatDateToString(futureDate);
            
            // Set up windows for future date
            const futureWindows = new Map();
            futureWindows.set(futureDateStr, [
                {
                    start: new Date('2024-01-16T09:00:00Z'),
                    end: new Date('2024-01-16T18:00:00Z')
                }
            ]);

            const futureJob: Job = {
                id: 103,
                order_id: 1,
                assigned_technician: 1,
                address_id: 1,
                address: { id: 1, street_address: '123 Main St', lat: 40, lng: -74 },
                priority: 1,
                status: 'in_progress',
                requested_time: null,
                estimated_sched: '2024-01-16T13:00:00Z', // 1 PM tomorrow
                job_duration: 120, // 2 hour job
                notes: null,
                service_id: 1,
                fixed_assignment: false,
                fixed_schedule_time: null,
                technician_notes: null
            };

            const result = applyLockedJobsToWindows(
                futureWindows,
                [futureJob],
                mockTechnician.id,
                futureDate,
                currentTimeUTC // Current time is still Jan 15
            );

            const windows = result.get(futureDateStr);
            expect(windows).toBeDefined();
            expect(windows!.length).toBe(2);

            // Should use original times, not tighter timing
            // First window: 9 AM to 1 PM (job start)
            expect(windows![0].start.toISOString()).toBe('2024-01-16T09:00:00.000Z');
            expect(windows![0].end.toISOString()).toBe('2024-01-16T13:00:00.000Z');

            // Second window: 3 PM (job end) to 6 PM
            expect(windows![1].start.toISOString()).toBe('2024-01-16T15:00:00.000Z');
            expect(windows![1].end.toISOString()).toBe('2024-01-16T18:00:00.000Z');
        });

        it('should always use scheduled time for fixed_time jobs', () => {
            const fixedJob: Job = {
                id: 104,
                order_id: 1,
                assigned_technician: 1,
                address_id: 1,
                address: { id: 1, street_address: '123 Main St', lat: 40, lng: -74 },
                priority: 1,
                status: 'fixed_time',
                requested_time: null,
                estimated_sched: null,
                job_duration: 60,
                notes: null,
                service_id: 1,
                fixed_assignment: true,
                fixed_schedule_time: '2024-01-15T14:00:00Z', // 2 PM
                technician_notes: null
            };

            const result = applyLockedJobsToWindows(
                new Map(baseWindows),
                [fixedJob],
                mockTechnician.id,
                targetDate,
                currentTimeUTC // Current time is 2:30 PM (during the fixed job)
            );

            const windows = result.get(formatDateToString(targetDate));
            expect(windows).toBeDefined();
            expect(windows!.length).toBe(2);

            // Should use fixed time, not tighter timing
            // First window: 9 AM to 2 PM (fixed job start)
            expect(windows![0].start.toISOString()).toBe('2024-01-15T09:00:00.000Z');
            expect(windows![0].end.toISOString()).toBe('2024-01-15T14:00:00.000Z');

            // Second window: 3 PM (fixed job end) to 6 PM
            expect(windows![1].start.toISOString()).toBe('2024-01-15T15:00:00.000Z');
            expect(windows![1].end.toISOString()).toBe('2024-01-15T18:00:00.000Z');
        });
    });

    describe('edge cases', () => {
        it('should handle jobs with zero remaining duration', () => {
            // Current time is exactly at job end time
            const exactEndTimeJob: Job = {
                id: 105,
                order_id: 1,
                assigned_technician: 1,
                address_id: 1,
                address: { id: 1, street_address: '123 Main St', lat: 40, lng: -74 },
                priority: 1,
                status: 'in_progress',
                requested_time: null,
                estimated_sched: '2024-01-15T13:30:00Z', // Started at 1:30 PM
                job_duration: 60, // 1 hour job (ends at 2:30 PM)
                notes: null,
                service_id: 1,
                fixed_assignment: false,
                fixed_schedule_time: null,
                technician_notes: null
            };

            const result = applyLockedJobsToWindows(
                new Map(baseWindows),
                [exactEndTimeJob],
                mockTechnician.id,
                targetDate,
                currentTimeUTC // Current time is exactly 2:30 PM
            );

            const windows = result.get(formatDateToString(targetDate));
            expect(windows).toBeDefined();
            
            // Since current time equals job end time, the job is considered finished
            // and doesn't block any time, so the full window remains
            expect(windows!.length).toBe(1);
            
            // Full window remains: 9 AM to 6 PM
            expect(windows![0].start.toISOString()).toBe('2024-01-15T09:00:00.000Z');
            expect(windows![0].end.toISOString()).toBe('2024-01-15T18:00:00.000Z');
        });

        it('should handle multiple overlapping jobs correctly', () => {
            const jobs: Job[] = [
                {
                    id: 106,
                    order_id: 1,
                    assigned_technician: 1,
                    address_id: 1,
                    address: { id: 1, street_address: '123 Main St', lat: 40, lng: -74 },
                    priority: 1,
                    status: 'in_progress',
                    requested_time: null,
                    estimated_sched: '2024-01-15T13:00:00Z',
                    job_duration: 120, // Ends at 3 PM
                    notes: null,
                    service_id: 1,
                    fixed_assignment: false,
                    fixed_schedule_time: null,
                    technician_notes: null
                },
                {
                    id: 107,
                    order_id: 2,
                    assigned_technician: 1,
                    address_id: 2,
                    address: { id: 2, street_address: '456 Oak St', lat: 40, lng: -74 },
                    priority: 1,
                    status: 'en_route',
                    requested_time: null,
                    estimated_sched: '2024-01-15T15:00:00Z',
                    job_duration: 60, // Ends at 4 PM
                    notes: null,
                    service_id: 1,
                    fixed_assignment: false,
                    fixed_schedule_time: null,
                    technician_notes: null
                }
            ];

            const result = applyLockedJobsToWindows(
                new Map(baseWindows),
                jobs,
                mockTechnician.id,
                targetDate,
                currentTimeUTC
            );

            const windows = result.get(formatDateToString(targetDate));
            expect(windows).toBeDefined();
            expect(windows!.length).toBe(2);

            // First window: 9 AM to 2:30 PM (current time)
            expect(windows![0].start.toISOString()).toBe('2024-01-15T09:00:00.000Z');
            expect(windows![0].end.toISOString()).toBe('2024-01-15T14:30:00.000Z');

            // Second window: 4 PM (after both jobs) to 6 PM
            expect(windows![1].start.toISOString()).toBe('2024-01-15T16:00:00.000Z');
            expect(windows![1].end.toISOString()).toBe('2024-01-15T18:00:00.000Z');
        });
    });
}); 