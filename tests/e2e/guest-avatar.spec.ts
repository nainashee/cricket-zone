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
    // Simulate a full expired Cognito session — all keys that storeAuth() would have set
    localStorage.setItem('cz_user_picture', 'https://lh3.googleusercontent.com/fake-google-photo');
    localStorage.setItem('cz_avatar_url', 'https://fake-cdn.example.com/avatars/old-user-sub');
    localStorage.setItem('cz_user_sub', 'old-cognito-sub-123');
    localStorage.setItem('cz_uid', 'old-cognito-sub-123');
    localStorage.setItem('cz_user_name', 'Hussain Ashfaque');
    localStorage.setItem('cz_user_email', 'nain.ashee@gmail.com');
    localStorage.setItem('cz3', JSON.stringify({ games: 19, wins: 19, best: 200, streak: 6, total: 1740 }));
    // Simulate the contaminated guest having already played today
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('howzat_last_played', today);
    localStorage.setItem('howzat_batting_last_played', today);
    localStorage.setItem('howzat_trivia_last_played', today);
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

  // Header streak and best score must be reset, not the old account's values
  await expect(page.locator('#hStreak')).not.toHaveText('6');
  await expect(page.locator('#hBest')).not.toHaveText('1740');
});

test('guest session gets a fresh guest ID, not the old authenticated user ID', async ({ page }) => {
  await enterGuestAfterExpiredSession(page);

  // cz_uid must now be a guest_* prefixed ID, not the old Cognito sub
  const uid = await page.evaluate(() => localStorage.getItem('cz_uid'));
  expect(uid).toMatch(/^guest_/);
  expect(uid).not.toBe('old-cognito-sub-123');

  // cz_user_sub must be gone so the leaderboard won't mark the old user as "YOU"
  const sub = await page.evaluate(() => localStorage.getItem('cz_user_sub'));
  expect(sub).toBeNull();
});

test('guest session clears played-today flags so daily challenges are playable', async ({ page }) => {
  await enterGuestAfterExpiredSession(page);

  const [bowling, batting, trivia] = await page.evaluate(() => [
    localStorage.getItem('howzat_last_played'),
    localStorage.getItem('howzat_batting_last_played'),
    localStorage.getItem('howzat_trivia_last_played'),
  ]);

  // All three flags must be null — the guest should be able to play all daily challenges
  expect(bowling).toBeNull();
  expect(batting).toBeNull();
  expect(trivia).toBeNull();
});
