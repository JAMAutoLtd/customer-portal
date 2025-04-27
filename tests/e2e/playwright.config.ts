import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Read from default ".env" file.
dotenv.config();

// Read from ".env.test" file.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.test') });

export default defineConfig({
  testDir: './specs', // Point to the directory where spec files will be located
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html', // Use the HTML reporter
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', // Read base URL from env var
    trace: 'on-first-retry',
    screenshot: 'only-on-failure', // Capture screenshot only when a test fails
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    /* // Add other browsers if needed
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
  /* Optional: Add webServer configuration if needed, but we'll manage services via docker-compose */
  // webServer: {
  //   command: 'pnpm --filter web dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
}); 