#!/usr/bin/env node
import inquirer, { QuestionCollection, DistinctQuestion } from 'inquirer';
import chalk from 'chalk'; // For colored output
import { spawn } from 'child_process'; // Import spawn
import fs from 'fs/promises'; // Import fs promises
import path from 'path'; // Import path for resolving
import { logger } from '../../apps/scheduler/src/utils/logger'; // Corrected path to actual logger

// Define constants for metadata paths, resolving them to absolute paths
const BASELINE_METADATA_PATH = path.resolve(__dirname, '../../tests/integration/.baseline-metadata.json');
const CURRENT_SCENARIO_METADATA_PATH = path.resolve(__dirname, '../../tests/integration/.current-scenario-metadata.json');
const SCENARIOS_DIR = path.resolve(__dirname, './db/seed/scenarios');
const PROJECT_ROOT = path.resolve(__dirname, '../../'); // Assuming e2e-runner.ts is in simulation/scripts/
const INTEGRATION_TESTS_DIR = path.join(PROJECT_ROOT, 'tests', 'integration', 'scheduler');

// --- Utility Functions --- //

interface ScenarioChoice {
    name: string; // Filename without .ts, used as a key/value
    value: string; // Same as name, for inquirer value
    displayName: string; // Formatted name for display in list
    description: string;
}

/**
 * Checks if a file exists.
 * @param filePath Absolute path to the file.
 * @returns Promise resolving to true if the file exists, false otherwise.
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath, fs.constants.F_OK); // Check for file existence
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Executes a shell command with arguments, streaming output and returning success status.
 * @param command The base command (e.g., 'pnpm').
 * @param args An array of arguments for the command.
 * @returns Promise resolving to true if the command exits with code 0, false otherwise.
 */
function executeCommand(command: string, args: string[]): Promise<boolean> {
    return new Promise((resolve, reject) => {
        console.log(chalk.gray(`\n> Running: ${command} ${args.join(' ')}`));
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
        });

        child.on('error', (error) => {
            console.error(chalk.red(`Failed to start command: ${command}`), error);
            reject(error);
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(chalk.green(`\n> Command finished successfully.`));
                resolve(true);
            } else {
                console.error(chalk.red(`\n> Command failed with exit code: ${code}`));
                resolve(false);
            }
        });
    });
}

/**
 * Gets a list of available scenario names and their descriptions from the scenarios directory.
 * @returns Promise resolving to an array of ScenarioChoice objects.
 */
async function listScenarioFiles(): Promise<ScenarioChoice[]> {
    try {
        const files = await fs.readdir(SCENARIOS_DIR);
        const scenarioChoices: ScenarioChoice[] = [];

        for (const file of files) {
            if (file.endsWith('.ts') && !file.startsWith('_') && file !== 'index.ts' && file !== 'types.ts') {
                const scenarioName = file.replace('.ts', '');
                let description = 'No description available.';
                try {
                    const filePath = path.join(SCENARIOS_DIR, file);
                    const fileContent = await fs.readFile(filePath, 'utf-8');
                    // Updated Regex to capture content after @description stopping at the next tag or end of comment
                    const match = fileContent.match(/@description\s*([\s\S]*?)(?=\n\s*\*?\s*@|\*\/)/);
                    if (match && match[1]) {
                        description = match[1]
                            .replace(/\r\n?|\n/g, ' ')
                            .replace(/^\s*\*\s?/gm, '')
                            .replace(/\s+/g, ' ')
                            .trim();
                    } else {
                        // Fallback for simpler // SCENARIO_DESCRIPTION: format if JSDoc not found
                        const singleLineMatch = fileContent.match(/\/\/\s*SCENARIO_DESCRIPTION:(.*)/);
                        if (singleLineMatch && singleLineMatch[1]) {
                            description = singleLineMatch[1].trim();
                        }
                    }
                } catch (readError: any) {
                    logger.warn(`Could not read file ${file} to extract description: ${readError.message}`);
                }
                scenarioChoices.push({
                    name: scenarioName,
                    value: scenarioName,
                    displayName: `${scenarioName} - ${description}`,
                    description: description
                });
            }
        }
        return scenarioChoices;
    } catch (error) {
        console.error(chalk.red('Error reading scenarios directory:'), error);
        return [];
    }
}

