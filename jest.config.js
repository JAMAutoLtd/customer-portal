/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Setup file for existing scheduler tests
  // setupFiles: ['<rootDir>/apps/scheduler/tests/setupEnv.ts'], // Keep or remove based on need

  // Point ts-jest to the correct tsconfig - updated to new format
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.base.json',
      isolatedModules: true // This disables type checking for faster tests
    }]
  },

  // Specify test file patterns
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)',
    // Add pattern for integration tests
    '<rootDir>/tests/integration/**/*.[jt]s?(x)'
  ],

  // Setup file specifically for integration tests
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setupEnv.ts'],

  // Add any other specific Jest configurations needed for the monorepo here
  // For example, you might need moduleNameMapper for path aliases if you use them
  // Or setupFilesAfterEnv for setting up test environments

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  // collectCoverage: true,

  // The directory where Jest should output its coverage files
  // coverageDirectory: "coverage",

  // Indicates which provider should be used to instrument code for coverage
  // coverageProvider: "v8",

  // Increase timeout for integration tests which might take longer
  testTimeout: 20000, // 20 seconds
}; 