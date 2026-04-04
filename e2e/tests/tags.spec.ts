import { test, expect } from '@playwright/test';
import { uid, register } from './helpers';

/**
 * Persona: Maya (power user) — heavy use of tags to organise notes.
 * Edge cases: duplicate tag (409), tag filter, tag deletion.
 */

const email = `maya-tags-${uid()}@example.com`;
const password = 'SecurePass123!';
const tagName = `Tag${uid()}`;

test.describe('Tags', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, 'Maya Chen', email, password);
  });

  async function openTagForm(page: any) {
    await page.click('.tag-mgr__add-btn');
    await expect(page.locator('.tag-form')).toBeVisible();
  }

  test('create a tag: appears in the tag list', async ({ page }) => {
    await openTagForm(page);
    await page.fill('.tag-form__input', tagName);
    await page.click('.tag-form__submit');

    await expect(page.locator('.tag-item__name').first()).toHaveText(tagName);
  });

  test('duplicate tag: shows 409 error message', async ({ page }) => {
    // Create it once
    await openTagForm(page);
    await page.fill('.tag-form__input', tagName);
    await page.click('.tag-form__submit');
    await expect(page.locator('.tag-item__name').first()).toHaveText(tagName);

    // Try to create it again
    await openTagForm(page);
    await page.fill('.tag-form__input', tagName);
    await page.click('.tag-form__submit');
    await expect(page.locator('.tag-form__error')).toContainText('already exists');
  });

  test('attach tag to note via tag picker', async ({ page }) => {
    // Ensure tag exists
    await openTagForm(page);
    await page.fill('.tag-form__input', `Picker${uid()}`);
    await page.click('.tag-form__submit');

    // Create a note
    await page.click('.btn-icon--new');
    await expect(page).toHaveURL(/\/notes\/.+/);

    // Open tag picker and attach
    await page.click('.btn-icon[title="Manage tags"]');
    await expect(page.locator('.tag-picker')).toBeVisible();
    await page.locator('.tag-option').first().click();

    // Tag appears below title
    await expect(page.locator('.attached-tag').first()).toBeVisible();
  });

  test('tag filter: shows only tagged notes', async ({ page }) => {
    const filterTag = `Filter${uid()}`;

    // Create tag
    await openTagForm(page);
    await page.fill('.tag-form__input', filterTag);
    await page.click('.tag-form__submit');

    // Create two notes, attach tag to first
    await page.click('.btn-icon--new');
    await page.fill('.editor__title', `Tagged Note ${uid()}`);
    await page.click('.btn-icon[title="Manage tags"]');
    await page.locator('.tag-option', { hasText: filterTag }).click();
    await page.waitForSelector('.status--saved', { timeout: 5000 });

    await page.click('.btn-icon--new');
    await page.fill('.editor__title', `Untagged Note ${uid()}`);
    await page.waitForSelector('.status--saved', { timeout: 5000 });

    // Filter by tag
    await page.locator('.tag-pill', { hasText: filterTag }).click();
    await expect(page.locator('.note-item')).toHaveCount(1);
    await expect(page.locator('.note-item__title').first()).toContainText('Tagged Note');
  });

  test('delete tag: removes from tag list', async ({ page }) => {
    const delTag = `Del${uid()}`;
    await openTagForm(page);
    await page.fill('.tag-form__input', delTag);
    await page.click('.tag-form__submit');

    const item = page.locator('.tag-item', { hasText: delTag });
    await expect(item).toBeVisible();

    // Hover to reveal delete button, then click
    await item.hover();
    await item.locator('.tag-item__delete').click();
    await expect(item).not.toBeVisible();
  });
});
