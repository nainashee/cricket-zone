import { test, expect } from '@playwright/test';
import { injectGuestAuth, stubApiCalls } from './fixtures/auth';

test.beforeEach(async ({ page }) => {
  await injectGuestAuth(page);
  await stubApiCalls(page);
});

test('landing page shows the Guess the Bowler card', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=GUESS THE BOWLER')).toBeVisible();
});

test('clicking Classic bowling starts the game and shows a clue', async ({ page }) => {
  await page.goto('/');

  // Click the bowling card to go to category selection
  await page.locator('#bowlingCard').click();

  // Click Classic mode
  await page.locator('text=Classic').first().click();

  // Game screen should be visible with at least one clue revealed
  await expect(page.locator('#gameScreen')).toBeVisible();
  await expect(page.locator('.clue-item').first()).toBeVisible();
});

test('submitting a guess shows feedback and advances the round', async ({ page }) => {
  await page.goto('/');
  await page.locator('#bowlingCard').click();
  await page.locator('text=Classic').first().click();

  // Type a guess in the input
  const input = page.locator('#guessInput');
  await expect(input).toBeVisible();
  await input.fill('Shoaib Akhtar');

  // Submit
  await page.locator('#submitBtn').click();

  // Should show result feedback (correct or wrong indicator)
  await expect(page.locator('.guess-result, .result-row, #feedbackMsg')).toBeVisible({ timeout: 5000 });
});

test('completing all rounds reaches the final results screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#bowlingCard').click();
  await page.locator('text=Classic').first().click();

  // Skip through all 5 rounds by passing each one
  for (let i = 0; i < 5; i++) {
    await page.locator('#guessInput').fill('skip');
    await page.locator('#submitBtn').click();
    // Wait for next round or final screen
    await page.waitForTimeout(500);
  }

  // Final screen should appear
  await expect(page.locator('#finalScreen, #resultScreen')).toBeVisible({ timeout: 10000 });
});
