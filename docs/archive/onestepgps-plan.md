> **Note:** This document contains historical planning information for the One Step GPS integration and may not reflect the final implementation details. Refer to `docs/technical-reference.md` for documentation on the current implementation in `apps/scheduler/src/onestepgps/client.ts` and `apps/scheduler/src/scheduler/orchestrator.ts`.

# One Step GPS API Implementation Plan

Based on `specs/onestepgps-spec.md` and existing project structure.

**Goal:** Fetch current Latitude/Longitude for active technicians from the One Step GPS API before running the daily scheduling optimization pass in `runFullReplan`.

**Core Strategy:**

1.  Introduce a new service/module within `apps/scheduler/src/` dedicated to One Step GPS API interaction.
2.  Fetch technician data, joining their assigned `vans` data which includes the `onestepgps_device_id`.
3.  Call the One Step GPS API to get location data for *all* devices.
4.  Filter and map the API response using the `onestepgps_device_id` found on the *technician's assigned van* to update the `current_location` property of the `Technician` objects *before* they are used for availability calculation.
5.  Implement error handling and fallbacks if the API call fails.

---

**Implementation Plan:**

**Phase 1: Configuration & Setup (Revised)**

1.  **API Key Secret:**
    *   Add the One Step GPS API Key to the project's secret management solution (e.g., `.env` files).
    *   Define environment variable: `ONESTEP_GPS_API_KEY`.
    *   Update `.env.sample`, `.env.test`.
    *   *(User action required for actual key in `.env`)*.

