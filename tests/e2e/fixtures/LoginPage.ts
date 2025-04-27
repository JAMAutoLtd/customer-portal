import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
    readonly page: Page;
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly loginButton: Locator;
    readonly errorMessage: Locator; // Example error locator

    constructor(page: Page) {
        this.page = page;
        // Adjust locators based on actual HTML structure
        this.emailInput = page.getByLabel('Email');
        this.passwordInput = page.getByLabel('Password');
        this.loginButton = page.getByRole('button', { name: /login/i }); // Case-insensitive match
        this.errorMessage = page.locator('.error-message'); // Adjust selector
    }

    async goto() {
        await this.page.goto('/login'); // Adjust path if needed
    }

    async login(email: string, password: string) {
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }

    async getErrorMessage(): Promise<string | null> {
      if (await this.errorMessage.isVisible()) {
        return this.errorMessage.textContent();
      }
      return null;
    }
} 