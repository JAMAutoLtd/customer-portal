/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Specify the setup file
  setupFiles: ['<rootDir>/apps/scheduler/tests/setupEnv.ts'],

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
}; 