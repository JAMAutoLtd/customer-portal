/**
 * End-to-End Testing Setup Script
 * 
 * This script:
 * 1. Starts Docker containers for PostgreSQL and PostgREST
 * 2. Waits for services to be ready
 * 3. Runs Jest tests with the .env.test configuration
 * 4. Tears down containers
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { setTimeout } = require('timers/promises');
const http = require('http');
const axios = require('axios');

const ROOT_DIR = path.resolve(__dirname, '..');
const SIMULATION_DIR = path.resolve(__dirname);

// Parse command line arguments
const args = process.argv.slice(2);
const useRealOptimize = args.includes('--real-optimize') || args.includes('-r');
const fastMode = args.includes('--fast') || args.includes('-f');
const generateSeed = args.includes('--generate') || args.includes('--generate-seed') || args.includes('-g');
const keepContainersOnFail = args.includes('--keep-containers-on-fail');

// Extract --scenario argument
let scenario = null;
const scenarioIndex = args.findIndex(arg => arg === '--scenario');
if (scenarioIndex !== -1 && args.length > scenarioIndex + 1) {
  scenario = args[scenarioIndex + 1];
}

const jestArgs = args.filter((arg, index) =>
  !['--real-optimize', '-r', '--generate-seed', '-g', '--fast', '-f', '--generate', '--keep-containers-on-fail', '--scenario'].includes(arg) &&
  !(index === scenarioIndex + 1 && scenarioIndex !== -1) // Exclude the scenario value itself
).join(' ');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}[E2E Test Setup]${colors.reset} ${message}`);
}

/**
 * Checks if Docker is running by running a simple docker command
 */
function checkDockerRunning() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Starts ONLY the PostgreSQL container
 */
async function startPostgresContainer() {
  log('Starting ONLY PostgreSQL container...', colors.blue);
  try {
    // Start only postgres, rebuild it
    execSync(`docker-compose up -d --no-deps --build postgres`, {
      cwd: SIMULATION_DIR,
      stdio: 'inherit'
    });
    log('PostgreSQL container started', colors.green);
    return true;
  } catch (error) {
    log(`Error starting postgres container: ${error.message}`, colors.red);
    // Log postgres container logs on error
    try {
      const logs = execSync('docker-compose logs postgres', {
        cwd: SIMULATION_DIR,
        stdio: 'pipe'
      }).toString();
      log('PostgreSQL logs on start error:', colors.red);
      console.log(logs);
    } catch (e) { /* ignore */ }
    return false;
  }
}

/**
 * Manually copies and executes init scripts in the running postgres container.
 */
