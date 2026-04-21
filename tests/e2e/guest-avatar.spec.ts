import { test, expect } from '@playwright/test';
import { stubApiCalls } from './fixtures/auth';

/**
 * Regression tests for: guest sessions inheriting a previous authenticated
 * user's avatar and stats when the Cognito session expired without Sign Out.
 *
 * Before the fix, cz_user_picture, cz_avatar_url, and cz3 (streak/score/games)
 * were left in localStorage after token expiry. continueAsGuest() now removes
 * all of them so guests always start with a clean slate.
 */

// Helper: load the page with stale auth-session data in localStorage,
// then complete the guest flow. Returns after the landing screen is visible.
async function enterGuestAfterExpiredSession(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem('cz_user_picture', 'https://lh3.googleusercontent.com/fake-google-photo');
    localStorage.setItem('cz_avatar_url', 'https://fake-cdn.example.com/avatars/old-user-id');
    localStorage.setItem('cz3', JSON.stringify({ games: 16, wins: 16, best: 200, streak: 6, total: 1740 }));
    // No cz_id_token → isTokenValid() false; no sessionStorage cz_guest → isGuest() false
  });

  await stubApiCalls(page);
  await page.goto('/');

  await expect(page.locator('#authGuestBtn')).toBeVisible({ timeout: 5000 });
  await page.locator('#authGuestBtn').click();
  await page.locator('#afGuestName').fill('TestGuest');
  await page.keyboard.press('Enter');

  await expect(page.locator('#landingScreen')).toBeVisible({ timeout: 5000 });
}

test('guest session does not show previous authenticated user avatar', async ({ page }) => {
  await enterGuestAfterExpiredSession(page);

  const avatarImg = page.locator('#hAvatarBtn img');
  await expect(avatarImg).toBeVisible();
  const src = await avatarImg.getAttribute('src');
  expect(src).toMatch(/^data:image\/svg\+xml/);
  expect(src).not.toContain('googleusercontent.com');
  expect(src).not.toContain('fake-cdn.example.com');
});

test('guest session does not show previous authenticated user streak and score', async ({ page }) => {
  await enterGuestAfterExpiredSession(page);

  // Header streak and best score must be reset to 0 / empty, not the old account's values
  await expect(page.locator('#hStreak')).not.toHaveText('6');
  await expect(page.locator('#hBest')).not.toHaveText('1740');
});
