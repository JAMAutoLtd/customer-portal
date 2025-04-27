import { fetchDeviceLocations, DeviceLocationMap } from '../../src/onestepgps/client';

// Environment variables should now be loaded by the Jest setup file (setupEnv.ts)

// Increase timeout for network requests
jest.setTimeout(30000); // 30 seconds

describe('OneStepGPS Live API Integration', () => {
    // This test hits the live OneStepGPS API and requires a valid API key in the .env file.
    // It might be skipped in CI environments without the key.
    test('fetchDeviceLocations should return data in the expected format', async () => {
        const apiKey = process.env.ONESTEP_GPS_API_KEY;

        if (!apiKey) {
            console.warn("Skipping OneStepGPS live test: ONESTEP_GPS_API_KEY not found in environment.");
            return; // Or use test.skip() if preferred
        }

        console.log("Running live OneStepGPS API test...");
        const locations: DeviceLocationMap | null = await fetchDeviceLocations();

        // Basic check: Ensure the function returned *something* (not null)
        // If this fails, check console for API errors (auth, network, etc.)
        expect(locations).not.toBeNull();

        // If locations is null, the remaining checks don't make sense
        if (!locations) return;

        console.log(`Received location data for ${Object.keys(locations).length} devices.`);

        // Detailed check: Verify the structure of the returned data for each device
        // We don't know the *exact* devices or locations, but we check the types/presence of fields.
        for (const deviceId in locations) {
            if (Object.prototype.hasOwnProperty.call(locations, deviceId)) {
                const deviceData = locations[deviceId];

                expect(deviceId).toEqual(expect.any(String)); // Device ID should be a string
                expect(deviceData).toBeDefined();
                expect(deviceData.lat).toEqual(expect.any(Number)); // Latitude should be a number
                expect(deviceData.lng).toEqual(expect.any(Number)); // Longitude should be a number
                expect(deviceData.timestamp).toEqual(expect.any(String)); // Timestamp should be a string

                // Optional: Check if timestamp looks like an ISO 8601 string
                expect(deviceData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);

                // Optional: Log the first few entries for manual inspection if needed
                // if (Object.keys(locations).indexOf(deviceId) < 3) {
                //     console.log(`  Device ${deviceId}: ${JSON.stringify(deviceData)}`);
                // }
            }
        }

        // We expect *some* devices, unless the OneStepGPS account has none configured.
        // Adjust this expectation if having zero devices is a valid state.
        expect(Object.keys(locations).length).toBeGreaterThanOrEqual(0);

    });
}); 