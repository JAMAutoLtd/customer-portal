#!/usr/bin/env node
import inquirer, { QuestionCollection, DistinctQuestion } from 'inquirer';
import chalk from 'chalk'; // For colored output
import { spawn } from 'child_process'; // Import spawn
import fs from 'fs/promises'; // Import fs promises
import path from 'path'; // Import path for resolving

// Define constants for metadata paths, resolving them to absolute paths
const BASELINE_METADATA_PATH = path.resolve(__dirname, '../../tests/integration/.baseline-metadata.json');
const CURRENT_SCENARIO_METADATA_PATH = path.resolve(__dirname, '../../tests/integration/.current-scenario-metadata.json');
const SCENARIOS_DIR = path.resolve(__dirname, './db/seed/scenarios');
const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '../../tests/integration/scheduler');

// --- Utility Functions --- //

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
 * Gets a list of available scenario names from the scenarios directory.
 * @returns Promise resolving to an array of scenario names.
 */
async function listScenarioFiles(): Promise<string[]> {
    try {
        const files = await fs.readdir(SCENARIOS_DIR);
        return files
            .filter(file => file.endsWith('.ts') && !file.startsWith('_') && file !== 'index.ts' && file !== 'types.ts')
            .map(file => file.replace('.ts', ''));
    } catch (error) {
        console.error(chalk.red('Error reading scenarios directory:'), error);
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
 * @param scenarioChoices An array of scenario names.
 * @returns Promise resolving to the selected scenario name or null if no scenarios are found.
 */
async function promptForScenario(scenarioChoices: string[]): Promise<string | null> {
    if (scenarioChoices.length === 0) {
        console.log(chalk.red('No scenario files found.'));
        return null;
    }
    const { scenarioName } = await inquirer.prompt([
        {
            type: 'list',
            name: 'scenarioName',
            message: 'Select a scenario:',
            choices: scenarioChoices,
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
    RUN_BACKEND_TESTS = 'Run Backend Integration Tests (Jest)',
    RUN_UI_TESTS = 'Run UI E2E Tests (Playwright)',
    RUN_SCENARIO_TEST = 'Run Specific Scenario Test (Seed -> Jest)',
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

                case MainMenuChoice.RUN_BACKEND_TESTS:
                    success = await executeCommand('pnpm', ['test:integration']);
                    break;

                case MainMenuChoice.RUN_UI_TESTS:
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
                        break;
                    }

                    // 2. Run the specific test file
                    console.log(chalk.blue(`\nStep 2: Running integration test for '${selectedScenarioTest}'...`));
                    const testFilePathAbsolute = path.join(INTEGRATION_TESTS_DIR, `${selectedScenarioTest}.test.ts`);
                    const testFileExists = await fileExists(testFilePathAbsolute);
                    if (!testFileExists) {
                        console.log(chalk.red(`Error: Test file not found at ${testFilePathAbsolute}`));
                        console.log(chalk.yellow('Please ensure a corresponding .test.ts file exists for the selected scenario.'));
                        success = false;
                        break;
                    }
                    // Use path relative to CWD for Jest argument, force forward slashes
                    const testFilePathRelative = path.relative(process.cwd(), testFilePathAbsolute).replace(/\\/g, '/'); // Force forward slashes
                    console.log(chalk.gray(` (Relative path: ${testFilePathRelative})`)); 
                    // Use jest directly to run the specific file, bypassing pnpm recursive script
                    success = await executeCommand('jest', [testFilePathRelative]);
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