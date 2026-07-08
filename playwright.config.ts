import { defineConfig } from '@playwright/test'

/**
 * The Keystone CI gates are static: filesystem reads over migrations,
 * routes, and tokens, no browser and no server. Config adapted from the
 * Trellis playwright.config.ts with the opt-in server lifecycle kept for
 * the day real browser runs arrive (Ring 1's 390px checks run manually
 * against a deploy; automated browser suites are a later decision).
 *
 * Opt into an auto-started server with PLAYWRIGHT_AUTO_SERVER=1; CI
 * keeps server lifecycle in the workflow YAML where it is explicit.
 */
const autoServer = process.env.PLAYWRIGHT_AUTO_SERVER === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  },
  projects: [{ name: 'gates' }],
  webServer: autoServer
    ? {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
})
