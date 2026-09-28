import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  use: {
    baseURL: 'http://localhost:5177',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
  },
});
