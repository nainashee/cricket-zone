import { test, expect } from '@playwright/test';
import { injectGuestAuth, stubApiCalls } from './fixtures/auth';

test.beforeEach(async ({ page }) => {
  await injectGuestAuth(page);
  await stubApiCalls(page);
  // Stub trivia.json fetch with minimal valid data
  await page.route('**/assets/trivia.json', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { question: 'Q1?', options: ['A. a', 'B. b', 'C. c', 'D. d'], answer: 'A', explanation: 'Explanation 1' },
        { question: 'Q2?', options: ['A. a', 'B. b', 'C. c', 'D. d'], answer: 'B', explanation: 'Explanation 2' },
        { question: 'Q3?', options: ['A. a', 'B. b', 'C. c', 'D. d'], answer: 'C', explanation: 'Explanation 3' },
        { question: 'Q4?', options: ['A. a', 'B. b', 'C. c', 'D. d'], answer: 'D', explanation: 'Explanation 4' },
        { question: 'Q5?', options: ['A. a', 'B. b', 'C. c', 'D. d'], answer: 'A', explanation: 'Explanation 5' },
      ]),
    })
  );
});

test('landing page shows the Cricket Trivia card', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=CRICKET')).toBeVisible();
  await expect(page.locator('text=TRIVIA')).toBeVisible();
});

test('clicking trivia shows intro screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#triviaCard').click();
  await expect(page.locator('#triviaIntroScreen')).toBeVisible();
});

test('starting trivia shows first question', async ({ page }) => {
  await page.goto('/');
  await page.locator('#triviaCard').click();
  await page.locator('text=Start Quiz').click();
  await expect(page.locator('#triviaScreen')).toBeVisible();
  // At least one answer option should be visible
  await expect(page.locator('.triv-opt').first()).toBeVisible();
});

test('answering all trivia questions reaches the result screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#triviaCard').click();
  await page.locator('text=Start Quiz').click();

  // Answer 5 questions by clicking the first option each time
  for (let i = 0; i < 5; i++) {
    await page.locator('.triv-opt').first().click();
    await page.waitForTimeout(1500); // wait for timer/transition
  }

  await expect(page.locator('#triviaResultScreen')).toBeVisible({ timeout: 10000 });
});
