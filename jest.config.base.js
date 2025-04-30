module.exports = {
  // No preset at the root when using projects
  // testEnvironment: 'node', // Defined in project config
  projects: [
    // Project for scheduler unit tests
    {
      displayName: 'scheduler',
      preset: 'ts-jest',
      testEnvironment: 'node',
      // Root directory for this project's tests
      rootDir: 'apps/scheduler',
      // Explicitly tell ts-jest which tsconfig to use relative to THIS project's rootDir
      transform: {
        '^.+\.ts$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.json', // Points to apps/scheduler/tsconfig.json
          },
        ],
      },
      // Look for tests under the project's rootDir
      testMatch: ['<rootDir>/tests/**/*.test.ts'],
      // Exclude E2E tests from this project
      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/tests/e2e/'],
      moduleFileExtensions: ['ts', 'js', 'json', 'node'],
      // Use the correct setup file that loads .env.test
      // setupFiles: ['dotenv/config'], // Incorrect: loads root .env
      setupFilesAfterEnv: ['<rootDir>/../../tests/integration/setupEnv.ts'], // Use integration setup
    },
    // Add other projects here (e.g., apps/web if it gets tests)
    // {
    //   displayName: 'web',
    //   preset: 'ts-jest', // Or appropriate preset for Next.js/React
    //   testEnvironment: 'jsdom', 
    //   rootDir: 'apps/web',
    //   testMatch: ['<rootDir>/tests/**/*.test.ts'], 
    //   setupFiles: ['dotenv/config'],
    // }
  ],
  // Optional: Global coverage reporting configuration
  collectCoverage: true,
  // Collect coverage only from the apps' source files
  collectCoverageFrom: [
    'apps/*/src/**/*.ts',
    '!apps/*/src/types/**/*', // Exclude type definition files
    '!apps/*/src/server.ts', // Exclude server entry points if desired
    '!apps/*/src/index.ts', // Exclude main script entry points if desired
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
}; 