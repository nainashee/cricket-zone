import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 30000,
  use: {
    // Point at the dev S3 static site or a local file server.
    // Override with BASE_URL env var in CI.
    baseURL: process.env.BASE_URL || 'http://cricket-zone-frontend-hussain-dev.s3-website-us-east-1.amazonaws.com',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