async function initializeDatabaseManually() {
  log('Waiting for PostgreSQL to be ready before manual init...', colors.yellow);
  let pgReady = false;
  let attempts = 0;
  const maxAttempts = 30;
  while (!pgReady && attempts < maxAttempts) {
    try {
      // Use the database name defined in docker-compose
      execSync('docker-compose exec -T postgres pg_isready -U postgres -d scheduler_test_db', {
        cwd: SIMULATION_DIR,
        stdio: 'ignore'
      });
      pgReady = true;
      log('PostgreSQL is ready for manual init', colors.green);
    } catch (error) {
      attempts++;
      log(`Waiting for PostgreSQL... (${attempts}/${maxAttempts})`, colors.yellow);
      await setTimeout(1000);
    }
  }
  if (!pgReady) {
    log('PostgreSQL failed to become ready in time for manual init', colors.red);
    return false;
  }

  // Manually copy and execute init scripts
  log('Manually copying and executing init scripts...', colors.magenta);
  const scripts = [
    '00-roles.sql',
    '01-schema.sql',
    '05-merged-custom-test-data.sql',       // Static base data
    '06-equipment-requirements-test-data.sql', // Static requirements
    '07-generated-seed-data.sql',         // Dynamically generated data
    '09-permissions.sql'                // Permissions for PostgREST
  ];
  const initScriptsDir = path.join(SIMULATION_DIR, 'init-scripts');
  const containerDest = '/tmp/init-scripts'; // Copy to a temporary location in the container

  try {
    // Create the destination directory inside the container
    execSync(`docker-compose exec -T postgres mkdir -p ${containerDest}`, { cwd: SIMULATION_DIR, stdio: 'inherit' });

    // Copy each script
    for (const script of scripts) {
      const hostPath = path.join(initScriptsDir, script);
      // Ensure file exists before copying
      if (!fs.existsSync(hostPath)) {
        // Special handling for the generated file
        if (script === '07-generated-seed-data.sql') {
          log(`Error: Generated seed file not found on host: ${hostPath}. Did the generator fail?`, colors.red);
        } else {
          log(`Error: Required init script file not found on host: ${hostPath}`, colors.red);
        }
        throw new Error(`Script file not found: ${script}`);
      }
      const containerPath = `${containerDest}/${script}`;
      log(`Copying ${hostPath} to pgdb:${containerPath}...`, colors.cyan);
      execSync(`docker cp "${hostPath}" pgdb:${containerPath}`, { stdio: 'inherit' });
    }

    // Execute each script
    for (const script of scripts) {
       const containerPath = `${containerDest}/${script}`;
       log(`Executing ${script} inside container...`, colors.cyan);
       // Ensure script exists in container before executing
       execSync(`docker-compose exec -T postgres test -f ${containerPath}`, { cwd: SIMULATION_DIR, stdio: 'ignore' });
       execSync(`docker-compose exec -T postgres psql -U postgres -d scheduler_test_db -f ${containerPath}`, {
         cwd: SIMULATION_DIR,
         stdio: 'inherit'
       });
    }
    log('Manual init scripts executed successfully.', colors.green);
    return true;

  } catch (error) {
    log(`Error copying or executing init scripts: ${error.message}`, colors.red);
    // Log postgres container logs on error
    try {
      const logs = execSync('docker-compose logs postgres', {
        cwd: SIMULATION_DIR,
        stdio: 'pipe'
      }).toString();
      log('PostgreSQL logs on script execution error:', colors.red);
      console.log(logs);
    } catch (e) { /* ignore */ }
    return false;
  }
}

/**
 * Starts the dependent services (PostgREST, Nginx, Optimize)
 */
