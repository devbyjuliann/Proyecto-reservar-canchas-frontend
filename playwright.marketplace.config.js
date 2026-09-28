import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const frontend = fileURLToPath(new URL('./', import.meta.url));
const backend = fileURLToPath(new URL('../backend/', import.meta.url));

export default defineConfig({
  testDir: './test/e2e',
  use: {
    baseURL: 'http://localhost:5187',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --env-file=.env.test.local src/server.js',
      cwd: backend,
      env: { PORT: '3107', FRONTEND_ORIGIN: 'http://localhost:5187' },
      url: 'http://127.0.0.1:3107/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --host localhost --port 5187 --strictPort',
      cwd: frontend,
      env: { VITE_API_URL: 'http://localhost:3107' },
      url: 'http://localhost:5187',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
