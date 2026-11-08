import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiKeySettingsDevPlugin } from "./scripts/api-key-settings-dev-plugin.mjs";
import { geminiDeepDiveDevPlugin } from "./scripts/gemini-deep-dive-dev-plugin.mjs";
import { maxiBrainDevPlugin } from "./scripts/maxi-brain-dev-plugin.mjs";
import { youtubeJobsDevPlugin } from "./scripts/youtube-jobs-dev-plugin.mjs";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), apiKeySettingsDevPlugin(), youtubeJobsDevPlugin(), maxiBrainDevPlugin(), geminiDeepDiveDevPlugin()],
});
