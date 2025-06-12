import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker'; // Assuming faker is available

// Base URL is set in playwright.config.ts

test.describe('User Registration', () => {

    test('should allow a new user to register successfully', async ({ page }) => {
        const userEmail = `e2e_user_${Date.now()}@e2etest.jam-auto.com`;
        const userPassword = 'Password123!';

        await page.goto('/register'); // Adjust path if needed

        // Fill registration form (using appropriate locators)
        await page.getByLabel('Full Name').fill(faker.person.fullName()); // Example locator
        await page.getByLabel('Email').fill(userEmail);
        await page.getByLabel('Phone').fill(faker.phone.number()); // Use default format
        await page.getByLabel('Password', { exact: true }).fill(userPassword);
        await page.getByLabel('Confirm Password').fill(userPassword);
        // Add address fields if part of registration
        // await page.getByLabel('Street Address').fill(faker.location.streetAddress());
        // await page.getByLabel('City').fill(faker.location.city());
        // await page.getByLabel('State').fill(faker.location.state({ abbreviated: true }));
        // await page.getByLabel('Zip Code').fill(faker.location.zipCode());

        await page.getByRole('button', { name: 'Register' }).click();

        // Assert successful registration (e.g., redirect to login or dashboard)
        await expect(page).toHaveURL(/\/login/); // Or check for a success message
        // await expect(page.locator('.success-message')).toBeVisible();
    });

    test('should show an error if registering with an existing email', async ({ page }) => {
        const existingEmail = 'test@example.com'; // Assume this user exists from baseline seed

        await page.goto('/register');

        // Fill form with existing email
        await page.getByLabel('Email').fill(existingEmail);
        // ... fill other required fields ...

        await page.getByRole('button', { name: 'Register' }).click();

        // Assert error message is shown
        await expect(page.locator('.error-message')).toContainText(/email already exists/i);
        await expect(page).toHaveURL(/\/register/); // Should remain on registration page
    });

    test('should show an error for password mismatch', async ({ page }) => {
        await page.goto('/register');

        // Fill form with mismatching passwords
        await page.getByLabel('Password', { exact: true }).fill('Password123!');
        await page.getByLabel('Confirm Password').fill('DifferentPassword123!');
        // ... fill other required fields ...

        await page.getByRole('button', { name: 'Register' }).click();

        // Assert error message
        await expect(page.locator('.error-message')).toContainText(/passwords do not match/i);
    });

    // Add more tests for other invalid inputs as needed
}); 