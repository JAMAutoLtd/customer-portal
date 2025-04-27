const { defaults } = require('jest-config');

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './', // Relative to this config file, so it points to tests/integration/
  testMatch: [
    // Match test files within the scheduler subdirectory
    '<rootDir>/scheduler/**/*.test.ts',
  ],
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',

  // A list of paths to modules that run some code to configure or set up the testing environment before each test
  setupFiles: ['dotenv/config'], // Load .env files (dotenv will load .env and .env.test)

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  // setupFilesAfterEnv: [],

  // The maximum amount of time this test should run for
  testTimeout: 30000, // Increase timeout for potentially longer integration tests

  // Add custom reporters if needed
  // reporters: undefined,

  // Automatically reset mock state before every test
  // resetMocks: false,

  // Automatically restore mock state and implementation before every test
  // restoreMocks: false,
}; 