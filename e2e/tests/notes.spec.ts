import { test, expect } from '@playwright/test';
import { uid, register, login } from './helpers';

/**
 * Persona: Sam — casual user, creates and manages a handful of notes.
 * Edge cases: untitled note, auto-save indicator, search with no results.
 */

const email = `sam-${uid()}@example.com`;
const password = 'SecurePass123!';

test.describe('Notes CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, 'Sam Torres', email, password);
  });

  test('create a note: lands on editor with empty title', async ({ page }) => {
    await page.click('.btn-icon--new');
    await expect(page).toHaveURL(/\/notes\/.+/);
    await expect(page.locator('.editor__title')).toHaveValue('Untitled');
  });

  test('edit title: updates in the sidebar list', async ({ page }) => {
    await page.click('.btn-icon--new');

    const title = `My Note ${uid()}`;
    await page.fill('.editor__title', title);

    // Wait for auto-save (debounce 600ms + server round-trip)
    await page.waitForSelector('.status--saved', { timeout: 5000 });

    // Title should appear in sidebar
    await expect(page.locator('.note-item__title').first()).toContainText(title);
  });

  test('write content in TipTap editor', async ({ page }) => {
    await page.click('.btn-icon--new');
    await page.fill('.editor__title', `Content Note ${uid()}`);

    const editor = page.locator('.ProseMirror');
    await editor.click();
    await editor.type('Hello, TipTap world!');

    await page.waitForSelector('.status--saved', { timeout: 5000 });
    await expect(editor).toContainText('Hello, TipTap world!');
  });

  test('search: finds a note by title keyword', async ({ page }) => {
    // Create two notes
    const uniqueWord = `Zebra${uid()}`;
    await page.click('.btn-icon--new');
    await page.fill('.editor__title', `${uniqueWord} Note`);
    await page.waitForSelector('.status--saved', { timeout: 5000 });

    await page.click('.btn-icon--new');
    await page.fill('.editor__title', 'Other Note');
    await page.waitForSelector('.status--saved', { timeout: 5000 });

    // Search
    await page.fill('.search-input', uniqueWord);
    await page.waitForSelector('.search-status', { timeout: 3000 });

    const items = page.locator('.note-item');
    await expect(items).toHaveCount(1);
    await expect(items.first().locator('.note-item__title')).toContainText(uniqueWord);
  });

  test('search: empty state for no results', async ({ page }) => {
    await page.fill('.search-input', 'xyzzy-no-such-note-12345');
    await page.waitForSelector('.list-state--empty', { timeout: 3000 });
    await expect(page.locator('.list-state--empty')).toContainText('No notes match');
  });

  test('search clear: shows all notes again after clearing', async ({ page }) => {
    await page.fill('.search-input', 'something');
    await page.waitForSelector('.search-status', { timeout: 3000 });

    await page.click('.search-clear');
    await expect(page.locator('.search-input')).toHaveValue('');
    await expect(page.locator('.search-status')).not.toBeVisible();
  });

  test('delete note: removes from sidebar list', async ({ page }) => {
    await page.click('.btn-icon--new');
    const title = `Delete Me ${uid()}`;
    await page.fill('.editor__title', title);
    await page.waitForSelector('.status--saved', { timeout: 5000 });

    const countBefore = await page.locator('.note-item').count();
    await page.click('.btn-icon--danger');
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.locator('.note-item')).toHaveCount(countBefore - 1);
  });
});
