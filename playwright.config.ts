import { defineConfig } from '@playwright/test';

// Uses the Edge already installed on Windows: no browser download.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3200',
    channel: 'msedge',
    headless: true,
    launchOptions: { args: ['--headless=new'] },
  },
});
