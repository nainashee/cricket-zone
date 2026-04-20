import { Page } from '@playwright/test';

/**
 * Inject guest auth state into localStorage before the page loads.
 * The game uses cz_name for guest display and cz_uid for guest tracking.
 */
export async function injectGuestAuth(page: Page, name = 'E2ETester') {
  await page.addInitScript((guestName: string) => {
    const guestId = 'guest_e2etest123';
    localStorage.setItem('cz_name', guestName);
    localStorage.setItem('cz_uid', guestId);
  }, name);
}

/**
 * Intercept all leaderboard and score API calls with empty/success stubs.
 * Prevents real AWS calls during E2E tests so tests are deterministic.
 */
export async function stubApiCalls(page: Page) {
  await page.route('**\/leaderboard*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leaderboard: [] }) })
  );
  await page.route('**\/score*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Score saved', scoreId: 'bowling#2024-01-01#test' }) })
  );
  await page.route('**\/played-today*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ played: false, bowlingPlayed: false, battingPlayed: false, triviaPlayed: false }) })
  );
  await page.route('**\/daily*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ category: 'bowling', date: new Date().toISOString().split('T')[0], bowler: 'akhtar' }) })
  );
}
