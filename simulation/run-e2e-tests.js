/**
 * End-to-End Testing Simulation Script (Strategy 1 - Docker)
 * 
 * This script:
 * 1. Loads configuration exclusively from `.env.test` (using production variable names).
 * 2. Starts Docker containers for all services (Postgres, PostgREST, Nginx, Optimizer, Web) via Docker Compose.
 * 3. Waits for all services to be ready using health checks and direct connections.
 * 4. Optionally generates dynamic seed data.
 * 5. Runs Playwright E2E tests located in `tests/e2e`.
 * 6. Tears down containers and volumes.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { setTimeout } = require('timers/promises');
const axios = require('axios'); // Or use Node's fetch in newer versions
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..');
const SIMULATION_DIR = path.resolve(__dirname);
const envPath = path.resolve(ROOT_DIR, '.env.test');

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
  console.log(`${color}[E2E Simulation]${colors.reset} ${message}`);
}

// --- Load ONLY .env.test --- (Moved to top)
if (!fs.existsSync(envPath)) {
    log(`ERROR: .env.test file not found at ${envPath}. This is required for the simulation.`, colors.red);
    process.exit(1);
}
// Load .env.test, overwriting any existing process.env variables
dotenv.config({ path: envPath, override: true });
log(`Loaded environment variables EXCLUSIVELY from ${envPath}`, colors.cyan);

// --- Verify Essential Vars (Using Production Names) ---
const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'OPTIMIZATION_SERVICE_URL', 'E2E_BASE_URL', 'DATABASE_URL',
    'PGRST_DB_URI', 'PGRST_JWT_SECRET', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'
    // Add others like GOOGLE_MAPS_API_KEY if strictly needed for services to start
];
const missingVars = requiredVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    log(`ERROR: Missing required variables in .env.test: ${missingVars.join(', ')}`, colors.red);
    process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const generateSeed = args.includes('--generate') || args.includes('--generate-seed') || args.includes('-g');
const buildContainers = args.includes('--build'); // Flag to force build
const keepContainersOnFail = args.includes('--keep-containers-on-fail');
const playwrightArgs = args.filter(arg => 
    !['--generate', '--generate-seed', '-g', '--build', '--keep-containers-on-fail'].includes(arg)
);

/**
 * Checks if Docker is running.
 */
function checkDockerRunning() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch (error) {
    log('Docker command failed. Is Docker running and accessible?', colors.red);
    return false;
  }
}

/**
 * Starts all Docker Compose services defined in simulation/docker-compose.yml.
 * Uses the --env-file flag to ensure configuration comes from ../.env.test.
 */
async function startAllServices() {
  log('Starting Docker Compose services (Postgres, PostgREST, Nginx, Optimizer, Web)...', colors.blue);
  try {
    // Determine base args: up, detach, remove orphans
    const baseArgs = ['up', '-d', '--remove-orphans'];
    // Prepend the crucial --env-file argument and specify the compose file
    const composeArgs = ['--env-file', '../.env.test', '-f', 'docker-compose.test.yml', ...baseArgs]; // Use relative path for .env.test

    if (buildContainers) {
       composeArgs.push('--build'); // Add build flag if requested
       log('Including --build flag for docker-compose', colors.yellow);
    }
    // Execute the command
    execSync(`docker-compose ${composeArgs.join(' ')}`, { // Compose file is now in args
      cwd: SIMULATION_DIR,
      stdio: 'inherit' // Show docker-compose output
    });
    log('Docker Compose services started/updated.', colors.green);
    return true;
  } catch (error) {
    log(`Error starting Docker Compose services: ${error.message}`, colors.red);
    // Log docker-compose ps output on failure for context
    try {
        log('Docker Compose status on failure:', colors.red);
        // Also specify the test file for ps
        execSync(`docker-compose -f docker-compose.test.yml ps`, { cwd: SIMULATION_DIR, stdio: 'inherit' });
    } catch (e) { /* ignore */ }
    return false;
  }
}

/**
 * Generic function to wait for a service to be ready.
 * Uses checkFn to determine readiness.
 */
