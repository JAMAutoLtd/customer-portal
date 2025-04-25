module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Specify the root directory for Jest to operate in (optional but clear)
  // rootDir: '.', // Or keep undefined, Jest usually assumes project root
  // Match test files specifically within the scheduler's e2e test directory
  testMatch: [
    '<rootDir>/apps/scheduler/tests/e2e/**/*.test.ts'
  ],
  // Ensure paths in setupFiles are relative to the root config file
  setupFiles: ['dotenv/config'],
  testTimeout: 60000 // Increased timeout for potentially long E2E setup/runs
}; 