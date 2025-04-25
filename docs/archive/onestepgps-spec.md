> **Note:** This document contains historical specification details for the One Step GPS integration and may not reflect the final implementation details. Refer to `docs/technical-reference.md` for documentation on the current implementation in `apps/scheduler/src/onestepgps/client.ts` and `apps/scheduler/src/scheduler/orchestrator.ts`.

# One Step GPS API Integration Specification

## 1. Overview

This document outlines the specification for integrating the One Step GPS REST API to fetch real-time vehicle locations. The primary goal is to update technician locations periodically for use in a scheduling/optimisation system.

**Base Endpoint:** `https://track.onestepgps.com/v3/api/public/`

## 2. Authentication

Two methods are available:

*   **Bearer Token (Recommended for Backend):**
    *   Include the API key in the `Authorization` HTTP header.
    *   Format: `Authorization: Bearer YOUR_API_KEY`
    *   This is the standard and more secure method for server-to-server communication as it keeps the key out of URLs and logs.
*   **API Key Query Parameter:**
    *   Append the API key to the request URL.
    *   Format: `...?api-key=YOUR_API_KEY`
    *   Less secure; suitable for testing or simple clients, but avoid in production backend services.

**Note:** API keys should be treated as sensitive credentials and stored securely (e.g., environment variables). Obtain keys via `integration@onestepgps.com`.

## 3. Fetching Device Locations

Use the `/device-info` endpoint to retrieve the latest location data for all configured devices.

**Endpoint:** `GET /v3/api/public/device-info`

**Essential Query Parameters:**

*   `lat_lng=1`: Include latitude and longitude.
*   `device=1`: Include basic device info (like `device_id`, `display_name`).
*   `drive_status=1`: (Optional, from example) Include drive status (e.g., "idle").
*   `heading=1`: (Optional, from example) Include heading.
*   `speed=1`: (Optional, from example) Include speed.
*   `dt_tracker=1`: Include the timestamp of the device's last report.

**Example Request (using Bearer Token):**

```bash
curl 'https://track.onestepgps.com/v3/api/public/device-info?lat_lng=1&device=1&drive_status=1&heading=1&speed=1&dt_tracker=1' \
     -H 'Authorization: Bearer YOUR_API_KEY'
```

**Filtering:**

*   The provided documentation **does not** specify a method to filter results by a list of `device_id`s in the request.
*   **Assumption:** The API returns *all* devices associated with the API key. The backend service must filter this list internally to select relevant technicians.

## 4. Response Format

The endpoint returns a JSON array, where each object represents a device.

**Example Response Snippet:**

```json
[
    {
    "device_id": "6ceQekmYQ99YOF81f0B-01",
    "display_name": "Example Vehicle 1",
    "lat": 34.2321946,
    "lng": -109.0615854,
    "heading": 90,
    "dt_tracker": "2023-10-27T03:05:36Z", // Timestamp device reported location (RFC3339 UTC)
    "drive_status": "idle"
    // ... any other requested fields
  },
  {
    "device_id": "6ceQekmYQ99YOF81f0B-02",
    "display_name": "Example Vehicle 2"
    // ...
  }
]
```

**Timestamps (`dt_tracker`):**

*   All timestamps are in RFC3339 format (ISO 8601), typically ending with `Z` to denote UTC.
*   Example: `2023-10-27T03:05:36Z`
*   Use standard RFC3339 parsers. This timestamp represents when the *device* reported its location.

## 5. Implementation Considerations

*   **Polling Frequency:** Periodically call the `/device-info` endpoint (e.g., every 1-5 minutes) to get updated locations. Adjust frequency based on operational needs and rate limits.
*   **Rate Limiting:**
    *   The documentation mentions a `5000/hour` limit for *shareable link* keys. Limits for the main API key are **not specified**.
    *   **Assumption:** Assume standard rate limits exist. Implement logic to handle potential HTTP 429 "Too Many Requests" errors (e.g., using exponential backoff). Start with conservative polling.
*   **Error Handling:**
    *   Expect standard HTTP status codes:
        *   `200 OK`: Success
        *   `401 Unauthorized` / `403 Forbidden`: Invalid or missing API key/permissions.
        *   `429 Too Many Requests`: Rate limit exceeded.
        *   `5xx Server Error`: Issues on the One Step GPS side.
    *   **Assumption:** Error responses likely contain a JSON body with details, but the exact structure is unknown. Implement robust handling for different status codes and potential network errors.
*   **Data Freshness/Lag:**
    *   `dt_tracker` reflects the time the device sent data. There will be some lag due to device reporting intervals and network latency.
    *   For scheduling, use the latest `dt_tracker` available for each relevant technician. Consider how much lag is acceptable for the optimisation process.
*   **Data Mapping:** Map the `device_id` from the API response to your internal technician identifiers.

## 6. Open Questions / Future Checks

*   Confirm actual rate limits for the main API key with One Step GPS support.
*   Clarify the exact structure of JSON error responses.
*   Investigate if filtering by `device_id` is possible via undocumented parameters or requires a different endpoint (check advanced documentation or contact support).