async function waitForService(name, url, checkFn, containerLogName, maxAttempts = 30, interval = 5000) {
    log(`Waiting for ${name} at ${url}...`, colors.yellow);
    let attempts = 0;
    while (attempts < maxAttempts) {
        attempts++;
        try {
            const ready = await checkFn(url);
            if (ready) {
                log(`${name} is ready!`, colors.green);
                return true;
            }
            // Optional: Log specific non-ready status if checkFn provides it
            log(`${name} not ready yet (attempt ${attempts}/${maxAttempts}). Retrying...`, colors.yellow);
        } catch (error) {
            log(`${name} connection error: ${error.message} (attempt ${attempts}/${maxAttempts}). Retrying...`, colors.yellow);
        }
        if (attempts >= maxAttempts) {
            log(`${name} failed to respond/become ready after ${maxAttempts} attempts.`, colors.red);
            // Log relevant container logs
             try {
                log(`${name} container logs:`, colors.red);
                execSync(`docker-compose logs ${containerLogName}`, { cwd: SIMULATION_DIR, stdio: 'inherit', timeout: 10000 });
             } catch (e) { log(`Could not retrieve logs for ${containerLogName}. Error: ${e.message}`, colors.red); }
            return false;
        }
        await setTimeout(interval);
    }
    return false;
}

/**
 * Placeholder for any additional DB initialization needed AFTER docker-entrypoint scripts.
 */
async function runDatabaseInitializationIfNeeded() {
    // Example: Run migrations if not handled by init scripts
    // try {
    //     log('Running database migrations...', colors.magenta);
    //     execSync('pnpm --filter @jam-auto/scheduler db:migrate', { cwd: ROOT_DIR, stdio: 'inherit' });
    //     log('Database migrations completed.', colors.green);
    //     return true;
    // } catch (error) {
    //     log(`Database migration failed: ${error.message}`, colors.red);
    //     return false;
    // }
    log('Skipping additional database initialization (handled by init-scripts).', colors.cyan);
    return true;
}

/**
 * Runs the seed data generator script.
 */
