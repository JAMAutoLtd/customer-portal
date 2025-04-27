# E2E Framework Task: Stage 8 - CLI Runner Implementation

**Goal:** Develop the main interactive CLI script using `inquirer` to orchestrate the various E2E test actions (cleanup, seeding, running tests).
                            
**Dependencies:** All previous stages (Scripts for cleanup, seeding; Jest & Playwright configurations).

**Tasks:**

-   [ ] **Create Runner Script:**
    -   Create `simulation/scripts/e2e-runner.ts`.
-   [ ] **Import Dependencies:**
    -   Import `inquirer`.
    *   Import `execSync` or `spawn` from `child_process` to run pnpm scripts.
    *   Import necessary utility functions (e.g., `createStagingSupabaseClient`, potentially direct seeding/cleanup functions if not running via pnpm).
    *   Import `dotenv` to load `.env.test`.
-   [ ] **Implement Main Menu (`mainMenu` function):**
    -   Use `inquirer.prompt` to present the main options:
        -   Clean Staging DB
        -   Seed Baseline Data (prompt for technician count)
        -   Seed Specific Scenario (prompt for scenario name, use baseline settings)
        -   Run Backend Integration Tests (Jest)
        -   Run UI E2E Tests (Playwright)
        -   Run Full Scenario Test (Clean -> Seed -> Jest -> Playwright)
        -   Exit
-   [ ] **Implement Action Handlers:**
    -   Create `async` functions for each menu choice (e.g., `handleCleanDb`, `handleSeedBaseline`, `handleRunJest`, etc.).
    -   **Clean Staging DB:**
        -   Call `execSync('pnpm db:clean:staging', { stdio: 'inherit' })`.
        -   *(Alternative: Import and call `cleanupAllTestData` directly).* 
    -   **Seed Baseline:**
        -   Prompt for technician count (1-4) using `inquirer`.
        -   Call `execSync(\`pnpm db:seed:staging -- --action baseline --technicians \${count}\`, { stdio: 'inherit' })`.
        -   *(Alternative: Import and call `seedBaseline` directly).* 
    -   **Seed Specific Scenario:**
        -   List available scenario `.ts` files from `simulation/scripts/db/seed/scenarios/` (excluding `_baseline.ts`).
        -   Prompt user to select a scenario using `inquirer` (`type: 'list'`).
        -   Prompt for technician count.
        -   Call `execSync(\`pnpm db:seed:staging -- --action scenario --scenario \${scenarioName} --technicians \${count}\`, { stdio: 'inherit' })`.
        -   *(Alternative: Import and call baseline + specific scenario function directly).* 
    -   **Run Backend Tests:**
        -   Call `execSync('pnpm test:integration', { stdio: 'inherit' })`.
    -   **Run UI Tests:**
        -   Call `execSync('pnpm test:e2e:run', { stdio: 'inherit' })`.
    -   **Run Full Scenario Test:**
        -   Prompt for scenario and technician count.
        -   Call the handlers/scripts sequentially: Clean -> Seed (Baseline + Scenario) -> Jest -> Playwright.
        -   Handle errors at each step.
    -   **Exit:** Call `process.exit(0)`.
-   [ ] **Implement Main Loop:**
    -   Create an `async` main execution function.
    -   Use a `while (true)` loop.
    -   Call `mainMenu` inside the loop.
    -   Use a `switch` statement on the user's choice to call the appropriate handler function.
    -   Include `try...catch` blocks for error handling when executing child processes.
-   [ ] **Add `e2e:run` Script:**
    -   Add script to root `package.json`: `"e2e:run": "ts-node simulation/scripts/e2e-runner.ts"`