/**
 * Gets a list of available integration test file names.
 * @returns Promise resolving to an array of test file names (e.g., 'base_schedule.test.ts').
 */
async function listTestFiles(): Promise<string[]> {
    try {
        const files = await fs.readdir(INTEGRATION_TESTS_DIR);
        return files.filter(file => file.endsWith('.test.ts'));
    } catch (error) {
        console.error(chalk.red('Error reading integration tests directory:'), error);
        return [];
    }
}

/**
 * Prompts the user for the number of technicians.
 */
async function promptForTechnicianCount(): Promise<number> {
    // Revert: Define questions without explicit collection type
    const questions = [
        {
            type: 'number',
            name: 'techCount',
            message: 'Enter number of baseline technicians (1-4):',
            default: 4,
            validate: (input: number) => {
                return input >= 1 && input <= 4 ? true : 'Please enter a number between 1 and 4.';
            },
        },
    ];
    // Revert: Use generic on prompt() again
    const { techCount } = await inquirer.prompt<{ techCount: number }>(questions);
    return techCount;
}

/**
 * Prompts the user to select a scenario.
 * @param scenarioChoices An array of ScenarioChoice objects.
 * @returns Promise resolving to the selected scenario name (file name without .ts) or null.
 */
async function promptForScenario(scenarioChoices: ScenarioChoice[]): Promise<string | null> {
    if (scenarioChoices.length === 0) {
        console.log(chalk.red('No scenario files found.'));
        return null;
    }
    const { scenarioName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'scenarioName',
            message: 'Select a scenario:',
            choices: scenarioChoices.map(choice => ({ name: choice.displayName, value: choice.value })),
        },
    ]);
    return scenarioName;
}

/**
 * Prompts the user for confirmation, potentially requiring specific input.
 */
async function promptForConfirmation(
    message: string,
    requiredInput?: string
): Promise<boolean> {
    type ConfirmationAnswers = {
        confirmation: boolean;
        requiredText?: string;
    };
    let prompts: DistinctQuestion<ConfirmationAnswers>[] = [
        {
            type: 'confirm',
            name: 'confirmation',
            message: message,
            default: false,
        },
    ];
    if (requiredInput) {
        prompts.push({
            type: 'input',
            name: 'requiredText',
            message: `To confirm, please type: \"${requiredInput}\"`, 
            when: (answers) => answers.confirmation, 
            validate: (input: string) => {
                return input === requiredInput ? true : `Input must match \"${requiredInput}\" exactly.`;
            },
        });
    }
    const answers = await inquirer.prompt(prompts);
    return requiredInput ? answers.confirmation && answers.requiredText === requiredInput : answers.confirmation;
}

// --- Main Menu Logic --- //

enum MainMenuChoice {
    START_DOCKER = 'Start Docker Test Environment (docker-compose up)',
    STOP_DOCKER = 'Stop Docker Test Environment (docker-compose down)',
    CLEAN_DB = 'Clean Staging Database',
    SEED_BASELINE = 'Seed Baseline Data',
    SEED_SCENARIO = 'Seed Specific Scenario',
    RUN_COMPREHENSIVE_TEST = 'Run Comprehensive Scheduler Integration Test',
    RUN_BACKEND_TEST = 'Run Specific Backend Test (Jest)',
    RUN_UI_E2E_TESTS = 'Run UI E2E Tests (Playwright)',
    RUN_SCENARIO_TEST = 'Run Specific Scenario Test (Seed -> Jest)',
    RUN_ALL_SCENARIO_TESTS = 'Run ALL Scenario Tests (Seed -> Jest)',
    MIGRATE_PROD = 'Migrate Production Data to Staging (WARNING: Use with extreme caution!)',
    EXIT = 'Exit',
}

