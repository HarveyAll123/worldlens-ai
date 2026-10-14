import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use the pre-installed Chromium when present (cloud dev containers); otherwise Playwright's own.
const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
// Software WebGL (SwiftShader) by default so the suite runs in GPU-less CI containers.
// PW_GPU=1 uses the machine's real GPU instead (for performance measurements).
const webglArgs =
  process.env.PW_GPU === '1'
    ? ['--ignore-gpu-blocklist', '--enable-gpu']
    : [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ];

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    launchOptions: { args: webglArgs, ...(executablePath ? { executablePath } : {}) },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @worldlens/api start:node',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env.CI,
      env: {
        GDELT_ENABLED: 'false',
        WORLDLENS_TEST_PAYPAL_MOCK: '1',
        HISTORICAL_BASEMAPS_BASE_URL: 'http://127.0.0.1:5173/vendor/historical-basemaps/',
        ANTHROPIC_API_KEY: '',
        // Hermetic: never write test payments or news to a real database.
        DATABASE_URL: '',
      },
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @worldlens/web dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
});
