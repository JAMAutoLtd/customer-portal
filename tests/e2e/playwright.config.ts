import { defineConfig, devices } from '@playwright/test';
// No need to load .env.test here; the orchestrator will handle env vars for the test process

export default defineConfig({
  testDir: './', // Or specify subdirectories like 'tests/' or 'specs/'
  fullyParallel: true,
  reporter: 'html', // Or 'list', 'dot', etc.
  use: {
    // Base URL comes directly from the E2E_BASE_URL env var set by the orchestrator
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', // Fallback just in case
    trace: 'on-first-retry', // Collect trace when retrying the failed test
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    /* Uncomment for other browsers
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    */
  ],
}); 