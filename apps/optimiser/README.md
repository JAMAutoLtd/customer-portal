# Optimize Service

See the [Technical Reference](../../docs/reference/technical-reference.md#2-package-documentation-python-optimization-microservice-appsoptimiser) for a detailed overview.

## Running Locally

Refer to the [Development Guide](../../docs/guides/DEVELOPMENT.md#common-development-workflows) for instructions on running this service (e.g., using `pnpm run dev:optimiser`).

## Testing

Unit tests are implemented using `pytest`. Refer to the [Testing Guide](../../docs/guides/TESTING.md#unit-tests) for instructions on running these tests (specifically the Optimiser section).

**Test Coverage Includes:**

*   **Helper Functions**: Correct conversion between ISO 8601 time strings and seconds (`iso_to_seconds`, `seconds_to_iso`).
*   **Basic Cases**: 
    *   Handling requests with no items to schedule.
    *   Handling requests with no technicians available.
*   **Successful Scheduling**:
    *   Simple routes with a single stop.
    *   Routes involving travel between multiple stops (2 and 3+ stops tested).
    *   Correct assignment when multiple technicians are available but one is time-constrained.
*   **Constraints**:
    *   Applying fixed time constraints for specific items.
*   **Unassigned Items**:
    *   Items unassigned due to tight technician time windows.
    *   Items unassigned because no eligible technician is available.
    *   Items unassigned due to missing entries in the travel time matrix.
*   **Priority**: Verifying that higher-priority items are scheduled when time/resources are limited.
*   **Route Calculation**:
    *   Correct calculation of arrival, start, and end times for each stop.
    *   Correct calculation of `totalTravelTimeSeconds`, including the final leg from the last stop to the technician's designated `endLocationIndex`.
