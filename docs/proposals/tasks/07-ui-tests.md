# E2E Framework Task: Stage 7 - UI E2E Tests (Playwright)

**Goal:** Develop Playwright tests to simulate user interactions with the web UI, focusing on registration and order placement flows.
                            
**Dependencies:** Stage 1 (Playwright Setup), Stage 3 (Baseline Seeding), Stage 4 (Cleanup - called by baseline). Docker services (`web`, simulated DB/API) must be running.

**Tasks:**

-   [ ] **Create Test Directory:**
    -   Ensure `tests/e2e/specs/` exists.
-   [ ] **Implement Test Files (`*.spec.ts`):**
    -   Create separate `.spec.ts` files for distinct flows (e.g., `registration.spec.ts`, `order_placement.spec.ts`).
                                *   **Structure (per file):**
        *   Import `test`, `expect` from `@playwright/test`.
        *   Import necessary helpers (e.g., page object models if used).
        *   Load environment variables (`E2E_BASE_URL`).
        *   **(Seeding Prerequisite):** Similar to Jest tests, assume the baseline data (including at least one non-test user for placing orders, potentially test vehicles) has been seeded **externally** before running Playwright tests.
        *   Use `test.describe` to group related tests.
        *   Use `test` blocks for individual test cases.
        *   Use `page.goto('/')` to navigate to the base URL.
        *   Use Playwright locators (`page.getByRole`, `page.getByLabel`, `page.locator`) to interact with elements.
        *   Use `expect` assertions (`expect(locator).toBeVisible()`, `expect(page).toHaveURL(...)`) to verify UI state and navigation.
    *   **`registration.spec.ts`:**
        *   Test case: Successful registration with a new, unique test email (e.g., using a timestamp or faker).
        *   Test case: Attempt registration with an existing email (should fail gracefully).
        *   Test case: Attempt registration with invalid input (e.g., password mismatch).
    *   **`order_placement.spec.ts`:**
        *   Requires a logged-in state. Consider:
            *   Programmatic login (API call or setting auth cookies - more complex setup).
            *   UI-based login in a `beforeEach` hook using a pre-seeded test user.
        *   Test case: Navigate to the order form, fill in details (address, vehicle, service, date), submit, and verify success message/navigation.
        *   Test case: Attempt order placement with missing required fields.
-   [ ] **(Optional) Implement Page Object Models (POM):**
    -   Create files in `tests/e2e/fixtures/` (or similar) to encapsulate interactions with specific pages/components (e.g., `LoginPage`, `OrderFormPage`). This improves test maintainability.
                                *   Example `LoginPage.ts`:
        ```typescript
        import { Page, Locator } from '@playwright/test';

        export class LoginPage {
            readonly page: Page;
            readonly emailInput: Locator;
            readonly passwordInput: Locator;
            readonly loginButton: Locator;

            constructor(page: Page) {
                this.page = page;
                this.emailInput = page.getByLabel('Email');
                this.passwordInput = page.getByLabel('Password');
                this.loginButton = page.getByRole('button', { name: 'Login' });
            }

            async goto() {
                await this.page.goto('/login');
            }

            async login(email: string, password: string) {
                await this.emailInput.fill(email);
                await this.passwordInput.fill(password);
                await this.loginButton.click();
            }
        }
        ```
-   [ ] **Update Playwright Config (`playwright.config.ts`):**
    -   Ensure `testDir: './specs'` is set.
    -   Configure `use: { baseURL: process.env.E2E_BASE_URL }`.
    -   Consider adding screenshot/trace options on failure. 