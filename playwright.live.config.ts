import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/live",
  fullyParallel: false,
  timeout: 90_000,
  expect: {
    timeout: 60_000,
  },
  use: {
    baseURL: process.env.LIVE_BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: process.env.LIVE_BASE_URL
    ? undefined
    : {
        command: "APP_HOST=127.0.0.1 APP_PORT=4173 npm run dev",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
      },
  projects: [
    {
      name: "chromium-live",
      use: { browserName: "chromium" },
    },
  ],
});
