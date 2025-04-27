import inquirer from 'inquirer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.test
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.test') });

// --- Helper Functions ---

function runCommand(command: string) {
    console.log(`\n> Running: ${command}\n`);
    try {
        execSync(command, { stdio: 'inherit' });
        console.log(`\n> Command finished successfully.\n`);
        return true;
    } catch (error) {
        console.error(`\n> Command failed: ${command}\n`);
        // Error is already printed to stdio
        return false;
    }
}

function getScenarioNames(): string[] {
    const scenariosDir = path.join(__dirname, 'db', 'seed', 'scenarios');
    try {
        return fs.readdirSync(scenariosDir)
            .filter(file => file.endsWith('.ts') && !file.startsWith('_') && file !== 'index.ts')
            .map(file => file.replace('.ts', ''));
    } catch (error) {
        console.error('Error reading scenario directory:', error);
        return [];
    }
}

// --- Action Handlers ---

async function handleCleanDb() {
    console.log('--- Cleaning Staging DB ---');
    runCommand('pnpm db:clean:staging');
}

async function handleSeedBaseline() {
    console.log('--- Seeding Baseline Data ---');
    const { techCount } = await inquirer.prompt([
        {
            type: 'number',
            name: 'techCount',
            message: 'Number of baseline technicians (1-4):',
            default: 4,
            validate: (input) => {
                if (input === undefined || isNaN(input)) return 'Please enter a number.';
                return (input >= 1 && input <= 4) || 'Please enter a number between 1 and 4.';
            }
        },
    ]);
    runCommand(`pnpm db:seed:staging -- --action baseline --techs ${techCount}`);
}

async function handleSeedScenario() {
    console.log('--- Seeding Specific Scenario ---');
    const scenarioNames = getScenarioNames();
    if (scenarioNames.length === 0) {
        console.log('No scenario files found in simulation/scripts/db/seed/scenarios/');
        return;
    }

    const { scenarioName, techCount } = await inquirer.prompt([
        {
            type: 'list',
            name: 'scenarioName',
            message: 'Select scenario to seed:',
            choices: scenarioNames,
        },
        {
            type: 'number',
            name: 'techCount',
            message: 'Number of baseline technicians to include (1-4):',
            default: 4,
            validate: (input) => {
                if (input === undefined || isNaN(input)) return 'Please enter a number.';
                return (input >= 1 && input <= 4) || 'Please enter a number between 1 and 4.';
            }
        },
    ]);

    // Run baseline AND scenario
    runCommand(`pnpm db:seed:staging -- --action both --scenario ${scenarioName} --techs ${techCount}`);
}

async function handleRunJest() {
    console.log('--- Running Backend Integration Tests (Jest) ---');
    runCommand('pnpm test:integration');
}

async function handleRunPlaywright() {
    console.log('--- Running UI E2E Tests (Playwright) ---');
    // Ensure necessary env vars for Playwright are set (handled by dotenv load)
    console.log(`Using Base URL: ${process.env.E2E_BASE_URL}`);
    console.log(`Using Scheduler URL (for Jest tests): ${process.env.E2E_SCHEDULER_URL}`);
    runCommand('pnpm test:e2e:run');
}

async function handleFullScenarioTest() {
    console.log('--- Running Full Scenario Test ---');
    const scenarioNames = getScenarioNames();
    if (scenarioNames.length === 0) {
        console.log('No scenario files found.');
        return;
    }

    const { scenarioName, techCount } = await inquirer.prompt([
        {
            type: 'list',
            name: 'scenarioName',
            message: 'Select scenario for the full test run:',
            choices: scenarioNames,
        },
        {
            type: 'number',
            name: 'techCount',
            message: 'Number of baseline technicians (1-4):',
            default: 4,
            validate: (input) => {
                if (input === undefined || isNaN(input)) return 'Please enter a number.';
                return (input >= 1 && input <= 4) || 'Please enter a number between 1 and 4.';
            }
        },
    ]);

    console.log(`\nStarting full test run for scenario: ${scenarioName} with ${techCount} technicians...\n`);

    // 1. Clean
    if (!runCommand('pnpm db:clean:staging')) return; // Stop if clean fails

    // 2. Seed (Baseline + Scenario)
    if (!runCommand(`pnpm db:seed:staging -- --action both --scenario ${scenarioName} --techs ${techCount}`)) return; // Stop if seed fails

    // 3. Run Backend Tests
    if (!runCommand('pnpm test:integration')) {
        console.log('Backend tests failed. Skipping UI tests.');
        // Optionally ask user if they want to proceed anyway
        return;
    };

    // 4. Run UI Tests
    runCommand('pnpm test:e2e:run');

    console.log(`\nFull test run for scenario: ${scenarioName} completed.\n`);
}

// --- Main Menu --- 

async function mainMenu() {
    const choices = [
        { name: 'Clean Staging DB', value: 'clean' },
        { name: 'Seed Baseline Data', value: 'seedBaseline' },
        { name: 'Seed Specific Scenario (Baseline + Scenario)', value: 'seedScenario' },
        { name: 'Run Backend Integration Tests (Jest)', value: 'runJest' },
        { name: 'Run UI E2E Tests (Playwright)', value: 'runPlaywright' },
        new inquirer.Separator(),
        { name: 'Run Full Scenario Test (Clean -> Seed -> Jest -> Playwright)', value: 'fullTest' },
        new inquirer.Separator(),
        { name: 'Exit', value: 'exit' },
    ];

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'E2E Test Runner - Select Action:',
            choices: choices,
        },
    ]);

    return action;
}

// --- Main Execution Loop ---

async function run() {
    console.clear();
    console.log('====================================');
    console.log(' JAM Auto E2E Test Runner ');
    console.log('====================================\n');

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const action = await mainMenu();

        try {
            switch (action) {
                case 'clean':
                    await handleCleanDb();
                    break;
                case 'seedBaseline':
                    await handleSeedBaseline();
                    break;
                case 'seedScenario':
                    await handleSeedScenario();
                    break;
                case 'runJest':
                    await handleRunJest();
                    break;
                case 'runPlaywright':
                    await handleRunPlaywright();
                    break;
                case 'fullTest':
                    await handleFullScenarioTest();
                    break;
                case 'exit':
                    console.log('Exiting runner.');
                    process.exit(0);
                default:
                    console.log('Invalid action selected.');
            }
        } catch (error) {
            console.error('\n--- An error occurred during action execution: ---');
            // execSync already prints errors, but catch other potential issues
            if (error instanceof Error) {
                 console.error(error.message);
            } else {
                 console.error(error);
            }
            console.error('--------------------------------------------------\n');
        }
        
        // Pause for user to see output before showing menu again
        await inquirer.prompt([{ type: 'input', name: 'pause', message: 'Press Enter to continue...'}]);
        console.clear(); // Clear console for next menu display
    }
}

run().catch(error => {
    console.error('Unhandled error in runner:', error);
    process.exit(1);
});
