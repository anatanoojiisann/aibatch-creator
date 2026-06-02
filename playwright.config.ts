import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: {
    timeout: 20_000
  },
  use: {
    baseURL: "http://127.0.0.1:3020",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run build && npx next start -p 3020",
    url: "http://127.0.0.1:3020/video-workflow",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
