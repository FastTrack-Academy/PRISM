import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 180000,
  workers: 1,
  outputDir: process.env.TEMP
    ? `${process.env.TEMP}/prism-playwright-results`
    : '/tmp/prism-playwright-results',
  use: {
    baseURL: process.env.PRISM_TEST_URL || 'http://127.0.0.1:3000',
    viewport: { width: 1536, height: 1024 },
    launchOptions: { channel: 'chrome' },
    acceptDownloads: true,
  },
  reporter: 'list',
});
