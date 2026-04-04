import { Page } from '@playwright/test';

/** Unique email suffix per test run to avoid conflicts */
export const uid = () => Date.now().toString(36);

export async function register(page: Page, name: string, email: string, password: string) {
  await page.goto('/register');
  await page.fill('#displayName', name);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  // Wait for redirect to notes
  await page.waitForURL('**/notes');
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/notes');
}

export async function logout(page: Page) {
  await page.click('.btn-icon--logout');
  await page.waitForURL('**/login');
}
