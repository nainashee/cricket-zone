import { test, expect } from '@playwright/test';
import { stubApiCalls } from './fixtures/auth';

/**
 * Regression test for: guest sessions inheriting a previous authenticated
 * user's avatar when the Cognito session expired without an explicit Sign Out.
 *
 * Before the fix, cz_user_picture / cz_avatar_url were left in localStorage
 * after token expiry. continueAsGuest() now removes them, so the header
 * avatar must always be an initials SVG (data URI) for guest users.
 */
test('guest session does not show previous authenticated user avatar', async ({ page }) => {
  // Simulate an expired Cognito session: picture keys are still in localStorage
  // but there is no valid id token and no guest session flag.
  await page.addInitScript(() => {
    localStorage.setItem('cz_user_picture', 'https://lh3.googleusercontent.com/fake-google-photo');
    localStorage.setItem('cz_avatar_url', 'https://fake-cdn.example.com/avatars/old-user-id');
    // Deliberately do NOT set cz_id_token → isTokenValid() returns false
    // Deliberately do NOT set sessionStorage cz_guest → isGuest() returns false
    // This triggers showAuthModal() on boot, matching the expired-session scenario
  });

  await stubApiCalls(page);
  await page.goto('/');

  // Auth modal should appear because there is no valid token and no guest session
  await expect(page.locator('#authGuestBtn')).toBeVisible({ timeout: 5000 });

  // Go through guest flow
  await page.locator('#authGuestBtn').click();
  await page.locator('#afGuestName').fill('TestGuest');
  await page.keyboard.press('Enter');

  // Landing screen should now be visible
  await expect(page.locator('#landingScreen')).toBeVisible({ timeout: 5000 });

  // Header avatar must be an initials SVG data URI — not the old picture URL
  const avatarImg = page.locator('#hAvatarBtn img');
  await expect(avatarImg).toBeVisible();
  const src = await avatarImg.getAttribute('src');
  expect(src).toMatch(/^data:image\/svg\+xml/);
  expect(src).not.toContain('googleusercontent.com');
  expect(src).not.toContain('fake-cdn.example.com');
});
