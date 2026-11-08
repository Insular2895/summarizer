import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.FLUID_WEB_TEST_PORT ?? 4176);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/app.spec.js",
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1024 } } },
    { name: "tablet", use: { viewport: { width: 900, height: 1024 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: `TRANSCRIPT_PUBLIC_FIXTURE=1 GEMINI_DEEP_DIVE_MOCK=1 TRANSCRIPT_STORE_BACKEND=memory MAXI_BRAIN_INBOX="$PWD/test-results/maxi-brain-inbox" npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
