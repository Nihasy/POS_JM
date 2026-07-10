import { defineConfig } from '@playwright/test';

/**
 * E2E Playwright — l'app tourne en mode navigateur (sql.js en mémoire,
 * catalogue de démonstration). Chaque test part d'une base neuve
 * puisque la base vit dans la page.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 1420,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
