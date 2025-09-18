import { defineConfig, devices } from '@playwright/test';

const DEFAULT_BASE_URL = 'https://pump.dexter.cash';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_BASE_URL;
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3052);
const RUN_LOCAL =
  process.env.PLAYWRIGHT_LOCAL === '1' ||
  BASE_URL.includes('127.0.0.1') ||
  BASE_URL.includes('localhost');

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: RUN_LOCAL
    ? {
        command: `npm run dev -- --port ${PORT}`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
});
