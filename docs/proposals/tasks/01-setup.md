# E2E Framework Task: Stage 1 - Foundational Setup

**Goal:** Establish the basic project structure, install dependencies, configure environment variables, and 
set up testing frameworks for the E2E testing suite.
                            
**Tasks:**

-   [ ] **Install Root Dependencies:**
    -   Ensure the following are added as **dev dependencies** to the **root** `
package.json` using `pnpm add -D -w`:
                                    -   `ts-node`
        -   `typescript`
        -   `@types/node`
        -   `@faker-js/faker`
        -   `@types/faker` (if available/needed)
        -   `inquirer`
        -   `@types/inquirer`
        -   `dotenv`
        -   `jest`
        -   `ts-jest`
        -   `@types/jest`
        -   `@playwright/test`
    -   Ensure the following is added as a **workspace dependency** (`pnpm add -w`):
        -   `@supabase/supabase-js`

-   [ ] **Configure Playwright:**
    -   Create `tests/e2e/playwright.config.ts`.
    -   Configure `baseURL` to read from `process.env.E2E_BASE_URL`.
    -   Set up desired projects (e.g., Chromium).
    -   Add basic reporter (e.g., `html`).
    -   Create `tests/e2e/package.json` if managing Playwright dependencies separately, otherwise ensure they are in the root `package.json`.
                                -   Add `test:e2e:run` script to root `package.json`: `"test:e2e:run": "playwright test --config=tests/e2e/playwright.config.ts"`
                            -   [ ] **Configure Jest (Integration):**
    *   Create `tests/integration/jest.config.integration.js` (or decide to use root Jest config).
    *   Configure `preset: 'ts-jest'`, `testEnvironment: 'node'`.
    *   Set `rootDir: './'` (relative to the config file).
    *   Define `testMatch` to target files like `tests/integration/scheduler/**/*.test.ts`.
    *   Add `setupFiles: ['dotenv/config']` to load environment variables (ensure `dotenv` uses `.env.test`). Consider a dedicated setup file if more complex logic is needed.
                                *   Add `test:integration` script to root `package.json`: `"test:integration": "jest --config=tests/integration/jest.config.integration.js"` (adjust path if needed).
                            -   [ ] **Update Root `.gitignore`:** Ensure build artifacts, logs, environment files (`.env*`), and potentially `simulation/seed-metadata.json` are ignored.
                            -   [ ] **Verify Directory Structure:** Ensure the directories outlined in the plan (`simulation/scripts/`, `tests/e2e/`, `tests/integration/`) exist. 