async function mainMenu() {
    while (true) {
        console.log(chalk.cyan('\n=== E2E Testing Environment Runner ==='));
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Choose an action:',
                choices: Object.values(MainMenuChoice),
            },
        ]);

        let success = true; // Track command success for sequential actions

        try {
            switch (action) {
                case MainMenuChoice.START_DOCKER:
                    console.log(chalk.blue('Starting Docker test environment via docker-compose...'));
                    // Add --env-file argument as per docker-test-environment.mdc rule
                    success = await executeCommand('docker-compose', [
                        '-f', 'docker-compose.test.yml',
                        '--env-file', '.env.test', // Explicitly specify env file
                        'up',
                        '-d',
                        '--build', // Build images if they don't exist or have changed
                        '--remove-orphans' // Remove containers for services not defined in the Compose file
                    ]);
                    break;

                case MainMenuChoice.STOP_DOCKER:
                    console.log(chalk.blue('Stopping Docker test environment via docker-compose...'));
                    success = await executeCommand('docker-compose', [
                        '-f', 'docker-compose.test.yml',
                        'down',
                        '-v', // Remove named volumes declared in the `volumes` section
                        '--remove-orphans' // Remove containers for services not defined in the Compose file
                    ]);
                    break;

                case MainMenuChoice.CLEAN_DB:
                    const confirmedClean = await promptForConfirmation(
                        chalk.red.bold('Are you sure you want to DELETE ALL DATA from the STAGING database?')
                    );
                    if (confirmedClean) {
                        // Pass the skip-confirm flag to the underlying script
                        success = await executeCommand('pnpm', ['db:clean:staging', '--', '--skip-confirm']);
                    } else {
                        console.log(chalk.yellow('Database cleanup cancelled.'));
                        success = false;
                    }
                    break;

                case MainMenuChoice.SEED_BASELINE:
                    success = await executeCommand('pnpm', [
                        'db:seed:staging',
                        '--',
                        '--action', 'baseline',
                        '--output-metadata', BASELINE_METADATA_PATH,
                    ]);
                    break;

                case MainMenuChoice.SEED_SCENARIO:
                    const scenariosSeed = await listScenarioFiles();
                    const selectedScenarioSeed = await promptForScenario(scenariosSeed);
                    if (!selectedScenarioSeed) {
                        success = false;
                        break;
                    }
                    const techCountScenarioSeed = await promptForTechnicianCount();
                    const baselineExistsSeed = await fileExists(BASELINE_METADATA_PATH);
                    if (!baselineExistsSeed) {
                        console.log(chalk.yellow('Warning: Baseline metadata file not found. Seeding scenario might fail or produce unexpected results.'));
                        const proceed = await promptForConfirmation('Proceed anyway?');
                        if (!proceed) {
                            success = false;
                            break;
                        }
                    }
                    success = await executeCommand('pnpm', [
                        'db:seed:staging',
                        '--',
                        '--action', 'scenario',
                        '--name', selectedScenarioSeed,
                        '--techs', techCountScenarioSeed.toString(),
                        '--baseline-metadata', BASELINE_METADATA_PATH,
                        '--output-metadata', CURRENT_SCENARIO_METADATA_PATH,
                    ]);
                    break;

                case MainMenuChoice.RUN_BACKEND_TEST:
                    const testFiles = await listTestFiles();
                    if (testFiles.length === 0) {
                        console.log(chalk.red('No integration test files found.'));
                        success = false;
                        break;
                    }
                    const { selectedTestFile } = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'selectedTestFile',
                            message: 'Select a backend integration test to run:',
                            choices: testFiles,
                        },
                    ]);
                    const testFilePathAbsoluteRun = path.join(INTEGRATION_TESTS_DIR, selectedTestFile);
                    const testFilePathRelativeRun = path.relative(process.cwd(), testFilePathAbsoluteRun).replace(/\\/g, '/'); // Force forward slashes
                    console.log(chalk.blue(`Running specific test: ${selectedTestFile}...`));
                    console.log(chalk.gray(` (Relative path: ${testFilePathRelativeRun})`)); 
                    success = await executeCommand('jest', [testFilePathRelativeRun]);
                    break;

                case MainMenuChoice.RUN_UI_E2E_TESTS:
                    success = await executeCommand('pnpm', ['test:e2e:run']);
                    break;

                case MainMenuChoice.RUN_SCENARIO_TEST:
                    const scenariosTest = await listScenarioFiles();
                    const selectedScenarioTest = await promptForScenario(scenariosTest);
                    if (!selectedScenarioTest) {
                        success = false;
                        break;
                    }
                    const techCountScenarioTest = await promptForTechnicianCount();
                    const baselineExistsTest = await fileExists(BASELINE_METADATA_PATH);
                    if (!baselineExistsTest) {
                        console.log(chalk.yellow('Warning: Baseline metadata file not found. Seeding scenario might fail.'));
                        const proceedSeed = await promptForConfirmation('Attempt to seed scenario anyway?');
                        if (!proceedSeed) {
                            success = false;
                            break;
                        }
                    }

                    // Ensure debug directory exists
                    try {
                        await fs.mkdir('debug', { recursive: true });
                    } catch (mkdirError) {
                        console.error(chalk.red('Failed to create debug directory:'), mkdirError);
                        // Decide if this is fatal or just warn
                    }

                    const scenarioStartTime = new Date(); // Record start time for logs

                    // 1. Seed the scenario
                    console.log(chalk.blue(`\nStep 1: Seeding scenario '${selectedScenarioTest}'...`));
                    const seedSuccess = await executeCommand('pnpm', [
                        'db:seed:staging',
                        '--',
                        '--action', 'scenario',
                        '--name', selectedScenarioTest,
                        '--techs', techCountScenarioTest.toString(),
                        '--baseline-metadata', BASELINE_METADATA_PATH,
                        '--output-metadata', CURRENT_SCENARIO_METADATA_PATH,
                    ]);

                    if (!seedSuccess) {
                        console.log(chalk.red('Scenario seeding failed. Skipping test execution.'));
                        success = false;
                        // Capture logs even if seed fails?
                        // break;
                    } else {
                        // 2. Run the specific test file
                        console.log(chalk.blue(`\nStep 2: Running integration test for '${selectedScenarioTest}'...`));
                        const testFilePathAbsolute = path.join(INTEGRATION_TESTS_DIR, `${selectedScenarioTest}.test.ts`);
                        const testFileExists = await fileExists(testFilePathAbsolute);
                        if (!testFileExists) {
                            console.log(chalk.red(`Error: Test file not found at ${testFilePathAbsolute}`));
                            console.log(chalk.yellow('Please ensure a corresponding .test.ts file exists for the selected scenario.'));
                            success = false;
                            // break;
                        } else {
                            // Use path relative to CWD for Jest argument, force forward slashes
                            const testFilePathRelative = path.relative(process.cwd(), testFilePathAbsolute).replace(/\\/g, '/'); // Force forward slashes
                            console.log(chalk.gray(` (Relative path: ${testFilePathRelative})`)); 
                            // Use jest directly to run the specific file, bypassing pnpm recursive script
                            success = await executeCommand('jest', [testFilePathRelative]);
                        }
                    }

                    // --- Step 3: Capture Logs (Always attempt after seed/test) --- 
                    const scenarioEndTime = new Date(); // Record end time
                    console.log(chalk.blue(`\nStep 3: Capturing logs for ${selectedScenarioTest}...`));
                    const schedulerLogPath = path.join('debug', `${selectedScenarioTest}_scheduler.log`);
                    const optimiserLogPath = path.join('debug', `${selectedScenarioTest}_optimiser.log`);
                    const startTimeISO = scenarioStartTime.toISOString();
                    const endTimeISO = scenarioEndTime.toISOString();

                    try {
                        // Use shell redirection via executeCommand
                        const schedulerCmd = `docker logs --since ${startTimeISO} --until ${endTimeISO} test_scheduler > "${schedulerLogPath}"`;
                        const optimiserCmd = `docker logs --since ${startTimeISO} --until ${endTimeISO} test_optimiser > "${optimiserLogPath}"`;
                        
                        // Execute log capture commands (best effort)
                        const logCaptureSchedulerSuccess = await executeCommand(schedulerCmd, []);
                        if (!logCaptureSchedulerSuccess) console.warn(chalk.yellow(`  Warning: Failed to capture scheduler logs for ${selectedScenarioTest}.`));
                        
                        const logCaptureOptimiserSuccess = await executeCommand(optimiserCmd, []);
                        if (!logCaptureOptimiserSuccess) console.warn(chalk.yellow(`  Warning: Failed to capture optimiser logs for ${selectedScenarioTest}.`));
                        
                        if (logCaptureSchedulerSuccess && logCaptureOptimiserSuccess) {
                            console.log(chalk.gray(`  Logs saved to debug/${selectedScenarioTest}_*.log`));
                        }
                    } catch (logError) {
                        console.error(chalk.red(`  Error during log capture for ${selectedScenarioTest}:`), logError);
                    }
                    // --- End Log Capture ---
                    break;

                case MainMenuChoice.RUN_ALL_SCENARIO_TESTS:
                    console.log(chalk.blue('Starting batch run for ALL scenario integration tests (Seed -> Jest)...'));
                    const allScenarios = await listScenarioFiles();
                    if (allScenarios.length === 0) {
                        console.log(chalk.red('No scenario files found to run.'));
                        success = false;
                        break;
                    }

                    const defaultTechCount = 4; // Use default tech count for batch runs
                    let overallSuccess = true;
                    const resultsSummary: { scenario: string; seeded: boolean; tested: boolean | null }[] = [];

                    console.log(chalk.yellow(`Found ${allScenarios.length} scenarios. Using default technician count: ${defaultTechCount}`));

                    for (const scenario of allScenarios) {
                        console.log(chalk.cyan(`\n--- Processing Scenario: ${scenario.name} ---`));
                        let seededOk = false;
                        let testedOk: boolean | null = null;

                        // --- Step 1: Seed --- 
                        console.log(chalk.blue(`  Seeding...`));
                        const seedSuccess = await executeCommand('pnpm', [
                            'db:seed:staging',
                            '--',
                            '--action', 'scenario',
                            '--name', scenario.name,
                            '--techs', defaultTechCount.toString(),
                            '--baseline-metadata', BASELINE_METADATA_PATH,
                            '--output-metadata', CURRENT_SCENARIO_METADATA_PATH,
                        ]);
                        seededOk = seedSuccess;

                        if (!seedSuccess) {
                            console.log(chalk.red(`  Seeding failed for ${scenario.name}. Skipping test.`));
                            testedOk = null; // Mark test as skipped
                            overallSuccess = false;
                        } else {
                            // --- Step 2: Test --- 
                            const testFilePathAbsolute = path.join(INTEGRATION_TESTS_DIR, `${scenario.name}.test.ts`);
                            const testFileExists = await fileExists(testFilePathAbsolute);
                            
                            if (!testFileExists) {
                                console.log(chalk.yellow(`  Test file not found for ${scenario.name} at ${testFilePathAbsolute}. Skipping test.`));
                                testedOk = null; // Mark test as skipped
                            } else {
                                console.log(chalk.blue(`  Running test...`));
                                const testFilePathRelative = path.relative(process.cwd(), testFilePathAbsolute).replace(/\\/g, '/');
                                const testSuccess = await executeCommand('jest', [testFilePathRelative]);
                                testedOk = testSuccess;
                                if (!testSuccess) {
                                    overallSuccess = false;
                                }
                            }
                        }
                        resultsSummary.push({ scenario: scenario.name, seeded: seededOk, tested: testedOk });
                        console.log(chalk.cyan(`--- Finished Scenario: ${scenario.name} ---`));
                    }

                    // --- Summary --- 
                    console.log(chalk.cyan('\n=== Batch Run Summary ==='));
                    resultsSummary.forEach(res => {
                        let status = '';
                        if (res.seeded && res.tested === true) status = chalk.green('PASSED');
                        else if (!res.seeded) status = chalk.red('SEED FAILED');
                        else if (res.tested === false) status = chalk.red('TEST FAILED');
                        else if (res.tested === null) status = chalk.yellow('TEST SKIPPED');
                        console.log(`  - ${res.scenario}: ${status}`);
                    });
                    console.log(chalk.cyan('========================='));
                    success = overallSuccess; // Reflect overall success/failure
                    break;

                case MainMenuChoice.MIGRATE_PROD:
                    console.log(chalk.red.bold('\n--- DANGER ZONE: PRODUCTION DATA MIGRATION ---'));
                    console.log(chalk.yellow('This script will connect to the PRODUCTION database, read data, anonymize it, and overwrite the STAGING database.'));
                    console.log(chalk.yellow('Ensure you have backups and understand the consequences.'));
                    const confirmedMigrate1 = await promptForConfirmation('Are you absolutely sure you want to proceed?');
                    if (!confirmedMigrate1) {
                        success = false; break;
                    }
                    const confirmedMigrate2 = await promptForConfirmation(
                        'Second confirmation: This will overwrite STAGING data. Proceed?',
                        'OVERWRITE STAGING'
                    );
                    if (!confirmedMigrate2) {
                        success = false; break;
                    }
                    console.log(chalk.blue('Executing production migration script...'));
                    // Construct command to run the script directly using ts-node and cross-env
                    success = await executeCommand('cross-env', [
                        'dotenv_config_path=.env.prod', // Assuming you have a .env.prod
                        'ts-node',
                        '-r', 'dotenv/config',
                        '--compiler-options', '{"module":"CommonJS"}',
                        'simulation/scripts/db/migrate-prod-to-staging.ts'
                    ]);
                    break;

                case MainMenuChoice.RUN_COMPREHENSIVE_TEST:
                    console.log(chalk.blue('Starting Comprehensive Scheduler Integration Test...'));
                    const testRunStartTime = new Date(); // Capture start time for log window

                    console.log(chalk.blue('Step 1: Seeding data for comprehensive_scheduler_test scenario...'));
                    const seedArgs = [
                        'db:seed:staging', // Your pnpm script that calls simulation/scripts/db/seed/index.ts
                        '--',
                        '--action', 'scenario',
                        '--name', 'comprehensive_scheduler_test',
                        '--techs', '4', // As defined in PRD, fixed at 4 for this test
                        '--baseline-metadata', BASELINE_METADATA_PATH, // Ensure BASELINE_METADATA_PATH is defined
                        '--output-metadata', CURRENT_SCENARIO_METADATA_PATH // Ensure CURRENT_SCENARIO_METADATA_PATH is defined
                    ];
                    success = await executeCommand('pnpm', seedArgs);
                    if (!success) {
                        console.error(chalk.red('Comprehensive test seeding failed. Aborting test run.'));
                    } else {
                        console.log(chalk.green('Comprehensive test seeding completed successfully.'));
                        
                        // Step 2: Trigger Scheduler Replan
                        console.log(chalk.blue('Step 2: Triggering scheduler replan...'));
                        const SCHEDULER_HOST_URL = 'http://localhost:3001'; // Ensure this is correct for your test env
                        let replanTriggered = false;
                        try {
                            const replanResponse = await fetch(`${SCHEDULER_HOST_URL}/run-replan`, { 
                                method: 'POST', 
                                headers: { 'Content-Type': 'application/json' },
                                // body: JSON.stringify({}) // If endpoint expects a body
                            });
                            if (!replanResponse.ok) {
                                const errorBody = await replanResponse.text();
                                throw new Error(`Scheduler replan trigger failed: ${replanResponse.status} ${replanResponse.statusText}. Body: ${errorBody}`);
                            }
                            console.log(chalk.green('Scheduler replan triggered successfully.'));
                            replanTriggered = true;
                        } catch (replanError: any) {
                            console.error(chalk.red('Failed to trigger scheduler replan:'), replanError.message);
                            success = false; // Mark overall success as false
                        }

                        if (replanTriggered && success) {
                            // Step 3: Execute Jest tests
                            console.log(chalk.blue('Step 3: Executing Jest tests for comprehensive_schedule.test.ts...'));
                            const jestTestPath = path.relative(PROJECT_ROOT, path.join(INTEGRATION_TESTS_DIR, 'comprehensive_schedule.test.ts')).replace(/\\/g, '/');
                            
                            // Add a small delay to allow the replan to fully process before Jest reads the DB.
                            // This is a pragmatic approach if waitForReplan is too complex here.
                            console.log(chalk.gray('Waiting a few seconds for replan to settle before running Jest...'));
                            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay

                            const jestSuccess = await executeCommand('pnpm', ['jest', jestTestPath]);
                            if (!jestSuccess) {
                                console.error(chalk.red('Comprehensive Jest tests failed.'));
                                success = false;
                            } else {
                                console.log(chalk.green('Comprehensive Jest tests passed successfully.'));
                            }

                            // Step 4: Capturing logs (Subtask 15.1, 15.2, 15.3)
                            console.log(chalk.blue('Step 4: Capturing logs for Comprehensive Scheduler Test...'));
                            const testRunEndTime = new Date(); // Capture end time for log window

                            const DEBUG_DIR = path.join(PROJECT_ROOT, 'debug');
                            try {
                                await fs.mkdir(DEBUG_DIR, { recursive: true });
                                const timestamp = testRunStartTime.toISOString().replace(/:/g, '-').replace(/\..+/, ''); // Use testRunStartTime for consistent naming
                                
                                const schedulerLogFilename = `comprehensive_test_scheduler_${timestamp}.log`;
                                const optimiserLogFilename = `comprehensive_test_optimiser_${timestamp}.log`;
                                
                                const schedulerLogPath = path.join(DEBUG_DIR, schedulerLogFilename);
                                const optimiserLogPath = path.join(DEBUG_DIR, optimiserLogFilename);

                                console.log(chalk.gray(`  Scheduler log will be saved to: ${schedulerLogPath}`));
                                console.log(chalk.gray(`  Optimiser log will be saved to: ${optimiserLogPath}`));

                                // Construct and execute Docker log commands (Subtask 15.2)
                                // Note: Using full command strings directly with executeCommand for redirection.
                                // Temporarily removing --since and --until for broader log capture debugging
                                const schedulerLogCmd = `docker logs test_scheduler > "${schedulerLogPath}" 2>&1`;
                                const optimiserLogCmd = `docker logs test_optimiser > "${optimiserLogPath}" 2>&1`;
                                
                                console.log(chalk.gray(`Executing: ${schedulerLogCmd}`));
                                const schedulerLogsSuccess = await executeCommand(schedulerLogCmd, []);
                                if (!schedulerLogsSuccess) {
                                    console.error(chalk.red('Failed to capture scheduler logs.'));
                                    // success = false; // Optionally mark overall as failed
                                }

                                console.log(chalk.gray(`Executing: ${optimiserLogCmd}`));
                                const optimiserLogsSuccess = await executeCommand(optimiserLogCmd, []);
                                if (!optimiserLogsSuccess) {
                                    console.error(chalk.red('Failed to capture optimiser logs.'));
                                    // success = false;
                                }

                                if (schedulerLogsSuccess && optimiserLogsSuccess) {
                                    console.log(chalk.green('Successfully captured logs.'));
                                }

                            } catch (dirError: any) {
                                console.error(chalk.red('Error during log capture setup:'), dirError.message);
                                // success = false; 
                            }
                        }
                    }
                    break;

                case MainMenuChoice.EXIT:
                    console.log(chalk.blue('Exiting runner.'));
                    return;
                default:
                    console.log(chalk.red('Invalid choice.'));
                    success = false;
            }

            if (!success) {
                console.log(chalk.red.bold('\nAction failed or was cancelled. Returning to main menu.'));
            }

            // Pause before showing menu again
            if (action !== MainMenuChoice.EXIT) {
                await inquirer.prompt([{ type: 'input', name: 'pause', message: '\nPress Enter to continue...'}]);
            }
        } catch (error) {
            console.error(chalk.red.bold('\nAn unhandled error occurred in the selected action:'), error);
            await inquirer.prompt([{ type: 'input', name: 'pause', message: '\nPress Enter to continue...'}]);
        }
    }
}

// Run the main menu function
mainMenu().catch((error) => {
    console.error(chalk.red.bold('Unhandled error in main menu:'), error);
    process.exit(1);
}); 