2.  **Database Schema/Type Update:**
    *   **Action:** Add a new nullable field `onestepgps_device_id` (VARCHAR) to the `public.vans` table in `schema.sql`. (Ensure it's *not* in `public.technicians`).
    *   **Action:** Update the `Van` interface in `apps/scheduler/src/types/database.types.ts` to include the optional field: `onestepgps_device_id?: string | null;`. (Ensure it's *not* in `Technician`).
    *   **Action:** Update static seed data (`simulation/init-scripts/05-merged-custom-test-data.sql`) to include placeholder `onestepgps_device_id` values in the `vans` insert.

3.  **Update Technician Data Fetching:**
    *   **File:** `apps/scheduler/src/supabase/technicians.ts`
    *   **Action:** Modify the `select` statement within the `getActiveTechnicians` function to retrieve `onestepgps_device_id` from the `vans` join.
        ```typescript
        // Inside getActiveTechnicians select string:
        // ... select technicians fields ...
        vans ( 
          id, 
          // ... other van fields ...
          onestepgps_device_id // Select from vans
        )
        // ...
        ```
    *   **Action:** Ensure the mapping logic correctly places the joined `vans` object (which now contains the optional `onestepgps_device_id`) onto the `technician.van` property.

**Note on Validation:** Manual API test confirmed endpoint, auth, and response structure.

**Phase 2: Create One Step GPS Client Module**

1.  **Create Directory & File:**
    *   Create `apps/scheduler/src/onestepgps/`
    *   Create `apps/scheduler/src/onestepgps/client.ts`

2.  **Add Dependency:**
    *   Run `pnpm add axios --filter scheduler`.

3.  **Implement `client.ts`:**
    *   *(No changes needed here from previous version of plan)*
    *   Dependencies, Type Defs (`LatLngLiteral`, `OneStepGpsDevice`, `DeviceLocationMap`), API Key Handling, `fetchDeviceLocations` function implementation (using params `lat_lng=1`, `device=1`, `dt_tracker=1`, returning `DeviceLocationMap | null`).

    *   **Example Implementation Snippet (`client.ts`):** *(Remains the same as previous version)*
        ```typescript
        // ... axios import, apiKey, baseUrl ...
        interface LatLngLiteral { /* ... */ }
        interface OneStepGpsDevice { /* ... */ }
        export interface DeviceLocationMap { /* ... */ }

        export async function fetchDeviceLocations(): Promise<DeviceLocationMap | null> {
            // ... apiKey check ...
            const params = { /* lat_lng, device, dt_tracker */ };
            try {
                // ... axios.get with headers, timeout ...
                if (response.status === 200) {
                    // ... process response.data into DeviceLocationMap ...
                    return locationData;
                } else { /* ... */ return null; }
            } catch (error) {
                // ... error logging (429, network, setup) ...
                // Note: Retry logic out of scope.
                return null;
            }
        }
        ```

**Phase 3: Integrate into Orchestrator**

1.  **File:** `apps/scheduler/src/scheduler/orchestrator.ts`
2.  **Import:** Import `fetchDeviceLocations`, `DeviceLocationMap`.
3.  **Modify `runFullReplan`:**
    *   **Placement:** After `getActiveTechnicians`, before `calculateTechnicianAvailability`.
    *   **Logic:**
        *   Call `fetchDeviceLocations()`.
        *   If successful:
            *   Iterate `fetchedTechnicians`.
            *   Get the `deviceId` from `tech.van?.onestepgps_device_id`. (Note the change: checking the `van` object).
            *   If `deviceId` exists and is found in the `realTimeLocations` map:
                *   Update `tech.current_location`.
            *   Log warnings if `deviceId` exists but no location found.
        *   If fetch fails, log warning and proceed with DB locations.

    *   **Example Integration Snippet (`orchestrator.ts`):**
        ```typescript
        // ... Inside runFullReplan, after getting fetchedTechnicians ...

        // +++ START One Step GPS Integration +++
        log('Step 0.5: Fetching real-time technician locations from One Step GPS...');
        const realTimeLocations: DeviceLocationMap | null = await fetchDeviceLocations();

        if (realTimeLocations) {
            let updatedCount = 0;
            allTechnicians.forEach(tech => {
                // --- MODIFIED LOGIC: Check device ID on the van --- 
                const deviceId = tech.van?.onestepgps_device_id;
                // --- END MODIFIED LOGIC --- 

                if (deviceId && realTimeLocations[deviceId]) {
                    const locationInfo = realTimeLocations[deviceId];
                    tech.current_location = { lat: locationInfo.lat, lng: locationInfo.lng };
                    // Optional: Store timestamp
                    // tech.location_timestamp = locationInfo.timestamp; // Need to decide where to store this if needed
                    updatedCount++;
                } else if (tech.assigned_van_id && deviceId) { // Only warn if they HAVE a van and device ID, but no location
                    log(`WARN: No real-time location found for Tech ${tech.id} (Van: ${tech.assigned_van_id}, Device ID: ${deviceId}). Using last known DB location.`, /* colors.yellow */);
                } else if (tech.assigned_van_id && !deviceId) {
                    // Optional: Log if van exists but has no device ID configured
                    // log(`INFO: Tech ${tech.id} (Van: ${tech.assigned_van_id}) has no OneStepGPS device ID configured.`);
                }
                 // If no assigned van, naturally fall back to DB location (likely home)
            });
            log(`Successfully updated ${updatedCount} technician locations from One Step GPS.`, /* colors.green */);
        } else {
            log('WARN: Failed to fetch real-time locations from One Step GPS. Proceeding with last known locations from database.', /* colors.yellow */);
        }
        // +++ END One Step GPS Integration +++

        // ... rest of the existing logic ...
        ```

**Phase 4: Testing**

1.  **Unit Tests (`client.test.ts`):** *(No changes needed here)*
2.  **Integration Tests (`orchestrator.test.ts`):**
    *   Update mocks/assertions to reflect that the orchestrator now checks `tech.van?.onestepgps_device_id`.
3.  **E2E Tests:** *(No changes needed here, still complex)*

**Phase 5: Documentation**

1.  Update docs to mention `ONESTEP_GPS_API_KEY`.
2.  Update docs to state the requirement/assumption of `onestepgps_device_id` field on the `vans` table (not `technicians`).
3.  Briefly describe the updated location fetching process.

---

This revised plan associates the GPS device ID with the van, which is architecturally cleaner.

**Relevant Files (Revised):**

*   `apps/scheduler/src/onestepgps/client.ts` (New)
*   `apps/scheduler/src/scheduler/orchestrator.ts` (Modified - Logic Change)
*   `apps/scheduler/src/supabase/technicians.ts` (Modified - Select Change)
*   `apps/scheduler/src/types/database.types.ts` (Modified - Field Moved)
*   `schema.sql` (Modified - Field Moved)
*   `simulation/init-scripts/05-merged-custom-test-data.sql` (Modified - Values Moved)
*   `.env.sample` / `.env.test` / Deployment Config (Modified)
*   `apps/scheduler/tests/onestepgps/client.test.ts` (New)
*   `apps/scheduler/tests/scheduler/orchestrator.test.ts` (Modified - Assertion Change)
*   `docs/technical-reference.md` / `README.md` (Modified)
*   `specs/onestepgps-spec.md` (Reference)
        interface OneStepGpsDevice {
            device_id: string;
            display_name: string;
            lat?: number;
            lng?: number;
            dt_tracker?: string; // ISO 8601 timestamp (UTC)
            // Add other fields if needed (drive_status, etc.)
        }

        // Type for the function's successful return value (maps device ID to location data)
        export interface DeviceLocationMap {
            [deviceId: string]: {
                lat: number;
                lng: number;
                timestamp: string; // ISO 8601 timestamp
            }
        }
        ```
    *   **`fetchDeviceLocations` Function:**
        *   Define an async function `fetchDeviceLocations(): Promise<DeviceLocationMap | null>` (Note: Renamed type).
        *   Construct the API URL: `https://track.onestepgps.com/v3/api/public/device-info`.
        *   Define required query parameters: `lat_lng=1`, `device=1`, `dt_tracker=1`. (Confirmed necessary by manual test).
        *   Use `axios.get` to make the request.
        *   Add the `Authorization: Bearer ${apiKey}` header.
        *   Implement error handling:
            *   Catch generic network/axios errors.
            *   Check response status codes (e.g., 401, 403, 429, 5xx). Log specific errors.
            *   Return `null` if the request fails irrecoverably. **Note:** Retry logic (e.g., for 429/5xx) is out of scope for the initial implementation but can be added later.
        *   Parse the JSON response (an array of `OneStepGpsDevice`).
        *   Process the array:
            *   Filter out devices missing `lat`, `lng`, or `dt_tracker`.
            *   Create a `DeviceLocationMap` keyed by `device_id`.
        *   Return the processed map.

    *   **Example Implementation Snippet (`client.ts`):**
        ```typescript
        import axios, { AxiosError } from 'axios';

        const apiKey = process.env.ONESTEP_GPS_API_KEY;
        const baseUrl = 'https://track.onestepgps.com/v3/api/public/device-info';

        // Define LatLngLiteral interface here
        interface LatLngLiteral {
            lat: number;
            lng: number;
        }

        // (Define OneStepGpsDevice and DeviceLocationMap interfaces here - Ensure type name updated)
        interface OneStepGpsDevice {
            device_id: string;
            display_name: string;
            lat?: number;
            lng?: number;
            dt_tracker?: string; // ISO 8601 timestamp (UTC)
            // Add other fields if needed (drive_status, etc.)
        }

        export interface DeviceLocationMap {
            [deviceId: string]: {
                lat: number;
                lng: number;
                timestamp: string; // ISO 8601 timestamp
            }
        }

        export async function fetchDeviceLocations(): Promise<DeviceLocationMap | null> { // Renamed type
            if (!apiKey) {
                console.error('OneStepGPS Error: ONESTEP_GPS_API_KEY environment variable not set.');
                return null;
            }

            const params = {
                'lat_lng': 1,
                'device': 1,
                'dt_tracker': 1,
            };

            try {
                console.log('Fetching real-time locations from One Step GPS...');
                const response = await axios.get<OneStepGpsDevice[]>(baseUrl, {
                    params,
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Accept': 'application/json'
                    },
                    timeout: 15000 // 15 second timeout
                });

                if (response.status === 200) {
                    const locationData: DeviceLocationMap = {}; // Renamed type
                    let processedCount = 0;
                    response.data.forEach(device => {
                        if (device.device_id && device.lat != null && device.lng != null && device.dt_tracker) {
                             // Validate coordinates are numbers
                            if (typeof device.lat === 'number' && typeof device.lng === 'number') {
                                locationData[device.device_id] = {
                                    lat: device.lat,
                                    lng: device.lng,
                                    timestamp: device.dt_tracker
                                };
                                processedCount++;
                            } else {
                                console.warn(`OneStepGPS: Invalid lat/lng type for device ${device.device_id}. Skipping.`);
                            }
                        } else {
                           // Optional: Log devices skipped due to missing data
                           // console.warn(`OneStepGPS: Skipping device due to missing data: ${JSON.stringify(device)}`);
                        }
                    });
                    console.log(`OneStepGPS: Successfully processed ${processedCount} device locations.`);
                    return locationData;
                } else {
                    // Should be caught by AxiosError below, but as a fallback
                    console.error(`OneStepGPS Error: Received non-200 status code: ${response.status}`);
                    return null;
                }
            } catch (error) {
                const axiosError = error as AxiosError;
                if (axiosError.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx
                    console.error(`OneStepGPS API Error: Status ${axiosError.response.status}`, axiosError.response.data);
                     if (axiosError.response.status === 429) {
                        console.warn("OneStepGPS API rate limit likely exceeded.");
                        // Retry logic could be added here in the future
                    }
                } else if (axiosError.request) {
                    // The request was made but no response was received
                    console.error('OneStepGPS Network Error: No response received.', axiosError.message);
                } else {
                    // Something happened in setting up the request that triggered an Error
                    console.error('OneStepGPS Request Setup Error:', axiosError.message);
                }
                // Note: Retry logic is currently out of scope. Returning null on first error.
                return null;
            }
        }
        ```

**Phase 3: Integrate into Orchestrator**

1.  **File:** `apps/scheduler/src/scheduler/orchestrator.ts`
2.  **Import:** Import the `fetchDeviceLocations` function and the `DeviceLocationMap` type (Note: Renamed type).
3.  **Modify `runFullReplan`:**
    *   **Placement:** Insert the call *after* `getActiveTechnicians` resolves and *before* `calculateTechnicianAvailability` is called for the "Today" pass.
    *   **Logic:**
        *   Call `fetchDeviceLocations()`.
        *   If the call is successful (returns data):
            *   Iterate through the `fetchedTechnicians` array.
            *   For each technician, check if they have an `onestepgps_device_id`.
            *   If they do, look up that `device_id` in the `locationData` map returned by the API call.
            *   If found, update the `technician.current_location` property with the `lat` and `lng` from the API response. Log the update.
            *   Optionally, store the `timestamp` from the API response on the technician object if needed for staleness checks later (e.g., `tech.location_timestamp = locationData[deviceId].timestamp`).
        *   If the call fails (returns `null`):
            *   Log a prominent warning indicating that fallback locations (existing `current_location` from DB/van or `home_location`) will be used for today's plan.
            *   Do *not* modify the `technician.current_location` property. The rest of the process will use the locations previously fetched by `getActiveTechnicians`.

    *   **Example Integration Snippet (`orchestrator.ts`):**
        ```typescript
        // Inside runFullReplan...

        const [fetchedTechnicians, relevantJobsToday] = await Promise.all([
            getActiveTechnicians(),
            getRelevantJobs(),
        ]);
        allTechnicians = fetchedTechnicians;

        if (allTechnicians.length === 0) {
            // ... existing logic ...
            return;
        }

        // +++ START One Step GPS Integration +++
        log('Step 0.5: Fetching real-time technician locations from One Step GPS...');
        const realTimeLocations: DeviceLocationMap | null = await fetchDeviceLocations(); // Renamed type

        if (realTimeLocations) {
            let updatedCount = 0;
            allTechnicians.forEach(tech => {
                const deviceId = tech.onestepgps_device_id;
                if (deviceId && realTimeLocations[deviceId]) {
                    const locationInfo = realTimeLocations[deviceId];
                    tech.current_location = { lat: locationInfo.lat, lng: locationInfo.lng };
                    // Optional: Store timestamp
                    // tech.location_timestamp = locationInfo.timestamp;
                    updatedCount++;
                } else if (deviceId) {
                    log(`WARN: No real-time location found for Tech ${tech.id} (Device ID: ${deviceId}). Using last known DB location.`, colors.yellow);
                }
                 // If no deviceId, we naturally fall back to DB location
            });
            log(`Successfully updated ${updatedCount} technician locations from One Step GPS.`, colors.green);
        } else {
            log('WARN: Failed to fetch real-time locations from One Step GPS. Proceeding with last known locations from database.', colors.yellow);
            // No changes needed, techs array already has DB locations
        }
        // +++ END One Step GPS Integration +++

        // ... rest of the existing logic (populate jobsToPlan, identify lockedJobs, etc.) ...

        // Pass 1 (Today) - Availability calculation will now use potentially updated locations
        console.log('Step 1.1: Calculating technician availability for today...');
        calculateTechnicianAvailability(allTechnicians, lockedJobsToday);

        // ... rest of Pass 1 and Overflow Loop ...
        ```

**Phase 4: Testing**

1.  **Unit Tests:**
    *   Create `apps/scheduler/tests/onestepgps/client.test.ts`.
    *   Use `axios-mock-adapter` or `jest.mock('axios')` to mock the API responses (success, errors, rate limits).
    *   Test `fetchDeviceLocations` for:
        *   Correct URL and header construction.
        *   Successful response parsing and mapping.
        *   Handling of missing API key.
        *   Handling of API errors (4xx, 5xx).
        *   Handling of network errors.
        *   Filtering of devices with incomplete data.
2.  **Integration Tests (`orchestrator.test.ts`):**
    *   Modify existing tests or add new ones for `runFullReplan`.
    *   Mock `fetchDeviceLocations` to return different scenarios (success, failure, partial data).
    *   Assert that `technician.current_location` is correctly updated (or not updated in case of failure) before `calculateTechnicianAvailability` is called.
3.  **E2E Tests:**
    *   The E2E simulation currently doesn't include One Step GPS. Adding it would require:
        *   A mock One Step GPS API container/service *or* configuring the test runner to use the real API (if safe and desired, using a test key).
        *   Updating the E2E setup script (`run-e2e-tests.js`) to manage the mock service.
        *   Adding assertions in `e2e.test.ts` to verify that the scheduler uses the expected locations based on the (mocked) API output.

**Phase 5: Documentation**

1.  Update `README.md` or relevant technical documentation (`docs/technical-reference.md`) to include:
    *   The new `ONESTEP_GPS_API_KEY` environment variable requirement.
    *   The assumption/requirement of the `onestepgps_device_id` field on the `technicians` table.
    *   A brief description of the location fetching process and its integration point in the scheduler.

---

This plan provides a structured approach to integrating the One Step GPS API, focusing on modularity, error handling, and consistency with the existing architecture. Remember to handle the API key securely and add the necessary `onestepgps_device_id` field to your database and data models.

**Relevant Files:**

*   `apps/scheduler/src/onestepgps/client.ts` (New)
*   `apps/scheduler/src/scheduler/orchestrator.ts` (Modified)
*   `apps/scheduler/src/supabase/technicians.ts` (Modified)
*   `apps/scheduler/src/types/database.types.ts` (Modified)
*   `schema.sql` (Modified - Root level)
*   `simulation/init-scripts/05-merged-custom-test-data.sql` (Modified)
*   `.env.sample` / `.env.test` / Deployment Config (Modified)
*   `apps/scheduler/tests/onestepgps/client.test.ts` (New)
*   `apps/scheduler/tests/scheduler/orchestrator.test.ts` (Modified)
*   `docs/technical-reference.md` / `README.md` (Modified)
*   `specs/onestepgps-spec.md` (Reference)
*   `package.json` (in `apps/scheduler` - Modified for axios dependency)