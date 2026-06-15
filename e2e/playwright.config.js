// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 3001;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node src/app.js',
      cwd: '../backend',
      port: BACKEND_PORT,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { NODE_ENV: 'test', CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}` },
    },
    {
      command: 'npm run dev',
      cwd: '../frontend',
      port: FRONTEND_PORT,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