async function startDependentServices() {
  log('Starting dependent services (PostgREST, Nginx, Optimize)...', colors.blue);
  try {
    // Start other services, build optimize if needed
    const optimizeServiceFlag = useRealOptimize ? '--build optimize-service' : ''; // Corrected build flag name
    execSync(`docker-compose up -d --no-deps ${optimizeServiceFlag} postgrest nginx optimize-service`, {
      cwd: SIMULATION_DIR,
      stdio: 'inherit'
    });
    log('Dependent services started', colors.green);
    return true;
  } catch (error) {
    log(`Error starting dependent services: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Checks if PostgREST service is ready
 */
async function waitForPostgREST() {
  log('Waiting for PostgREST service to respond...', colors.yellow);
  const postgrestUrl = 'http://localhost:3000/'; // Base URL
  let attempts = 0;
  const maxAttempts = 12; // Wait up to 60 seconds (12 attempts * 5 seconds)

  while (attempts < maxAttempts) {
    attempts++;
    try {
      // Attempt a simple HTTP GET request
      await new Promise((resolve, reject) => {
        const req = http.get(postgrestUrl, { timeout: 4000 }, (res) => {
          // Check for a successful status code (e.g., 200)
          if (res.statusCode >= 200 && res.statusCode < 400) { // Allow 3xx redirects too
            log('PostgREST service responded successfully!', colors.green);
            resolve(true);
          } else {
            log(`PostgREST responded with status ${res.statusCode} (attempt ${attempts}/${maxAttempts}). Retrying...`, colors.yellow);
            res.resume(); // Consume response data to free up memory
            reject(new Error(`Status Code: ${res.statusCode}`));
          }
        });

        req.on('error', (e) => {
          log(`PostgREST connection error: ${e.message} (attempt ${attempts}/${maxAttempts}). Retrying...`, colors.yellow);
          reject(e);
        });

        req.on('timeout', () => {
          req.destroy();
          log(`PostgREST request timed out (attempt ${attempts}/${maxAttempts}). Retrying...`, colors.yellow);
          reject(new Error('Request timed out'));
        });
      });
      // If the promise resolves, the request was successful
      return true;
    } catch (error) {
      // If the promise rejects, wait and retry
      if (attempts >= maxAttempts) {
        log(`PostgREST failed to respond after ${maxAttempts} attempts.`, colors.red);
        log(`Last error: ${error.message}`, colors.red);
        // Log final PostgREST container logs for debugging
        try {
          const finalLogs = execSync('docker-compose logs postgrest', { cwd: SIMULATION_DIR, stdio: 'pipe', timeout: 10000 }).toString();
          log('Final PostgREST logs:', colors.red);
          console.log(finalLogs);
        } catch (e) {
          log('Could not retrieve final PostgREST logs.', colors.red);
        }
        return false;
      }
      await setTimeout(5000); // Wait 5 seconds before retrying
    }
  }
  // Should not be reached if maxAttempts > 0
  return false;
}

/**
 * Checks if the Optimization service is ready
 */
async function waitForOptimizationService() {
  log('Waiting for Optimization Service to be ready...', colors.yellow);
  // Check the health endpoint of the optimization service
  const optimizeUrl = process.env.OPTIMIZATION_SERVICE_URL?.replace('/optimize-schedule', '/health') || 'http://localhost:8080/health';
  let attempts = 0;
  const maxAttempts = 12; // Wait up to 60 seconds

  log(`Checking Optimization Service health at: ${optimizeUrl}`, colors.cyan);

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const response = await axios.get(optimizeUrl, { timeout: 4000 });
      if (response.status === 200 && response.data?.status === 'healthy') {
        log('Optimization Service is ready!', colors.green);
        return true;
      }
      log(`Optimization Service responded with status ${response.status} (attempt ${attempts}/${maxAttempts}). Retrying...`, colors.yellow);
    } catch (axiosError) {
      log(`Optimization Service connection error: ${axiosError.message} (attempt ${attempts}/${maxAttempts}). Retrying...`, colors.yellow);
    }
    if (attempts >= maxAttempts) {
      log(`Optimization Service failed to respond after ${maxAttempts} attempts.`, colors.red);
      // Log final service logs for debugging
      try {
        const finalLogs = execSync('docker-compose logs optimize-service', { cwd: SIMULATION_DIR, stdio: 'pipe', timeout: 10000 }).toString();
        log('Final Optimization Service logs:', colors.red);
        console.log(finalLogs);
      } catch (e) {
        log('Could not retrieve final Optimization Service logs.', colors.red);
      }
      return false;
    }
    await setTimeout(5000); // Wait 5 seconds before retrying
  }
  return false;
}

/**
 * Runs the seed data generator script and captures its metadata output.
 */
async function runSeedGenerator(scenario) {
  log('Running NEW dynamic seed data generator (generate-dynamic-seed.js)...', colors.magenta);
  const seedGeneratorScript = path.join(SIMULATION_DIR, 'generate-dynamic-seed.js'); // Use the new generator script
  if (!fs.existsSync(seedGeneratorScript)) {
      log(`Error: Seed generator script not found at ${seedGeneratorScript}`, colors.red);
      return false; // Indicate failure
  }
  try {
    const command = `node "${seedGeneratorScript}" ${scenario ? `--scenario=${scenario}` : ''}`; // Pass scenario if provided
    log(`Executing: ${command}`, colors.cyan);
    // Execute the script, inherit stdio as it logs to console and writes to file directly
    execSync(command, { // Use the constructed command
      cwd: SIMULATION_DIR,
      stdio: 'inherit', // Show output directly, don't capture stdout for metadata
      encoding: 'utf-8',
      timeout: 60000
    });

    // New generator writes to file, doesn't output JSON metadata to stdout
    log('Dynamic seed data generator script executed successfully.', colors.green);
    if (!scenario) {
        log('Note: New generator does not produce metadata.json. Tests needing metadata may fail.', colors.yellow);
    } else {
        log(`Generated data for scenario: ${scenario}`, colors.cyan);
    }
    return true; // Indicate success

  } catch (error) {
    log(`Error running dynamic seed generator script: ${error.message}`, colors.red);
    return false; // Indicate failure
  }
}

/**
 * Run Jest tests with the proper environment configuration
 */
async function runTests(scenario) {
  log('Running end-to-end tests...', colors.magenta);

  // Use the package manager specific to your project
  try {
    // Load .env.test variables into the process environment
    require('dotenv').config({ path: path.join(ROOT_DIR, '.env.test') });

    // Add extra environment variables
    const env = {
      ...process.env,
      RUN_REAL_OPTIMIZE: useRealOptimize ? 'true' : 'false',
      E2E_SCENARIO: scenario ? scenario : undefined // Set E2E_SCENARIO env var
    };

    if (useRealOptimize) {
      log('Using REAL optimization service for tests', colors.cyan);
    } else {
      log('Using MOCKED optimization service for tests', colors.cyan);
    }

    // Determine the correct npx command based on OS
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    // Prepare Jest arguments, splitting jestArgs if it contains spaces
    const jestCliArgs = ['jest', '--config=jest.e2e.config.js', '--detectOpenHandles', 'tests/e2e'];
    // Filter out empty strings that might result from split
    const additionalArgs = jestArgs ? jestArgs.split(' ').filter(arg => arg) : [];
    if (additionalArgs.length > 0) {
        log(`Passing additional arguments to Jest: ${additionalArgs.join(' ')}`, colors.cyan);
        jestCliArgs.push(...additionalArgs);
    }

    log(`Executing Jest: ${npxCmd} ${jestCliArgs.join(' ')}`, colors.cyan);
    // Run Jest with e2e tests
    const jest = spawn(npxCmd, jestCliArgs, { // Use the prepared jestCliArgs array
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32' // Use shell on Windows
    });

    return new Promise((resolve) => {
      jest.on('close', (code) => {
        if (code === 0) {
          log('Tests completed successfully', colors.green);
          resolve(true);
        } else {
          log(`Tests failed with exit code ${code}`, colors.red);
          // Conditionally skip cleanup based on the flag
          if (keepContainersOnFail) {
            log('--keep-containers-on-fail flag detected. Skipping container cleanup.', colors.yellow);
          } else {
            // Existing cleanup logic here (might be in main() or stopContainers())
            // We will modify the main() function's finally block instead for simplicity.
          }
          resolve(false);
        }
      });
      jest.on('error', (err) => {
          log(`Failed to start Jest process: ${err.message}`, colors.red);
          resolve(false);
      });
    });
  } catch (error) {
    log(`Error running tests: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Stop and remove the Docker containers
 */
function stopContainers() {
  log('Stopping Docker containers...', colors.blue);

  try {
    execSync('docker-compose down -v --remove-orphans', { // Added -v and --remove-orphans
      cwd: SIMULATION_DIR,
      stdio: 'inherit'
    });
    log('Containers stopped and removed', colors.green);
    return true;
  } catch (error) {
    log(`Error stopping containers: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Create a Jest config for E2E tests if it doesn't exist
 */
function ensureJestConfig() {
  const configPath = path.join(ROOT_DIR, 'jest.e2e.config.js');

  if (!fs.existsSync(configPath)) {
    log('Creating Jest E2E config file...', colors.yellow);

    const configContent = `
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.test.ts'],
  setupFiles: ['dotenv/config'],
  testTimeout: 30000 // Increased timeout
};
    `.trim();

    fs.writeFileSync(configPath, configContent);
    log('Created Jest E2E config file', colors.green);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Usage: node run-e2e-tests.js [options] [jest options]

Options:
  --real-optimize, -r    Use the real optimization service instead of mocks
  --fast, -f             Skip waiting for PostgREST/Optimize service in mock mode (PostgreSQL only)
  --generate-seed, -g    Generate new seed data for the tests
  --scenario <name>      Generate data for and run a specific named scenario
  --keep-containers-on-fail    Keep containers running even if tests fail
  --help, -h             Show this help information

Jest options are passed directly to the Jest CLI.

Examples:
  node run-e2e-tests.js              # Run tests with mocked optimization service (random data)
  node run-e2e-tests.js -g           # Generate new random seed data and run tests
  node run-e2e-tests.js -g --scenario missing-equipment # Generate 'missing-equipment' data and run tests
  node run-e2e-tests.js -t "specific test name" # Run only specific tests
  `);
}

/**
 * Clean up any existing data to ensure we start fresh
 */
async function cleanupVolumes() {
  log('Cleaning up existing containers and data...', colors.blue);

  try {
    // Stop any existing containers and remove volumes
    execSync('docker-compose down -v --remove-orphans', { // Added --remove-orphans
      cwd: SIMULATION_DIR,
      stdio: 'inherit'
    });

    // Remove the postgres data directory if it exists
    const pgDataDir = path.join(SIMULATION_DIR, 'pgdata');
    if (fs.existsSync(pgDataDir)) {
      log('Removing existing PostgreSQL data directory...', colors.yellow);
      try {
        // On Windows we need to use different commands than on Unix
        if (process.platform === 'win32') {
          execSync(`rmdir /s /q "${pgDataDir}"`, { stdio: 'ignore' });
        } else {
          execSync(`rm -rf "${pgDataDir}"`, { stdio: 'ignore' });
        }
        log('Successfully removed PostgreSQL data directory', colors.green);
      } catch (e) {
        log(`Warning: Could not remove PostgreSQL data directory: ${e.message}`, colors.yellow);
        // Continue anyway, the container will likely recreate it
      }
    } else {
      log('No existing PostgreSQL data directory to remove', colors.yellow);
    }

    // Create an empty pgdata directory
    if (!fs.existsSync(pgDataDir)) {
      log('Creating fresh PostgreSQL data directory...', colors.yellow);
      fs.mkdirSync(pgDataDir, { recursive: true });
      log('Created fresh PostgreSQL data directory', colors.green);
    }

    log('Cleanup completed successfully', colors.green);
    return true;
  } catch (error) {
    log(`Warning: Error during cleanup: ${error.message}`, colors.yellow);
    // Continue anyway, as this is just a cleanup step
    return true;
  }
}

/**
 * Main function to run the entire process
 */
async function main() {
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Load .env.test variables EARLY
  log('Loading environment variables from .env.test...', colors.yellow);
  require('dotenv').config({ path: path.join(ROOT_DIR, '.env.test') });

  // Ensure jest config exists
  ensureJestConfig();

  // Check if Docker is running
  if (!checkDockerRunning()) {
    log('Docker is not running. Please start Docker and try again.', colors.red);
    process.exit(1);
  }

  // Create the tests/e2e directory if it doesn't exist
  const e2eDir = path.join(ROOT_DIR, 'tests', 'e2e');
  if (!fs.existsSync(e2eDir)) {
    fs.mkdirSync(e2eDir, { recursive: true });
    log(`Created directory: ${e2eDir}`, colors.green);
  }

  let success = false;
  let exitCode = 0; // Track exit code
  const seedSqlPath = path.join(SIMULATION_DIR, 'init-scripts', '07-generated-seed-data.sql'); // Target the new file

  try {
    // Generate seed data if requested
    if (generateSeed) {
      log('--generate flag detected. Attempting to generate new dynamic seed data...', colors.yellow);
      // Explicitly delete existing DYNAMIC seed file FIRST
      log(`Attempting to delete existing dynamic seed file: ${seedSqlPath}...`, colors.yellow);
      try {
        if (fs.existsSync(seedSqlPath)) {
          fs.unlinkSync(seedSqlPath);
          log('Deleted existing dynamic seed SQL file successfully.', colors.green);
        } else {
          log('No existing dynamic seed SQL file found to delete.', colors.cyan);
        }
      } catch (deleteError) {
        log(`Warning: Could not delete existing dynamic seed SQL file: ${deleteError.message}. Continuing...`, colors.yellow);
      }

      // Run the new generator (returns boolean success status)
      const generatorSuccess = await runSeedGenerator(scenario);
      if (!generatorSuccess) {
        throw new Error('Dynamic seed data generation failed. Cannot proceed.');
      }

      // Verify the generated SQL file EXISTENCE
      log(`Verifying existence of generated dynamic seed file: ${seedSqlPath}...`, colors.cyan);
      if (!fs.existsSync(seedSqlPath)) {
        log(`Error: Dynamic seed generator ran but the output file ${seedSqlPath} was NOT created!`, colors.red);
        throw new Error('Generated dynamic seed SQL file does not exist after generation attempt.');
      } else {
        log(`Generated dynamic seed file ${seedSqlPath} exists.`, colors.green);
      }

      // Add a small delay *after* generation and verification
      log('Adding 1-second delay after dynamic seed generation for filesystem sync...', colors.yellow);
      await setTimeout(1000);
    } else {
      log('--generate flag NOT detected. Using existing init-scripts (if present)...', colors.cyan);
      // Ensure the target generated file exists if not generating
      if (!fs.existsSync(seedSqlPath)) {
        log(`Warning: Not generating seed data, but required generated file ${seedSqlPath} is missing!`, colors.yellow);
        log('Database initialization might fail or use incomplete data.', colors.yellow);
      }
    }

    // Clean up existing volumes/containers before starting fresh
    await cleanupVolumes();

    // Start and initialize ONLY the database
    if (!await startPostgresContainer()) {
       throw new Error('Failed to start the PostgreSQL container');
    }
    if (!await initializeDatabaseManually()) {
      throw new Error('Failed to manually initialize the database');
    }

    // Start the rest of the services
    if (!await startDependentServices()) {
       throw new Error('Failed to start dependent services');
    }

    // Wait for services to be ready (if not in fast mode)
    if (!fastMode || useRealOptimize) {
      if (!await waitForPostgREST()) {
        throw new Error('PostgREST failed to become ready');
      }
      if (useRealOptimize) {
        if (!await waitForOptimizationService()) {
          throw new Error('Optimization Service failed to become ready');
        }
      }
    }

    // --- Optional: Direct PostgREST Check ---
    log('Making direct HTTP request to PostgREST (/jobs)...', colors.cyan);
    try {
      const anonKey = process.env.SUPABASE_ANON_KEY;
      log(`Using SUPABASE_ANON_KEY: ${anonKey ? anonKey.substring(0, 20) + '...' : '[Not Found]'}`, colors.cyan);
      if (!anonKey) {
        throw new Error('SUPABASE_ANON_KEY is not defined in process.env');
      }

      const response = await axios.get('http://localhost:3000/jobs', {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      });
      log(`Direct PostgREST request successful! Status: ${response.status}`, colors.green);
    } catch (axiosError) {
      log(`Direct PostgREST request FAILED: ${axiosError.message}`, colors.red);
      if (axiosError.response) {
        log(`Response Status: ${axiosError.response.status}`, colors.red);
        log(`Response Data: ${JSON.stringify(axiosError.response.data)}`, colors.red);
      }
      // Don't necessarily fail the whole test run here, just log it
      log('Warning: Direct PostgREST check failed, but continuing...', colors.yellow);
    }
    // --- End Direct PostgREST Check ---

    // Run tests
    success = await runTests(scenario); // Pass scenario to tests

  } catch (error) {
    log(`Critical error during setup or testing: ${error.message}`, colors.red);
    success = false;
  } finally {
    // Cleanup based on success AND the flag
    if (!success && keepContainersOnFail) {
      log('Tests failed, but --keep-containers-on-fail flag detected. SKIPPING cleanup.', colors.yellow);
      exitCode = 1; // Set exit code to indicate failure
    } else {
      log('Performing cleanup...', colors.blue);
      if (!stopContainers()) {
        log('Cleanup failed, but continuing...', colors.yellow);
      }
      exitCode = success ? 0 : 1; // Set exit code based on test success
    }
    process.exit(exitCode); // Exit with appropriate code
  }
}

// Run the main function
main().catch(err => {
  log(`Unhandled error in main: ${err.message}`, colors.red);
  // Attempt cleanup even on unhandled error, unless flag is set
  if (!keepContainersOnFail) {
     stopContainers();
  }
  process.exit(1);
}); 