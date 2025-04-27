import { test, expect } from '@playwright/test';
// import { LoginPage } from '../fixtures/LoginPage'; // Example POM import

test.describe('Order Placement', () => {
    const TEST_USER_EMAIL = 'e2e_customer@e2etest.jam-auto.com'; // Assumed pre-seeded user
    const TEST_USER_PASSWORD = 'Password123!';

    // Option 1: Login via UI before each test
    test.beforeEach(async ({ page }) => {
        await page.goto('/login'); // Adjust path if needed
        await page.getByLabel('Email').fill(TEST_USER_EMAIL);
        await page.getByLabel('Password').fill(TEST_USER_PASSWORD);
        await page.getByRole('button', { name: 'Login' }).click();
        // Wait for successful login, e.g., navigation to dashboard
        await expect(page).toHaveURL(/\/orders/); // Assuming redirect to orders page
    });

    // Option 2: Use POM for login (cleaner)
    // let loginPage: LoginPage;
    // test.beforeEach(async ({ page }) => {
    //     loginPage = new LoginPage(page);
    //     await loginPage.goto();
    //     await loginPage.login(TEST_USER_EMAIL, TEST_USER_PASSWORD);
    //     await expect(page).toHaveURL(/\/orders/);
    // });

    test('should allow a logged-in user to place a new order', async ({ page }) => {
        await page.goto('/order/new'); // Navigate to the new order form

        // Fill order form (use appropriate locators)
        await page.getByLabel('VIN').fill('TESTVIN1234567890'); // Example
        // Or select Year/Make/Model
        // await page.locator('#year-select').selectOption('2023');
        // await page.locator('#make-select').selectOption('Toyota');
        // await page.locator('#model-select').selectOption('Camry');

        // Fill address (assuming it's needed on the form)
        await page.getByLabel('Street Address').fill('123 Test St');
        await page.getByLabel('City').fill('Testerville');
        // ... other address fields

        // Select services (example using checkboxes or similar)
        await page.getByLabel('Oil Change').check();
        await page.getByLabel('Tire Rotation').check();

        // Select date/time (example)
        // await page.getByLabel('Preferred Date').fill('2024-10-26');

        await page.getByRole('button', { name: 'Submit Order' }).click(); // Adjust button text

        // Assert successful order placement
        await expect(page.locator('.success-message')).toBeVisible();
        await expect(page.locator('.success-message')).toContainText(/Order submitted successfully/i);
        await expect(page).toHaveURL(/\/orders/); // Assuming redirect back to orders list

        // Optional: Assert the new order appears in the list
        // await expect(page.locator('.order-list-item', { hasText: 'TESTVIN1234567890' })).toBeVisible();
    });

    test('should show errors if required fields are missing', async ({ page }) => {
        await page.goto('/order/new');

        // Attempt to submit without filling fields
        await page.getByRole('button', { name: 'Submit Order' }).click();

        // Assert error messages appear for required fields
        await expect(page.locator('.error-message[for="vin"]')).toBeVisible(); // Example error locator
        await expect(page.locator('.error-message[for="street_address"]')).toBeVisible();
        // ... check other required fields
    });

}); 