async function runSeedGenerator() {
  log('Running dynamic seed data generator (generate-dynamic-seed.js)...', colors.magenta);
  const seedGeneratorScript = path.join(SIMULATION_DIR, 'generate-dynamic-seed.js');
  const seedSqlPath = path.join(SIMULATION_DIR, 'init-scripts', '07-generated-seed-data.sql');

  if (!fs.existsSync(seedGeneratorScript)) {
      log(`Error: Seed generator script not found at ${seedGeneratorScript}`, colors.red);
      return false;
  }

  // Delete existing generated file first
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

  try {
    const command = `node "${seedGeneratorScript}"`; // No scenario support assumed here, add if needed
    log(`Executing: ${command}`, colors.cyan);
    execSync(command, {
      cwd: SIMULATION_DIR,
      stdio: 'inherit',
      encoding: 'utf-8',
      timeout: 60000 // 1 minute timeout
    });

    log('Dynamic seed data generator script executed successfully.', colors.green);

    // Verify the generated SQL file EXISTENCE
    log(`Verifying existence of generated dynamic seed file: ${seedSqlPath}...`, colors.cyan);
    if (!fs.existsSync(seedSqlPath)) {
        log(`Error: Dynamic seed generator ran but the output file ${seedSqlPath} was NOT created!`, colors.red);
        throw new Error('Generated dynamic seed SQL file does not exist after generation attempt.');
    } else {
        log(`Generated dynamic seed file ${seedSqlPath} exists.`, colors.green);
    }
    return true;

  } catch (error) {
    log(`Error running dynamic seed generator script: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Run Playwright tests located in tests/e2e
 */
async function runTests() {
  log('Running end-to-end tests (Playwright)...', colors.magenta);
  try {
    // Environment variables (including E2E_BASE_URL) were loaded via dotenv at script start
    const env = { ...process.env };

    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    // Base command to run Playwright tests via the root package.json script
    const testCommandBase = ['pnpm', 'run', 'test:e2e:run']; 
    // Append any additional arguments passed to this script
    const testCommand = [...testCommandBase, ...playwrightArgs];

    log(`Executing Tests: ${npxCmd} ${testCommand.join(' ')}`, colors.cyan);
    log(`  Targeting Base URL: ${env.E2E_BASE_URL}`);
    if (playwrightArgs.length > 0) {
        log(`  With additional args: ${playwrightArgs.join(' ')}`, colors.cyan);
    }

    const testProcess = spawn(npxCmd, testCommand, {
      cwd: ROOT_DIR, // Run from root
      stdio: 'inherit',
      env, // Pass the current environment
      shell: process.platform === 'win32'
    });

    return new Promise((resolve) => {
      testProcess.on('close', (code) => {
        if (code === 0) {
          log('Playwright tests completed successfully', colors.green);
          resolve(true);
        } else {
          log(`Playwright tests failed with exit code ${code}`, colors.red);
          resolve(false);
        }
      });
      testProcess.on('error', (err) => {
        log(`Failed to start Playwright process: ${err.message}`, colors.red);
        resolve(false);
      });
    });
  } catch (error) {
    log(`Error running tests: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Stop and remove the Docker containers and volumes.
 */
async function cleanup() {
  log('Cleaning up Docker Compose services and volumes...', colors.blue);
  try {
    // Also use --env-file and -f here for consistency
    execSync(`docker-compose --env-file ../.env.test -f docker-compose.test.yml down -v --remove-orphans`, {
      cwd: SIMULATION_DIR,
      stdio: 'inherit'
    });
    log('Cleanup complete.', colors.green);
    return true;
  } catch (error) { 
    log(`Error during cleanup: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Main function to run the entire process
 */
async function main() {
  log('Starting E2E Test Simulation...', colors.blue);

  // Check Docker availability
  if (!checkDockerRunning()) {
    process.exit(1);
  }

  let servicesStarted = false;
  let testsPassed = false;
  let exitCode = 1; // Default to failure

  try {
    // Generate seed data if requested
    if (generateSeed) {
      log('--generate flag detected. Generating new dynamic seed data...', colors.yellow);
      if (!await runSeedGenerator()) {
        throw new Error('Dynamic seed data generation failed. Cannot proceed.');
      }
      // Add a small delay *after* generation and verification for filesystem sync
      log('Adding 1-second delay after dynamic seed generation...', colors.yellow);
      await setTimeout(1000);
    } else {
      log('--generate flag NOT detected. Using existing init-scripts/seed data.', colors.cyan);
      // Optional: Verify existence of 07-generated-seed-data.sql even if not generating?
      // const seedSqlPath = path.join(SIMULATION_DIR, 'init-scripts', '07-generated-seed-data.sql');
      // if (!fs.existsSync(seedSqlPath)) {
      //   log(`Warning: Required generated file ${seedSqlPath} is missing! DB init might fail.`, colors.yellow);
      // }
    }

    // Start all services
    servicesStarted = await startAllServices();
    if (!servicesStarted) {
        throw new Error("Docker Compose failed to start services.");
    }

    // Wait for all services to be ready
    log('Waiting for services to become healthy...', colors.magenta);

    // Wait for Postgres (using healthcheck defined in docker-compose.yml is implicitly handled by depends_on) 
    // Adding an explicit wait can be more robust.
    if (!await waitForService('PostgreSQL', process.env.DATABASE_URL, async (url) => {
        // Attempt a basic query or use pg client to connect
        // For simplicity, just check if the pg_isready command in healthcheck passed implicitly
        // We rely on docker-compose healthcheck reporting for postgres readiness via depends_on
        // Check docker ps output or docker inspect for health status if needed
        log('Checking Postgres health via docker-compose ps...', colors.cyan);
        const status = execSync(`docker-compose ps postgres`, { cwd: SIMULATION_DIR }).toString();
        if (status.includes('(healthy)')) return true;
        if (status.includes('(health: starting)')) return false; // Still starting
        throw new Error(`Postgres not healthy. Status: ${status}`); // Failed
    }, 'postgres', 30, 2000)) { // Check more frequently initially
        throw new Error('PostgreSQL failed to become ready.');
    }

    // Optional: Run additional DB init/migrations if needed
    if (!await runDatabaseInitializationIfNeeded()) {
        throw new Error('Database initialization failed.');
    }

    // Wait for PostgREST (via Nginx)
    if (!await waitForService('PostgREST API (via Nginx)', process.env.NEXT_PUBLIC_SUPABASE_URL, async (url) => {
        const response = await axios.get(url, { timeout: 4000 }); // Check root or /rpc/health endpoint if available
        return response.status >= 200 && response.status < 400; // Simple status check
    }, 'nginx')) { // Check nginx container logs on failure
        throw new Error('PostgREST API (Nginx) failed to become ready.');
    }

    // Wait for Optimization Service
    const optimizerHealthUrl = process.env.OPTIMIZATION_SERVICE_URL.replace('/optimize-schedule', '/health');
    if (!await waitForService('Optimization Service', optimizerHealthUrl, async (url) => {
        const response = await axios.get(url, { timeout: 4000 });
        // Adjust check based on actual health endpoint response
        return response.status === 200 && (response.data?.status === 'healthy' || response.data?.ok === true);
    }, 'optimizer_service')) { // Use consistent container name
        throw new Error('Optimization Service failed to become ready.');
    }

    // Wait for Web App
    if (!await waitForService('Web App', process.env.E2E_BASE_URL, async (url) => {
        const response = await axios.get(url, { timeout: 4000 }); // Check base URL
        return response.status === 200;
    }, 'web_app', 45, 5000)) { // Longer timeout for web app build/start
        throw new Error('Web App failed to become ready.');
    }

    log('All services are ready!', colors.green);

    // Run tests
    testsPassed = await runTests();

  } catch (error) {
    log(`Critical error during setup or testing: ${error.message}`, colors.red);
    testsPassed = false;
  } finally {
    if (!testsPassed && keepContainersOnFail) {
      log('Tests failed, but --keep-containers-on-fail flag detected. SKIPPING cleanup.', colors.yellow);
      exitCode = 1; // Indicate failure
    } else if (!servicesStarted && !keepContainersOnFail) {
        log('Services failed to start. Performing cleanup...', colors.blue);
        await cleanup();
        exitCode = 1;
    } else if (servicesStarted) {
      log('Performing cleanup...', colors.blue);
      await cleanup();
      exitCode = testsPassed ? 0 : 1; // Set exit code based on test success
    }
    log(`Exiting with code ${exitCode}.`, exitCode === 0 ? colors.green : colors.red);
    process.exit(exitCode); // Exit with appropriate code
  }
}

// --- Helper Functions Removed ---
// (Removed startPostgresContainer, initializeDatabaseManually, startDependentServices,
// waitForPostgREST, waitForOptimizationService, ensureJestConfig etc. as they are 
// replaced by startAllServices and waitForService)

// --- Usage Function (Optional - could be simplified) ---
function printUsage() {
  console.log(`
Usage: node simulation/run-e2e-tests.js [options] [-- playwright-options]

Options:
  --generate, -g        Generate new dynamic seed data before starting services.
  --build               Force rebuild of Docker images.
  --keep-containers-on-fail Keep containers running if tests fail.
  --help, -h            Show this help information.

Any arguments after '--' are passed directly to the Playwright CLI.

Examples:
  node simulation/run-e2e-tests.js              # Run tests with existing seed data
  node simulation/run-e2e-tests.js -g           # Generate new seed data and run tests
  node simulation/run-e2e-tests.js -- --headed  # Run tests in headed mode
  node simulation/run-e2e-tests.js -- -g "My Test Suite" # Run specific Playwright tests by grep
  `);
}

// Check for help flag before doing anything else
if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
}

// Run the main function
main().catch(err => {
  log(`Unhandled error in main: ${err.stack || err.message}`, colors.red);
  // Attempt cleanup even on unhandled error, unless flag is set
  if (!keepContainersOnFail) {
     log('Attempting emergency cleanup due to unhandled error...', colors.red);
     cleanup(); // Fire and forget cleanup
  }
  process.exit(1);
}); 