import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../backend/', import.meta.url));
const backendTestEnv = new URL('../backend/.env.test.local', import.meta.url);

if (existsSync(backendTestEnv)) {
  process.loadEnvFile?.(backendTestEnv);
}

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5177',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
  },
  webServer: [
    {
      command: 'node --env-file=.env.test.local src/server.js',
      cwd: backend,
      env: {
        PORT: '3000', FRONTEND_ORIGIN: 'http://localhost:5177',
        AUTH_TEST_REGISTRATION_LIMIT: '100', AUTH_TEST_LOGIN_LIMIT: '100',
        GOOGLE_CLIENT_ID: 'google-e2e-web-client', AUTH_TEST_GOOGLE_SECRET: 'google-e2e-signature-only',
      },
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --host localhost --port 5177 --strictPort',
      env: { VITE_GOOGLE_CLIENT_ID: 'google-e2e-web-client', VITE_GOOGLE_TEST_MODE: '1' },
      url: 'http://localhost:5177',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
