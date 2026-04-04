import { test, expect } from '@playwright/test';
import { uid, register, login, logout } from './helpers';

/**
 * Persona: Maya — registers for the first time, then logs in on a second visit.
 * Edge cases covered: guest guard, auth guard, invalid credentials.
 */

const email = `maya-${uid()}@example.com`;
const password = 'SecurePass123!';
const name = 'Maya Chen';

test.describe('Authentication', () => {
  test('guest guard: /notes redirects to /login when not authenticated', async ({ page }) => {
    // Clear any existing session
    await page.goto('/notes');
    await expect(page).toHaveURL(/\/login/);
  });

  test('register: creates account and lands on notes page', async ({ page }) => {
    await register(page, name, email, password);

    await expect(page).toHaveURL(/\/notes/);
    // Sidebar should be visible with the "Notes" heading
    await expect(page.locator('.list-header__title')).toHaveText('Notes');
  });

  test('auth guard: /notes stays on notes after login', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/notes');
    await expect(page).toHaveURL(/\/notes/);
  });

  test('logout: clears session and redirects to /login', async ({ page }) => {
    await login(page, email, password);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test('guest guard: /register redirects to /notes when already logged in', async ({ page }) => {
    await login(page, email, password);
    await page.goto('/register');
    await expect(page).toHaveURL(/\/notes/);
  });

  test('invalid credentials: shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', 'wrong-password');
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page).toHaveURL(/\/login/); // stays on login
  });

  test('register: duplicate email shows error', async ({ page }) => {
    await page.goto('/register');
    await page.fill('#displayName', 'Duplicate');
    await page.fill('#email', email); // already registered above
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toBeVisible();
  });
});
